# Database scripts

Helpers for initializing and seeding the database.

| Command | Purpose |
|---|---|
| `make db-up` | start PostgreSQL/PostGIS via docker compose |
| `make migrate` | apply Alembic migrations (`services/api/alembic`) |
| `make db-init` | create tables directly from SQLAlchemy models (dev convenience) |
| `make data` then `python scripts/data/load_database.py` | load processed CSV tables into Postgres |

Migrations live with the API service (`services/api/alembic`) so schema and code
version together. Add new migration scripts there with
`alembic revision --autogenerate -m "..."`.
