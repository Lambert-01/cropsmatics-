"""Create tables directly from models.

A development convenience. Production schema changes go through Alembic
(``make migrate``). Run: ``python -m app.db.init_db`` from ``services/api``.
"""

from __future__ import annotations

# Importing the models package registers all tables on Base.metadata.
import app.models  # noqa: F401,E402
from app.db.base import Base
from app.db.session import engine


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"created {len(Base.metadata.tables)} tables")


if __name__ == "__main__":
    main()
