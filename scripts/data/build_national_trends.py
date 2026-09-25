#!/usr/bin/env python3
"""Build the cleaned national crop-area/production/yield trend table (06).

The official table mixes **aggregate** groups (Cereals, Tubers and Roots,
Legumes and Pulses, Vegetables and Fruits) with individual crops. Both are kept
and labelled with ``is_aggregate`` so charts never add an aggregate to its own
parts. ``yield_mt_ha`` is blank in the source for some rows and stays null.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import (
    DICTS_DIR,
    PROCESSED_DIR,
    PROCESSED_FILES,
    add_provenance,
    log,
    raw_path,
)
from scripts.data.normalize_crops import ALIASES

OUT = PROCESSED_FILES["national_crop_trends"]
SCRIPT = "scripts/data/build_national_trends.py"

AGGREGATES = {
    "Cereals",
    "Tubers and Roots",
    "Legumes and Pulses",
    "Vegetables and Fruits",
}


def main() -> int:
    df = pd.read_csv(raw_path("national_crop_trends"))
    df["crop"] = df["crop"].astype(str).str.strip()

    for col in ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_mt_ha"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    canonical = set(pd.read_csv(DICTS_DIR / "crops.csv")["crop_name"].astype(str))
    agg = ALIASES | {name: name for name in canonical}

    def to_canonical(name: str) -> str | None:
        if name in AGGREGATES:
            return name
        return agg.get(name)

    df["canonical_crop_name"] = df["crop"].map(to_canonical)
    df["is_aggregate"] = df["crop"].isin(AGGREGATES)

    unresolved = sorted(set(df.loc[df["canonical_crop_name"].isna(), "crop"]))
    if unresolved:
        log(f"WARNING: national trend crops without canonical mapping: {unresolved}")

    df = add_provenance(df, "national_crop_trends", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(
        f"built {OUT}: {len(df)} rows, "
        f"{df[['year', 'season']].drop_duplicates().shape[0]} periods, "
        f"{int((~df['is_aggregate']).sum())} crop rows"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
