#!/usr/bin/env python3
"""Build the cleaned district erosion-control table (04).

Erosion-control technique shares and reported erosion-severity bands by district
for 2025B. Missing values stay null.
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

OUT = PROCESSED_FILES["erosion_control"]
SCRIPT = "scripts/data/build_erosion.py"


def main() -> int:
    df = pd.read_csv(raw_path("erosion_control"))
    df["district"] = df["district"].astype(str).str.strip()

    for col in [c for c in df.columns if c.endswith("_pct")]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    dim_d = pd.read_csv(INTERIM_DIR / "dim_district.csv")
    df = df.merge(
        dim_d[["district", "district_code", "province", "agro_ecological_zone"]],
        on="district",
        how="left",
    )

    df = add_provenance(df, "erosion_control", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(f"built {OUT}: {len(df)} rows, {df['district'].nunique()} districts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
