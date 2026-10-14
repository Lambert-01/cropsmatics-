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
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
API_DIR = ROOT / "services" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from scripts.data.common import PROCESSED_DIR, log  # noqa: E402

# The periods the repaired deployment must be able to serve. A non-empty table
# that holds only the most recent releases is exactly the stale state this
# verification exists to catch, so the historical seasons are named here rather
# than inferred from "some rows exist".
REQUIRED_BOOTSTRAP_PERIODS: tuple[str, ...] = (
    "2022A", "2022B", "2022C",
    "2023A", "2023B", "2023C",
)


def needs_load(loaded_version: str | None, expected_version: str) -> bool:
    """Whether the canonical load must run.

    A database that already holds the expected version is left untouched.
    """
    return loaded_version != expected_version


def _target_identity(url: str) -> str:
    """A credential-free description of the target for plan output.

    Only the host, port and database name appear - never the password or the
    full connection string - so a plan can be reviewed and archived safely.
    """
    parsed = urlparse(url)
    host = parsed.hostname or "(unknown)"
    port = f":{parsed.port}" if parsed.port else ""
    database = (parsed.path or "/").lstrip("/") or "(unknown)"
    return f"{host}{port}/{database}"


def _loaded_summary(url: str) -> dict | None:
    """Loaded row count and period set, read without writing anything.

    Returns None when the target cannot be inspected (unreachable, tables
    missing); a dry run reports the gap rather than failing on it, because the
    plan's job is to describe what a load *would* change.
    """
    from sqlalchemy import create_engine, inspect, text

    engine = create_engine(url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as connection:
            names = set(inspect(connection).get_table_names())
            if "crop_productivity" not in names:
                return None
            rows = int(
                connection.execute(text("SELECT count(*) FROM crop_productivity")).scalar() or 0
            )
            periods: set[str] = set()
            if "period" in names:
                periods = {
                    str(row[0])
                    for row in connection.execute(
                        text(
                            "SELECT DISTINCT p.period_code FROM crop_productivity cp "
                            "JOIN period p ON p.period_id = cp.period_id"
                        )
                    )
                }
            else:
                periods = {
                    str(row[0])
                    for row in connection.execute(
                        text("SELECT DISTINCT period_id FROM crop_productivity")
                    )
                }
            return {"rows": rows, "periods": sorted(periods)}
    except Exception:  # noqa: BLE001 - a plan reports the gap, it does not traceback
        return None
    finally:
        engine.dispose()


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


def _migration_state(url: str) -> tuple[str | None, str | None]:
    """``(current, head)`` revisions, read without writing anything.

    A release plan needs to say whether migrations are pending. Reading the
    alembic bookkeeping is a SELECT against ``alembic_version``, so it belongs to
    the dry run - unlike ``upgrade``, which writes.
    """
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine, inspect, text

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()

    engine = create_engine(url, pool_pre_ping=True, future=True)
    with engine.connect() as connection:
        if "alembic_version" not in set(inspect(connection).get_table_names()):
            return None, head
        current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    return (str(current) if current else None), head


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


def _expected_panel(panel_path: Path, manifest: dict) -> dict:
    """The period set and row count the processed panel implies.

    The period axis is read from the same artefact the loader read, so the
    expectation can never drift from the build it is verifying.
    """
    import pandas as pd

    frame = pd.read_csv(panel_path, usecols=["period_code"])
    periods = sorted({str(code) for code in frame["period_code"].dropna()})
    rows = (manifest.get("row_counts") or {}).get("crop_productivity")
    return {"rows": int(rows) if rows is not None else int(len(frame)), "periods": periods}


def _verify(url: str, expected: dict) -> bool:
    """Confirm the database is serving exactly the expected dataset.

    A non-empty table proves nothing on its own: a stale production database
    that still holds an older release is non-empty too, which is how a deployment
    reported success while 2022-2023 were absent. Verification therefore compares
    the loaded period set and the productivity row count against the processed
    build, and requires the historical periods to be present.
    """
    from sqlalchemy import create_engine, inspect, text

    engine = create_engine(url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as connection:
            names = set(inspect(connection).get_table_names())
            for table in ("crop_productivity", "period", "dataset_version"):
                if table not in names:
                    log(f"ERROR verify: table {table} is missing after the load")
                    return False
            rows = int(
                connection.execute(text("SELECT count(*) FROM crop_productivity")).scalar() or 0
            )
            periods = {
                str(row[0])
                for row in connection.execute(
                    text("SELECT DISTINCT period_id FROM crop_productivity")
                )
            }
    except Exception as error:  # noqa: BLE001 - a bootstrap reports, it does not traceback
        log(f"ERROR verify: {error}")
        return False

    ok = True
    if rows != expected["rows"]:
        log(
            f"ERROR verify: crop_productivity holds {rows} rows, "
            f"but the processed build has {expected['rows']}"
        )
        ok = False
    missing = sorted(set(expected["periods"]) - periods)
    if missing:
        log(f"ERROR verify: periods missing from the database: {', '.join(missing)}")
        ok = False
    unexpected = sorted(periods - set(expected["periods"]))
    if unexpected:
        log(f"ERROR verify: periods not in the processed build: {', '.join(unexpected)}")
        ok = False
    required_absent = [
        code for code in REQUIRED_BOOTSTRAP_PERIODS
        if code in expected["periods"] and code not in periods
    ]
    if required_absent:
        log(f"ERROR verify: required period(s) not servable: {', '.join(required_absent)}")
        ok = False

    if ok:
        log(
            f"verified: crop_productivity holds {rows} rows across "
            f"{len(periods)} periods ({periods and min(periods)}..{max(periods)})"
        )
    return ok


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
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report the plan without writing anything (migrations included)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    from app.core.config import get_settings
    from scripts.data.load_postgres import content_version
    from scripts.data.load_postgres import main as load_main

    manifest_path = PROCESSED_DIR / "manifest.json"
    panel_path = PROCESSED_DIR / "crop_productivity.csv"
    if not manifest_path.exists():
        log("ERROR processed manifest missing. Run `make data` first.")
        return 1
    if not panel_path.exists():
        log("ERROR processed productivity panel missing. Run `make data` first.")
        return 1
    manifest = json.loads(manifest_path.read_text())
    expected = content_version(manifest)
    expected_panel = _expected_panel(panel_path, manifest)

    url = args.url or get_settings().database_url
    log(f"expected dataset version: {expected}")
    log(f"expected panel: {expected_panel['rows']} rows across {len(expected_panel['periods'])} periods")
    log(f"target: {_target_identity(url)}")

    if args.dry_run:
        # A dry run must write nothing - including migrations. Applying them here
        # would make `--dry-run` a schema change dressed as a plan, which is
        # exactly the surprise a production approval gate exists to prevent.
        try:
            current, head = _migration_state(url)
            pending = current != head
            log(
                "dry run: migrations NOT applied "
                f"(current {current or '(none)'}, head {head or '(unknown)'})"
                + (" - an upgrade is pending" if pending else " - already at head")
            )
        except Exception as error:  # noqa: BLE001 - a plan reports, it does not raise
            log(f"dry run: could not read the migration state ({type(error).__name__})")
            pending = True
    elif not args.skip_migrations:
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

    if args.dry_run:
        # Compare loaded vs expected content so the plan states exactly what a
        # load would change - row counts, period coverage, and the migration
        # state - without writing anything.
        summary = _loaded_summary(url)
        if summary is None:
            log("dry run: loaded row/period detail unavailable (tables missing or unreachable)")
        else:
            missing_periods = sorted(set(expected_panel["periods"]) - set(summary["periods"]))
            log(
                f"dry run: loaded panel {summary['rows']} rows across "
                f"{len(summary['periods'])} periods"
            )
            if missing_periods:
                log(f"dry run: periods missing from the database: {', '.join(missing_periods)}")

    if not args.force_load and not needs_load(loaded, expected):
        log("database already serves the expected dataset; skipping the load")
        return 0 if _verify(url, expected_panel) else 1

    if args.dry_run:
        actions: list[str] = []
        if pending:
            actions.append("apply alembic migrations")
        actions.append(
            f"upsert canonical data ({expected_panel['rows']} productivity rows, "
            f"{len(expected_panel['periods'])} periods) to reach {expected}"
        )
        log("dry run: a canonical load would run here; nothing was written")
        log("dry run plan: " + " -> ".join(actions))
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
    # The API runs in a different process from this pre-deploy step, so its
    # per-process caches are cold when it starts; nothing has to be invalidated
    # here. A deployment that runs the load in-process must restart the worker.
    log("canonical data loaded; the API process must start (or restart) to serve it")
    return 0 if _verify(url, expected_panel) else 1


if __name__ == "__main__":
    sys.exit(main())
