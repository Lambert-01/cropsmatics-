#!/usr/bin/env python3
"""Build the verified cold-chain / storage program context table (08).

This table is **context only**. The source deliberately provides no facility
capacity, so ``capacity`` is preserved as null and ``capacity_status`` records
``not_verified``. The pipeline never converts a null capacity to 0.
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

OUT = PROCESSED_FILES["cold_chain_context"]
SCRIPT = "scripts/data/build_cold_chain.py"


def main() -> int:
    df = pd.read_csv(raw_path("cold_chain_context"))
    df["district"] = df["district"].astype(str).str.strip()

    # Capacity is intentionally blank upstream; keep it null and say so explicitly.
    df["capacity"] = pd.to_numeric(df.get("capacity"), errors="coerce")
    df["capacity_status"] = df["capacity"].apply(
        lambda v: "not_verified" if pd.isna(v) else "verified"
    )

    dim_d = pd.read_csv(INTERIM_DIR / "dim_district.csv")
    df = df.merge(
        dim_d[["district", "district_code", "province", "agro_ecological_zone"]],
        on="district",
        how="left",
    )

    df = add_provenance(df, "cold_chain_context", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(
        f"built {OUT}: {len(df)} rows, {df['district'].nunique()} program districts, "
        f"capacity verified on {int((df['capacity_status'] == 'verified').sum())} rows"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
