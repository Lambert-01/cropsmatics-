#!/usr/bin/env python3
"""Build the cleaned district irrigation & water-source table (03).

Values are official 2025B district percentages. Missing values are preserved as
null; nothing is imputed.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import (
    INTERIM_DIR,
    PROCESSED_DIR,
    PROCESSED_FILES,
    add_provenance,
    log,
    raw_path,
)

OUT = PROCESSED_FILES["irrigation_water"]
SCRIPT = "scripts/data/build_irrigation.py"

PCT_COLS = [
    "surface_irrigation_pct",
    "flood_irrigation_pct",
    "drip_irrigation_pct",
    "sprinkler_irrigation_pct",
    "pivot_irrigation_pct",
    "traditional_irrigation_pct",
    "rainwater_source_pct",
    "water_treatment_source_pct",
    "underground_source_pct",
    "lake_stream_source_pct",
    "water_catchment_source_pct",
]


def main() -> int:
    df = pd.read_csv(raw_path("irrigation_water"))
    df["district"] = df["district"].astype(str).str.strip()

    for col in PCT_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    dim_d = pd.read_csv(INTERIM_DIR / "dim_district.csv")
    df = df.merge(
        dim_d[["district", "district_code", "province", "agro_ecological_zone"]],
        on="district",
        how="left",
    )

    df = add_provenance(df, "irrigation_water", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(f"built {OUT}: {len(df)} rows, {df['district'].nunique()} districts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
