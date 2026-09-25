#!/usr/bin/env python3
"""Build the cleaned district agricultural-factors table (inputs/practices)."""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import (
    INTERIM_DIR,
    PROCESSED_DIR,
    add_provenance,
    log,
    raw_path,
)

OUT = "district_factors_2025B.csv"
SCRIPT = "scripts/data/build_factor_dataset.py"


def main() -> int:
    df = pd.read_csv(raw_path("district_factors"))
    df["district"] = df["district"].astype(str).str.strip()

    dim_d = pd.read_csv(INTERIM_DIR / "dim_district.csv")
    df = df.merge(
        dim_d[["district", "district_code", "province", "agro_ecological_zone"]],
        on="district",
        how="left",
    )
    df = add_provenance(df, "district_factors", SCRIPT)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = PROCESSED_DIR / OUT
    df.to_csv(out, index=False)
    log(f"built {OUT}: {len(df)} rows, {df['district'].nunique()} districts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
