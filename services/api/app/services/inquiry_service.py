"""Information-inquiry storage.

PostgreSQL is the production store (``inquiry`` table): inquiries survive a
redeploy and are queryable. The append-only JSONL file under
``<repo>/data/interim/inquiries/`` remains as the **development / test** backend,
used when no database is available, so the public route keeps working on a fresh
clone and the API test-suite stays database-independent.

Which backend answered is decided by :func:`_database_enabled`. Under
``CANONICAL_DATA_MODE=required`` a database that cannot serve the write is a hard
failure (``DATABASE_UNAVAILABLE``) - a required-mode deployment must never
silently persist resident submissions to a file that the next deploy discards.

Privacy model
-------------

Reading an inquiry back requires the secret ``receipt_token`` issued at creation.
The token is never derivable from the public ``id`` and is never returned by any
listing endpoint. The database stores only a SHA-256 hash of the token, so a
database disclosure cannot be replayed. On an idempotent retry the token is
rotated and the fresh value is returned once, because the original plaintext is
deliberately unrecoverable.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import REPO_ROOT, get_settings
from app.repositories.dataset_repository import CanonicalDataUnavailable

INQUIRY_DIR = REPO_ROOT / "data" / "interim" / "inquiries"
INQUIRY_FILE = INQUIRY_DIR / "inquiries.jsonl"

_LOCK = threading.Lock()
MAX_LIST = 200

# Fields that are personal data and must never leave the service through a
# public (unauthenticated) endpoint.
PII_FIELDS = ("message", "contact_name", "contact_email", "organization")


def _ensure_dir() -> None:
    INQUIRY_DIR.mkdir(parents=True, exist_ok=True)


def _read_all() -> list[dict]:
    if not INQUIRY_FILE.exists():
        return []
    rows: list[dict] = []
    try:
        content = INQUIRY_FILE.read_text(encoding="utf-8")
    except OSError:
        return []
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            # A partially written trailing line must not break every later read.
            continue
    return rows


def _new_receipt_token() -> str:
    """URL-safe, high-entropy secret used to read an inquiry back privately."""
    return secrets.token_urlsafe(32)


def _hash_token(token: str) -> str:
    """SHA-256 hex digest of a receipt token (the only form ever stored)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _inquiry_table_ready() -> bool:
    """Whether the ``inquiry`` table exists in the configured database.

    Checked by table name rather than by the canonical analytics probe: this
    route must not depend on the analytical tables having been loaded.
    """
    try:
        from sqlalchemy import inspect

        from app.db.session import engine

        with engine.connect() as connection:
            return "inquiry" in set(inspect(connection).get_table_names())
    except Exception:  # noqa: BLE001 - absence of a database is a normal state
        return False


def _database_enabled() -> bool:
    if get_settings().canonical_mode == "file":
        return False
    return _inquiry_table_ready()


def _row_to_dict(row, raw_token: str | None) -> dict:
    """Project a persisted inquiry onto the service's dict contract.

    ``raw_token`` is populated only for the creation response; every other caller
    receives ``None`` because the plaintext is not recoverable.
    """
    return {
        "id": str(row.id),
        "client_uuid": row.client_uuid,
        "receipt_token": raw_token,
        "topic": row.topic,
        "crop": row.crop,
        "province": row.province,
        "district": row.district,
        "message": row.message,
        "contact_name": row.contact_name,
        "contact_email": row.contact_email,
        "organization": row.organization,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _db_create(payload: dict) -> dict:
    """Persist one inquiry, idempotent on ``client_uuid``.

    On a repeat submission the existing row is reused and its receipt token is
    rotated; the caller gets the new plaintext exactly once.
    """
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    from app.db.session import SessionLocal
    from app.models.ops import Inquiry

    client_uuid = payload.get("client_uuid") or None
    raw_token = _new_receipt_token()

    with SessionLocal() as session:
        if client_uuid:
            existing = session.execute(
                select(Inquiry).where(Inquiry.client_uuid == client_uuid)
            ).scalar_one_or_none()
            if existing is not None:
                existing.receipt_token_hash = _hash_token(raw_token)
                session.commit()
                session.refresh(existing)
                return _row_to_dict(existing, raw_token)

        row = Inquiry(
            client_uuid=client_uuid,
            receipt_token_hash=_hash_token(raw_token),
            topic=payload.get("topic"),
            crop=payload.get("crop") or None,
            province=payload.get("province") or None,
            district=payload.get("district") or None,
            message=payload.get("message"),
            contact_name=payload.get("contact_name") or None,
            contact_email=payload.get("contact_email") or None,
            organization=payload.get("organization") or None,
            status="RECEIVED",
        )
        session.add(row)
        try:
            session.commit()
        except IntegrityError:
            # A concurrent retry won the unique client_uuid race: reuse its row.
            session.rollback()
            existing = session.execute(
                select(Inquiry).where(Inquiry.client_uuid == client_uuid)
            ).scalar_one_or_none()
            if existing is None:
                raise
            existing.receipt_token_hash = _hash_token(raw_token)
            session.commit()
            session.refresh(existing)
            return _row_to_dict(existing, raw_token)
        session.refresh(row)
        return _row_to_dict(row, raw_token)


def create(payload: dict) -> dict:
    """Persist one inquiry in the authoritative store.

    PostgreSQL is used whenever the inquiry table is reachable; the JSONL file is
    the development/test fallback. Under ``CANONICAL_DATA_MODE=required`` an
    unreachable database is a hard failure rather than a silent file write.
    """
    if _database_enabled():
        return _db_create(payload)
    if get_settings().canonical_mode == "required":
        raise CanonicalDataUnavailable(
            "the canonical database is required (CANONICAL_DATA_MODE=required) "
            "but the inquiry table is not reachable"
        )
    return _file_create(payload)


def _file_create(payload: dict) -> dict:
    """Append one inquiry to the JSONL file and return the stored record.

    Development/test backend. Idempotent on ``client_uuid``: a queued offline
    retry returns the originally stored record, including its receipt token.
    """
    client_uuid = payload.get("client_uuid")
    with _LOCK:
        existing = _read_all()
        if client_uuid:
            for row in existing:
                if row.get("client_uuid") == client_uuid:
                    return row

        now = datetime.now(UTC).isoformat()
        record = {
            "id": str(uuid.uuid4()),
            "client_uuid": client_uuid,
            "receipt_token": _new_receipt_token(),
            "topic": payload.get("topic"),
            "crop": payload.get("crop") or None,
            "province": payload.get("province") or None,
            "district": payload.get("district") or None,
            "message": payload.get("message"),
            "contact_name": payload.get("contact_name") or None,
            "contact_email": payload.get("contact_email") or None,
            "organization": payload.get("organization") or None,
            "status": "RECEIVED",
            "created_at": now,
            "updated_at": now,
        }
        _ensure_dir()
        with INQUIRY_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record


def get(inquiry_id: str) -> dict | None:
    """Look an inquiry up by id. Callers are responsible for authorization."""
    for row in _read_all():
        if row.get("id") == inquiry_id:
            return row
    return None


def _db_get_by_receipt(inquiry_id: str, receipt_token: str) -> dict | None:
    """Constant-time receipt lookup against the stored SHA-256 hash."""
    from app.db.session import SessionLocal
    from app.models.ops import Inquiry

    try:
        key = uuid.UUID(str(inquiry_id))
    except (ValueError, AttributeError, TypeError):
        return None

    with SessionLocal() as session:
        row = session.get(Inquiry, key)
        if row is None:
            return None
        if not hmac.compare_digest(row.receipt_token_hash, _hash_token(receipt_token)):
            return None
        return _row_to_dict(row, None)


def get_by_receipt(inquiry_id: str, receipt_token: str) -> dict | None:
    """Return an inquiry only when the secret receipt token matches exactly.

    Comparison is constant-time (``hmac.compare_digest``), and a wrong token is
    indistinguishable from a missing inquiry, so an attacker can neither infer a
    valid id nor leak the token through timing.
    """
    if not receipt_token:
        return None
    if _database_enabled():
        return _db_get_by_receipt(inquiry_id, receipt_token)
    row = get(inquiry_id)
    if row is None:
        return None
    stored = str(row.get("receipt_token") or "")
    if not stored or not hmac.compare_digest(stored, receipt_token):
        return None
    return row


def public_status(row: dict) -> dict:
    """Sanitized projection: no message, email, name or organisation."""
    return {
        "id": row.get("id"),
        "status": row.get("status", "RECEIVED"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at") or row.get("created_at"),
    }


def list_recent(limit: int = 50) -> list[dict]:
    """**Internal only.** Never wire this to an unauthenticated endpoint."""
    rows = _read_all()
    bounded = max(1, min(limit, MAX_LIST))
    return rows[-bounded:][::-1]


def storage_path() -> Path:
    """Exposed for the readiness/ops view (never returned by a public endpoint)."""
    return INQUIRY_FILE
