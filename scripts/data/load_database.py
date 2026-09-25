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
    "district_crop_productivity_2025B.csv": "stg_district_crop_productivity",
    "district_factors_2025B.csv": "stg_district_factors",
    "crop_postharvest_use_2025B.csv": "stg_crop_postharvest_use",
    "training_district_crop.csv": "stg_training_district_crop",
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
