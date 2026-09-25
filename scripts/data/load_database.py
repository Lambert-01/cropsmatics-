#!/usr/bin/env python3
"""Load processed analytical tables into PostgreSQL.

Reads ``data/processed/*.csv`` and upserts them into staging tables via
SQLAlchemy. Idempotent: each load replaces the table's contents.

Requires ``DATABASE_URL`` (see .env.example) and a reachable database
(``make db-up``). Does nothing to raw data.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd

# Make `python scripts/data/load_database.py` work as well as
# `python -m scripts.data.load_database`: the package import below needs the
# repository root on sys.path, and running a file directly does not add it.
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.data.common import PROCESSED_DIR, log  # noqa: E402

# processed file -> target table name
TABLES = {
    "district_crop_productivity.csv": "stg_district_crop_productivity",
    "district_productivity_factors.csv": "stg_district_factors",
    "irrigation_water.csv": "stg_irrigation_water",
    "erosion_control.csv": "stg_erosion_control",
    "crop_postharvest_use.csv": "stg_crop_postharvest_use",
    "national_crop_trends.csv": "stg_national_crop_trends",
    "national_input_trends.csv": "stg_national_input_trends",
    "cold_chain_context.csv": "stg_cold_chain_context",
    # MINAGRI national add-on. National/program level only - these staging tables
    # must never be joined to a district or to a single facility.
    "national_postharvest_infrastructure.csv": "stg_national_postharvest_infrastructure",
    "cold_chain_network_summary.csv": "stg_cold_chain_network_summary",
    "training_district_crop.csv": "stg_training_district_crop",
    "dashboard_overview.csv": "stg_dashboard_overview",
    "data_coverage.csv": "stg_data_coverage",
}


def _database_url() -> str | None:
    """Resolve DATABASE_URL from the environment, then from the project .env.

    The environment always wins, which is what production uses. The .env fallback
    exists so `make data-load` works from a plain checkout without the caller
    having to export anything (and without sourcing a URL that contains `&`).
    """
    from_env = os.environ.get("DATABASE_URL")
    if from_env:
        return from_env

    env_file = ROOT / ".env"
    if not env_file.exists():
        return None
    for raw_line in env_file.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == "DATABASE_URL":
            return value.strip().strip('"').strip("'")
    return None


def main() -> int:
    url = _database_url()
    if not url:
        log("ERROR: DATABASE_URL is not set and no .env was found; refusing to run.")
        return 1

    try:
        from sqlalchemy import create_engine
    except ImportError:
        log("ERROR: SQLAlchemy not installed. `pip install -r services/api/requirements.txt`")
        return 1

    engine = create_engine(url)
    loaded = 0
    for filename, table in TABLES.items():
        path = PROCESSED_DIR / filename
        if not path.exists():
            log(f"skip {filename} (run `make data` first)")
            continue
        df = pd.read_csv(path)
        df.to_sql(table, engine, if_exists="replace", index=False)
        log(f"loaded {table}: {len(df)} rows")
        loaded += 1

    log(f"done: {loaded} tables loaded")
    return 0 if loaded else 1


if __name__ == "__main__":
    sys.exit(main())
