"""Information-inquiry storage.

Deliberately simple and dependency-free: submissions are appended as JSON lines to
``<repo>/data/interim/inquiries/inquiries.jsonl``.

Why a file and not the relational database?

* the rest of the public API is CPU/local-file backed and the SQLAlchemy database
  is *optional* in this deployment, so a DB-only inquiry route would 500 whenever
  the database is absent, and would make the API test-suite DB-dependent;
* ``data/interim`` is git-ignored, so resident contact details are never
  committed to the repository;
* an append-only log is easy to audit and impossible to silently rewrite.

Retention: the operator is expected to treat this file as personal data. Nothing
here is exposed by any public read endpoint except an exact ``id`` lookup, and
list reads return a bounded page.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import REPO_ROOT

INQUIRY_DIR = REPO_ROOT / "data" / "interim" / "inquiries"
INQUIRY_FILE = INQUIRY_DIR / "inquiries.jsonl"

_LOCK = threading.Lock()
MAX_LIST = 200


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


def create(payload: dict) -> dict:
    """Append one inquiry and return the stored record.

    Idempotent on ``client_uuid``: re-submitting a queued offline draft returns
    the originally stored record instead of creating a duplicate.
    """
    client_uuid = payload.get("client_uuid")
    with _LOCK:
        existing = _read_all()
        if client_uuid:
            for row in existing:
                if row.get("client_uuid") == client_uuid:
                    return row

        record = {
            "id": str(uuid.uuid4()),
            "client_uuid": client_uuid,
            "topic": payload.get("topic"),
            "crop": payload.get("crop") or None,
            "province": payload.get("province") or None,
            "district": payload.get("district") or None,
            "message": payload.get("message"),
            "contact_name": payload.get("contact_name") or None,
            "contact_email": payload.get("contact_email") or None,
            "organization": payload.get("organization") or None,
            "status": "RECEIVED",
            "created_at": datetime.now(UTC).isoformat(),
        }
        _ensure_dir()
        with INQUIRY_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record


def get(inquiry_id: str) -> dict | None:
    for row in _read_all():
        if row.get("id") == inquiry_id:
            return row
    return None


def list_recent(limit: int = 50) -> list[dict]:
    rows = _read_all()
    bounded = max(1, min(limit, MAX_LIST))
    return rows[-bounded:][::-1]


def storage_path() -> Path:
    """Exposed for the readiness/ops view (never returned by a public endpoint)."""
    return INQUIRY_FILE
