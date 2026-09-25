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

import pandas as pd

from scripts.data.common import PROCESSED_DIR, log

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
    "training_district_crop.csv": "stg_training_district_crop",
    "dashboard_overview.csv": "stg_dashboard_overview",
    "data_coverage.csv": "stg_data_coverage",
}


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        log("ERROR: DATABASE_URL is not set; refusing to run.")
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
