#!/usr/bin/env python3
"""Build the primary analytical (training) dataset.

Joins district x crop productivity with district input/practice factors on the
**compatible keys** ``year + season + district`` — an aggregate-to-aggregate
join. This deliberately avoids respondent-level joins across independent
surveys (see docs/04_DATA_ARCHITECTURE.md, "Integration rules").

Output: data/processed/training_district_crop.csv
No missing values are invented; rows lacking a factor match are kept with nulls.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import PROCESSED_DIR, PROCESSED_FILES, add_provenance, log

OUT = PROCESSED_FILES["training"]
SCRIPT = "scripts/data/build_training_dataset.py"

FACTOR_COLS = [
    "improved_seed_farmers_pct",
    "organic_fertilizer_farmers_pct",
    "inorganic_fertilizer_farmers_pct",
    "pesticide_farmers_pct",
    "erosion_protection_farmers_pct",
    "mechanization_farmers_pct",
    "irrigation_farmers_pct",
    "agroforestry_farmers_pct",
    "agricultural_land_000ha",
]

KEY = ["year", "season", "district"]


def main() -> int:
    prod = pd.read_csv(PROCESSED_DIR / PROCESSED_FILES["district_crop_productivity"])
    factors = pd.read_csv(PROCESSED_DIR / PROCESSED_FILES["district_factors"])

    factor_cols = [c for c in FACTOR_COLS if c in factors.columns]
    missing = sorted(set(FACTOR_COLS) - set(factor_cols))
    if missing:
        log(f"WARNING: factor columns absent upstream and skipped: {missing}")

    factors_slim = factors[KEY + factor_cols].drop_duplicates(subset=KEY)
    df = prod.merge(factors_slim, on=KEY, how="left")

    df["has_factor_match"] = df[factor_cols].notna().any(axis=1) if factor_cols else False

    keep_first = [
        "year", "season", "district", "district_code", "province", "agro_ecological_zone",
        "crop", "canonical_crop_name", "crop_code", "category", "perishability",
        "cold_chain_recommended", "cultivated_area_ha", "harvested_area_ha", "production_mt",
        "yield_kg_ha", "harvest_ratio", "cultivated_area_reported", "yield_reported",
        "has_factor_match",
    ] + factor_cols
    ordered = [c for c in keep_first if c in df.columns] + [
        c for c in df.columns if c not in keep_first
    ]
    df = df[ordered]

    df = add_provenance(df, "district_crop_productivity", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = PROCESSED_DIR / OUT
    df.to_csv(out, index=False)

    matched = int(df["has_factor_match"].sum())
    log(f"built {OUT}: {len(df)} rows; factor-matched={matched} "
        f"({matched / len(df):.1%}); {df['district'].nunique()} districts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
