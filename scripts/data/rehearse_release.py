#!/usr/bin/env python3
"""Rehearse the canonical release against an isolated database branch.

    # on an isolated Neon branch (never production):
    python scripts/data/rehearse_release.py --url postgresql+psycopg://...rehearsal...

Runs, against the target only:

    1. full bootstrap (migrate -> load -> verify)
    2. the bootstrap a second time   (repeat-load idempotency)
    3. referential-integrity checks  (orphaned fact rows)
    4. final read-only diagnostics

Refuses to run when the target's host **and** database name match the
production connection string (``PRODUCTION_DATABASE_URL`` or ``DATABASE_URL``),
so a mistyped URL cannot turn a rehearsal into a production write.

Exit codes
----------
0  the rehearsal passed: load, idempotent re-load, and integrity checks
1  the rehearsal failed at some step
2  the target was refused (looks like production) or prerequisites are missing
"""

from __future__ import annotations

import argparse
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


def _identity(url: str) -> tuple[str | None, str | None]:
    parsed = urlparse(url)
    return parsed.hostname, (parsed.path or "/").lstrip("/") or None


def refuse_production_target(rehearsal_url: str) -> bool:
    """True when the rehearsal target looks like the production database.

    The same host *and* database name is the production pairing. A different
    database on the same Neon host (an isolated branch) is the intended
    rehearsal shape and is allowed.
    """
    for var in ("PRODUCTION_DATABASE_URL", "DATABASE_URL"):
        production = (os.environ.get(var) or "").strip()
        if not production:
            continue
        prod_host, prod_db = _identity(production)
        reh_host, reh_db = _identity(rehearsal_url)
        if reh_host == prod_host and reh_db == prod_db:
            log(
                f"ERROR refusing to rehearsal against the production target ({var} matches host+database)."
            )
            log("Use an isolated Neon branch with a different database name.")
            return True
    return False


def _integrity_problems(url: str) -> list[str]:
    """Referential-integrity checks over the freshly loaded tables."""
    from sqlalchemy import create_engine, text

    engine = create_engine(url, pool_pre_ping=True, future=True)
    problems: list[str] = []
    try:
        with engine.connect() as connection:
            orphan_periods = connection.execute(
                text(
                    "SELECT count(*) FROM crop_productivity cp "
                    "LEFT JOIN period p ON p.period_id = cp.period_id "
                    "WHERE p.period_id IS NULL"
                )
            ).scalar()
            if orphan_periods:
                problems.append(f"{orphan_periods} productivity rows reference a missing period")

            orphan_sources = connection.execute(
                text(
                    "SELECT count(*) FROM crop_productivity cp "
                    "LEFT JOIN source_table s ON s.source_id = cp.source_id "
                    "WHERE cp.source_id IS NOT NULL AND s.source_id IS NULL"
                )
            ).scalar()
            if orphan_sources:
                problems.append(f"{orphan_sources} productivity rows reference a missing source")

            negative = connection.execute(
                text(
                    "SELECT count(*) FROM crop_productivity "
                    "WHERE production_mt < 0 OR harvested_area_ha < 0 OR cultivated_area_ha < 0"
                )
            ).scalar()
            if negative:
                problems.append(f"{negative} productivity rows carry negative areas or production")

            synthetic = connection.execute(
                text("SELECT count(*) FROM crop_productivity WHERE is_synthetic = TRUE")
            ).scalar()
            if synthetic:
                problems.append(f"{synthetic} productivity rows are flagged synthetic")
    finally:
        engine.dispose()
    return problems


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Rehearse the canonical release on an isolated branch."
    )
    parser.add_argument(
        "--url", required=True, help="isolated rehearsal database URL (never production)"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if refuse_production_target(args.url):
        return 2
    if (
        not (PROCESSED_DIR / "manifest.json").exists()
        or not (PROCESSED_DIR / "crop_productivity.csv").exists()
    ):
        log("ERROR processed artefacts missing. Run `make data` first.")
        return 2

    from scripts.data import canonical_bootstrap
    from scripts.data.production_diagnostics import _expected_state, run_diagnostics

    log("rehearsal run 1/3: full bootstrap (migrate -> load -> verify)")
    code = canonical_bootstrap.main(["--url", args.url])
    if code != 0:
        log("ERROR the rehearsal bootstrap failed on the first run")
        return 1

    log("rehearsal run 2/3: repeat bootstrap (idempotency proof)")
    code = canonical_bootstrap.main(["--url", args.url])
    if code != 0:
        log("ERROR the repeat bootstrap failed - the load is not idempotent")
        return 1

    log("rehearsal run 3/3: referential integrity + final diagnostics")
    problems = _integrity_problems(args.url)
    for problem in problems:
        log(f"ERROR integrity: {problem}")
    expected = _expected_state(
        PROCESSED_DIR / "manifest.json", PROCESSED_DIR / "crop_productivity.csv"
    )
    diag_code, lines = run_diagnostics(args.url, expected)
    for line in lines:
        log(line)

    if problems or diag_code != 0:
        log("ERROR rehearsal FAILED - do not apply this release to production")
        return 1
    log("rehearsal PASSED: load, idempotent re-load, integrity, and diagnostics are all clean")
    log("the production write still requires explicit owner approval")
    return 0


if __name__ == "__main__":
    sys.exit(main())
