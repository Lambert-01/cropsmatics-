#!/usr/bin/env python3
"""Bring a deployment database up to the canonical dataset the image was built from.

    python scripts/data/canonical_bootstrap.py
    python scripts/data/canonical_bootstrap.py --dry-run

This is the release/pre-deploy step for a database-backed deployment. It runs,
in order, before FastAPI starts serving:

    apply migrations  ->  compare dataset version  ->  load if it differs  ->  verify

The comparison is the point. ``crop_productivity`` holds thousands of rows, and
rebuilding them on every deploy (or, worse, on every request) is wasteful, so the
load is skipped when the database already carries exactly the dataset this image
produced. The version is content-addressed over the manifest, so "same version"
means same inputs, not just same timestamp.

It is safe to run more than once: migrations are idempotent by Alembic design and
the loader upserts on business keys.

Exit codes
----------
0  the database is serving the expected dataset
1  the database could not be reached, migrated, loaded, or verified

Deliberately not destructive: it never drops or truncates anything.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
API_DIR = ROOT / "services" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from scripts.data.common import PROCESSED_DIR, log  # noqa: E402


def needs_load(loaded_version: str | None, expected_version: str) -> bool:
    """Whether the canonical load must run.

    A database that already holds the expected version is left untouched.
    """
    return loaded_version != expected_version


def _alembic_upgrade(url: str) -> None:
    """Apply the migration chain to ``url``.

    The URL is set on the Config so ``alembic/env.py`` uses it instead of the
    process's ``DATABASE_URL`` - the same channel the integration tests use.
    """
    from alembic import command
    from alembic.config import Config

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")


def _current_version(url: str) -> str | None:
    """The version recorded in the target database, or None when there is none."""
    from sqlalchemy import create_engine, inspect

    from app.repositories import canonical_repository as canonical

    engine = create_engine(url, pool_pre_ping=True, future=True)
    with engine.connect() as connection:
        if "dataset_version" not in set(inspect(connection).get_table_names()):
            return None
    import app.db.session as session_module

    # `canonical_repository` resolves the engine lazily from this module, so
    # pointing the module at the target database is enough to read its version.
    original_engine = session_module.engine
    session_module.engine = engine
    try:
        loaded = canonical.current_version()
    finally:
        session_module.engine = original_engine
    return loaded.get("version") if loaded else None


def _verify(url: str) -> bool:
    """Confirm the database is serving the expected dataset after a load."""
    from sqlalchemy import create_engine, inspect, text

    engine = create_engine(url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as connection:
            names = set(inspect(connection).get_table_names())
            for table in ("crop_productivity", "period", "dataset_version"):
                if table not in names:
                    log(f"ERROR verify: table {table} is missing after the load")
                    return False
            rows = connection.execute(text("SELECT count(*) FROM crop_productivity")).scalar()
            if not rows:
                log("ERROR verify: crop_productivity is empty after the load")
                return False
    except Exception as error:  # noqa: BLE001 - a bootstrap reports, it does not traceback
        log(f"ERROR verify: {error}")
        return False
    log(f"verified: crop_productivity holds {int(rows)} rows")
    return True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bootstrap the canonical database.")
    parser.add_argument("--url", default=None, help="override DATABASE_URL")
    parser.add_argument(
        "--skip-migrations",
        action="store_true",
        help="assume the schema is already at head (e.g. a platform that migrates separately)",
    )
    parser.add_argument(
        "--force-load",
        action="store_true",
        help="run the canonical load even when the version already matches",
    )
    parser.add_argument("--dry-run", action="store_true", help="report the plan without writing")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    from app.core.config import get_settings
    from scripts.data.load_postgres import content_version
    from scripts.data.load_postgres import main as load_main

    manifest_path = PROCESSED_DIR / "manifest.json"
    if not manifest_path.exists():
        log("ERROR processed manifest missing. Run `make data` first.")
        return 1
    manifest = json.loads(manifest_path.read_text())
    expected = content_version(manifest)

    url = args.url or get_settings().database_url
    log(f"expected dataset version: {expected}")

    if not args.skip_migrations:
        try:
            _alembic_upgrade(url)
            log("migrations applied (at head)")
        except Exception as error:  # noqa: BLE001
            log(f"ERROR migration failed: {error}")
            return 1

    try:
        loaded = _current_version(url)
    except Exception as error:  # noqa: BLE001
        log(f"ERROR cannot read the database: {error}")
        return 1

    log(f"loaded dataset version:   {loaded or '(none)'}")
    if not args.force_load and not needs_load(loaded, expected):
        log("database already serves the expected dataset; skipping the load")
        return 0 if _verify(url) else 1

    if args.dry_run:
        log("dry run: a canonical load would run here; nothing was written")
        return 0

    log("loading canonical data...")
    code = load_main(["--url", url])
    if code != 0:
        log(f"ERROR the canonical load failed (exit {code})")
        return 1

    after = _current_version(url)
    if after != expected:
        log(f"ERROR version check failed: database reports {after!r}, expected {expected!r}")
        return 1
    return 0 if _verify(url) else 1


if __name__ == "__main__":
    sys.exit(main())
