"""Database engine and session factory."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

# ``pool_pre_ping`` avoids stale connections after DB restarts (relevant on
# managed Postgres). Echo is off; enable per-environment if debugging.
#
# ``connect_timeout`` matters for readiness: without it a sleep/wake or a blocked
# egress path leaves ``/health/readiness`` hanging instead of reporting that the
# database is unreachable. It is psycopg-specific, so it is only applied to a
# PostgreSQL URL.
_engine_kwargs: dict = {"pool_pre_ping": True, "future": True}
if _settings.database_url.startswith("postgresql"):
    _engine_kwargs["connect_args"] = {"connect_timeout": 3}

engine = create_engine(_settings.database_url, **_engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
