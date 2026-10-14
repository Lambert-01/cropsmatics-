#!/usr/bin/env python3
"""Read-only diagnostics for a canonical PostgreSQL target.

    python scripts/data/production_diagnostics.py
    python scripts/data/production_diagnostics.py --url postgresql+psycopg://...
    PRODUCTION_DATABASE_URL=... python scripts/data/production_diagnostics.py

Answers, without writing anything, the questions a release approval needs:

1.  Which database is this? (host, database name, server version — never
    credentials)
2.  Is PostGIS available?
3.  Are the Alembic migrations applied, and is an upgrade pending?
4.  Are the canonical tables present?
5.  Which dataset version is loaded, and does it match the processed manifest
    this checkout builds?
6.  How many productivity rows and historical periods are loaded versus
    expected?
7.  Do the source catalogue and observation counts look consistent with the
    loaded dataset?

The connection string is read from ``--url``, then ``PRODUCTION_DATABASE_URL``,
then ``DATABASE_URL``. It is never printed: only the parsed host, port, database
name and role appear in the report.

Exit codes
----------
0  the target serves exactly the dataset this checkout expects
1  the target is reachable but out of sync, unmigrated, or incompletely loaded
2  the target could not be reached or the processed artefacts are missing

Deliberately read-only: it opens SELECT-only connections and never runs
migrations or loads.
"""

from __future__ import annotations

import argparse
import json
import os
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

# Tables the canonical schema must expose before any comparison means anything.
REQUIRED_TABLES: tuple[str, ...] = (
    "period",
    "crop_productivity",
    "agricultural_observation",
    "dataset_version",
    "source_table",
    "data_ingestion_run",
)


def resolve_url(explicit: str | None) -> str | None:
    """The connection string to diagnose: flag, production var, then DATABASE_URL."""
    for candidate in (
        explicit,
        os.environ.get("PRODUCTION_DATABASE_URL"),
        os.environ.get("DATABASE_URL"),
    ):
        if candidate and candidate.strip():
            return candidate.strip()
    return None


def target_identity(url: str) -> dict:
    """Safe identity of the target: host, port, database, role. Never the password."""
    parsed = urlparse(url)
    return {
        "host": parsed.hostname,
        "port": parsed.port,
        "database": (parsed.path or "/").lstrip("/") or None,
        "role": parsed.username,
        "tls": "require" if "sslmode=require" in (parsed.query or "") else "prefer/default",
    }


def _migration_state(url: str) -> tuple[str | None, str | None]:
    """``(current, head)`` Alembic revisions, read without writing."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine, inspect, text

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()

    engine = create_engine(url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as connection:
            if "alembic_version" not in set(inspect(connection).get_table_names()):
                return None, head
            current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
        return (str(current) if current else None), head
    finally:
        engine.dispose()


def _server_and_postgis(url: str) -> dict:
    """Server version, current database, and PostGIS availability."""
    from sqlalchemy import create_engine, text

    engine = create_engine(url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as connection:
            server = connection.execute(text("SELECT version()")).scalar() or ""
            database = connection.execute(text("SELECT current_database()")).scalar()
            role = connection.execute(text("SELECT current_user")).scalar()
            postgis = connection.execute(
                text("SELECT COUNT(*) FROM pg_extension WHERE extname = 'postgis'")
            ).scalar()
            return {
                "server": server.split(",")[0],
                "database": database,
                "role": role,
                "postgis_installed": bool(postgis),
            }
    finally:
        engine.dispose()


def _loaded_state(url: str) -> dict:
    """Loaded dataset version, row counts, and period coverage."""
    from sqlalchemy import create_engine, inspect, text

    engine = create_engine(url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as connection:
            names = set(inspect(connection).get_table_names())
            present = [name for name in REQUIRED_TABLES if name in names]
            missing = [name for name in REQUIRED_TABLES if name not in names]
            if "dataset_version" not in names:
                return {"tables_present": present, "tables_missing": missing, "version": None}

            version_row = (
                connection.execute(
                    text(
                        "SELECT version, row_counts, pipeline_version, git_sha, loaded_at "
                        "FROM dataset_version ORDER BY loaded_at DESC NULLS LAST, created_at DESC LIMIT 1"
                    )
                )
                .mappings()
                .first()
            )

            counts: dict[str, int | None] = {}
            for table in (
                "crop_productivity",
                "period",
                "agricultural_observation",
                "source_table",
            ):
                if table in names:
                    counts[table] = int(
                        connection.execute(text(f"SELECT count(*) FROM {table}")).scalar() or 0
                    )
                    continue
                counts[table] = None

            periods: set[str] = set()
            if "crop_productivity" in names and "period" in names:
                periods = {
                    str(row[0])
                    for row in connection.execute(
                        text(
                            "SELECT DISTINCT p.period_code FROM crop_productivity cp "
                            "JOIN period p ON p.period_id = cp.period_id"
                        )
                    )
                }
            synthetic = None
            if "crop_productivity" in names:
                synthetic = int(
                    connection.execute(
                        text("SELECT count(*) FROM crop_productivity WHERE is_synthetic = TRUE")
                    ).scalar()
                    or 0
                )
            return {
                "tables_present": present,
                "tables_missing": missing,
                "version": version_row["version"] if version_row else None,
                "stored_row_counts": dict(version_row["row_counts"])
                if version_row and version_row["row_counts"]
                else {},
                "pipeline_version": version_row["pipeline_version"] if version_row else None,
                "git_sha": version_row["git_sha"] if version_row else None,
                "loaded_at": version_row["loaded_at"].isoformat()
                if version_row and version_row["loaded_at"]
                else None,
                "counts": counts,
                "periods": sorted(periods),
                "synthetic_productivity_rows": synthetic,
            }
    finally:
        engine.dispose()


def _expected_state(manifest_path: Path, panel_path: Path) -> dict:
    """The dataset this checkout's processed artefacts define."""
    from scripts.data.load_postgres import content_version

    manifest = json.loads(manifest_path.read_text())
    import pandas as pd

    frame = pd.read_csv(panel_path, usecols=["period_code"])
    periods = sorted({str(code) for code in frame["period_code"].dropna()})
    return {
        "version": content_version(manifest),
        "pipeline_version": manifest.get("pipeline_version"),
        "git_sha": manifest.get("git_sha"),
        "expected_rows": (manifest.get("row_counts") or {}).get("crop_productivity"),
        "expected_periods": periods,
        "manifest_sources": len(manifest.get("sources") or {}),
    }


def run_diagnostics(url: str, expected: dict) -> tuple[int, list[str]]:
    """Produce the report lines and the exit code. Writes nothing."""
    lines: list[str] = []
    identity = target_identity(url)
    lines.append(
        f"target: host={identity['host']} port={identity['port']} "
        f"database={identity['database']} role={identity['role']} tls={identity['tls']}"
    )

    try:
        server = _server_and_postgis(url)
    except Exception as error:  # noqa: BLE001 - a diagnostic reports, it does not traceback
        lines.append(f"ERROR cannot connect: {type(error).__name__}")
        lines.append("verdict: UNREACHABLE")
        return 2, lines

    lines.append(f"server: {server['server']}")
    lines.append(f"connected database: {server['database']}  role: {server['role']}")
    lines.append(f"postgis installed: {server['postgis_installed']}")

    try:
        current, head = _migration_state(url)
        pending = current != head
        lines.append(
            f"migrations: current={current or '(none)'} head={head or '(unknown)'} "
            + ("PENDING UPGRADE" if pending else "at head")
        )
    except Exception as error:  # noqa: BLE001
        lines.append(f"migrations: unreadable ({type(error).__name__})")
        pending = True
        current, head = None, None

    try:
        loaded = _loaded_state(url)
    except Exception as error:  # noqa: BLE001
        lines.append(f"ERROR cannot inspect canonical tables: {type(error).__name__}")
        lines.append("verdict: UNREADABLE")
        return 2, lines

    if loaded["tables_missing"]:
        lines.append(f"tables missing: {', '.join(loaded['tables_missing'])}")
    else:
        lines.append(f"canonical tables present: {', '.join(loaded['tables_present'])}")

    lines.append(f"loaded dataset version: {loaded.get('version') or '(none)'}")
    lines.append(f"expected dataset version: {expected['version']}")
    counts = loaded.get("counts") or {}
    lines.append(
        f"productivity rows: loaded={counts.get('crop_productivity')} "
        f"expected={expected['expected_rows']}"
    )
    loaded_periods = loaded.get("periods") or []
    lines.append(
        f"periods: loaded={len(loaded_periods)} expected={len(expected['expected_periods'])}"
    )
    missing_periods = sorted(set(expected["expected_periods"]) - set(loaded_periods))
    if missing_periods:
        lines.append(f"periods missing from target: {', '.join(missing_periods)}")
    lines.append(
        f"observations: loaded={counts.get('agricultural_observation')}  "
        f"sources: loaded={counts.get('source_table')}  "
        f"synthetic productivity rows: {loaded.get('synthetic_productivity_rows')}"
    )
    if loaded.get("loaded_at"):
        lines.append(f"last load recorded at: {loaded['loaded_at']}")

    # --- verdict -----------------------------------------------------------
    problems: list[str] = []
    if not server["postgis_installed"]:
        problems.append("postgis_missing")
    if pending:
        problems.append("migrations_pending")
    if loaded["tables_missing"]:
        problems.append("tables_missing")
    if loaded.get("version") != expected["version"]:
        problems.append("dataset_version_mismatch")
    if counts.get("crop_productivity") != expected["expected_rows"]:
        problems.append("productivity_row_count_mismatch")
    if missing_periods:
        problems.append("period_coverage_incomplete")
    if loaded.get("synthetic_productivity_rows"):
        problems.append("synthetic_rows_present")

    if problems:
        lines.append(f"verdict: OUT OF SYNC ({', '.join(problems)})")
        return 1, lines
    lines.append("verdict: IN SYNC — the target serves the expected dataset")
    return 0, lines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read-only canonical database diagnostics.")
    parser.add_argument(
        "--url", default=None, help="override PRODUCTION_DATABASE_URL / DATABASE_URL"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    url = resolve_url(args.url)
    if not url:
        log("ERROR no connection string. Set PRODUCTION_DATABASE_URL or pass --url.")
        return 2

    manifest_path = PROCESSED_DIR / "manifest.json"
    panel_path = PROCESSED_DIR / "crop_productivity.csv"
    if not manifest_path.exists() or not panel_path.exists():
        log("ERROR processed artefacts missing. Run `make data` first.")
        return 2

    expected = _expected_state(manifest_path, panel_path)
    log(
        f"expected dataset from this checkout: {expected['version']} "
        f"({expected['expected_rows']} rows, {len(expected['expected_periods'])} periods)"
    )
    code, lines = run_diagnostics(url, expected)
    for line in lines:
        log(line)
    return code


if __name__ == "__main__":
    sys.exit(main())
