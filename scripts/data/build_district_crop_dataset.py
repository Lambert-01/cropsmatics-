#!/usr/bin/env python3
"""Build the cleaned district x crop productivity table.

Reads raw ``01_..._productivity`` and writes a normalized, provenance-tagged
table. Missing values are preserved as nulls (never imputed) and flagged.
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

OUT = PROCESSED_FILES["district_crop_productivity"]
SCRIPT = "scripts/data/build_district_crop_dataset.py"


def main() -> int:
    df = pd.read_csv(raw_path("district_crop_productivity"))

    # Preserve raw blanks as null rather than coercing to a real 0.
    for col in ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_kg_ha"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["district"] = df["district"].astype(str).str.strip()
    df["crop"] = df["crop"].astype(str).str.strip()

    # Data-quality flags (no invention, just annotation).
    df["cultivated_area_reported"] = df["cultivated_area_ha"].notna()
    df["yield_reported"] = df["yield_kg_ha"].fillna(0) > 0
    df["harvest_ratio"] = (df["harvested_area_ha"] / df["cultivated_area_ha"]).where(
        df["cultivated_area_ha"] > 0
    )

    # Attach geography + crop dimensions.
    dim_d = pd.read_csv(INTERIM_DIR / "dim_district.csv")
    dim_c = pd.read_csv(INTERIM_DIR / "dim_crop.csv")
    alias = pd.read_csv(INTERIM_DIR / "crop_alias_map.csv")
    df = df.merge(
        alias.rename(columns={"raw_crop_name": "crop"})[
            ["crop", "canonical_crop_name"]
        ].drop_duplicates(),
        on="crop",
        how="left",
    )
    df = df.merge(
        dim_d[["district", "district_code", "province", "agro_ecological_zone"]],
        on="district",
        how="left",
    )
    df = df.merge(
        dim_c[["crop_name", "crop_code", "category", "perishability", "cold_chain_recommended"]],
        left_on="canonical_crop_name",
        right_on="crop_name",
        how="left",
    ).drop(columns=["crop_name"])

    df = add_provenance(df, "district_crop_productivity", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = PROCESSED_DIR / OUT
    df.to_csv(out, index=False)
    log(f"built {OUT}: {len(df)} rows, {df['district'].nunique()} districts, "
        f"{df['crop'].nunique()} crops")
    return 0


if __name__ == "__main__":
    sys.exit(main())
