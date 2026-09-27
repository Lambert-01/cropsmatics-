"""Information-inquiry storage.

**DEVELOPMENT / MVP STORAGE ONLY.**

Submissions are appended as JSON lines to
``<repo>/data/interim/inquiries/inquiries.jsonl``. This is *not* a production
database: there is no indexing, no transactional isolation and no retention
policy. The documented production migration target is PostgreSQL, where the same
fields map to a table with a unique constraint on ``receipt_token``.

Why a file for the local MVP?

* the rest of the public API is CPU/local-file backed and the SQLAlchemy database
  is *optional* in this deployment, so a DB-only inquiry route would 500 whenever
  the database is absent, and would make the API test-suite DB-dependent;
* ``data/interim`` is git-ignored, so resident contact details are never
  committed to the repository;
* an append-only log is easy to audit and impossible to silently rewrite.

Privacy model
-------------

Reading an inquiry back requires the secret ``receipt_token`` issued at creation.
The token is never derivable from the public ``id`` and is never returned by any
listing endpoint. There is deliberately **no public list endpoint**: an anonymous
visitor cannot enumerate other people's submissions or contact details.
"""

from __future__ import annotations

import json
import secrets
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import REPO_ROOT

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


def create(payload: dict) -> dict:
    """Append one inquiry and return the stored record.

    Idempotent on ``client_uuid``: re-submitting a queued offline draft returns
    the originally stored record (and its original receipt token) instead of
    creating a duplicate.
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


def get_by_receipt(inquiry_id: str, receipt_token: str) -> dict | None:
    """Return an inquiry only when the secret receipt token matches exactly.

    Uses :func:`secrets.compare_digest`-style constant-time comparison via
    ``hmac.compare_digest`` to avoid leaking the token through timing.
    """
    import hmac

    if not receipt_token:
        return None
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
