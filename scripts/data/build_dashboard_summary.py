#!/usr/bin/env python3
"""Build a compact district-level dashboard overview table.

This is a pure aggregation of the primary analytical table — no benchmark or gap
is computed here (that stays in the Python analytics layer so it is never
duplicated in two places). One row per district x period with only real values.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import PROCESSED_DIR, PROCESSED_FILES, add_provenance, log

OUT = PROCESSED_FILES["dashboard_overview"]
SCRIPT = "scripts/data/build_dashboard_summary.py"

FACTOR_PCT = [
    "improved_seed_farmers_pct",
    "organic_fertilizer_farmers_pct",
    "inorganic_fertilizer_farmers_pct",
    "pesticide_farmers_pct",
    "erosion_protection_farmers_pct",
    "mechanization_farmers_pct",
    "irrigation_farmers_pct",
    "agroforestry_farmers_pct",
]


def main() -> int:
    df = pd.read_csv(PROCESSED_DIR / PROCESSED_FILES["training"])

    valid = df[df["yield_kg_ha"].fillna(0) > 0].copy()
    factor_cols = [c for c in FACTOR_PCT if c in valid.columns]
    valid["_input_adoption_mean"] = valid[factor_cols].mean(axis=1) if factor_cols else pd.NA

    agg = (
        valid.groupby(["year", "season", "district"], dropna=False)
        .agg(
            district_code=("district_code", "first"),
            province=("province", "first"),
            agro_ecological_zone=("agro_ecological_zone", "first"),
            crops_reported=("canonical_crop_name", "nunique"),
            yield_observations=("yield_kg_ha", "count"),
            median_yield_kg_ha=("yield_kg_ha", "median"),
            total_production_mt=("production_mt", "sum"),
            total_harvested_area_ha=("harvested_area_ha", "sum"),
            mean_input_adoption_pct=("_input_adoption_mean", "mean"),
        )
        .reset_index()
    )

    agg = add_provenance(agg, "district_crop_productivity", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    agg.to_csv(PROCESSED_DIR / OUT, index=False)
    log(f"built {OUT}: {len(agg)} district x period rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
