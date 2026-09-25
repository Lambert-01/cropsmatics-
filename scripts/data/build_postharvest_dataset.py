#!/usr/bin/env python3
"""Build the cleaned crop post-harvest use/loss table."""

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

OUT = PROCESSED_FILES["crop_postharvest_use"]
SCRIPT = "scripts/data/build_postharvest_dataset.py"


def main() -> int:
    df = pd.read_csv(raw_path("crop_postharvest_use"))
    df["crop"] = df["crop"].astype(str).str.strip()

    alias = pd.read_csv(INTERIM_DIR / "crop_alias_map.csv")
    df = df.merge(
        alias.rename(columns={"raw_crop_name": "crop"})[
            ["crop", "canonical_crop_name"]
        ].drop_duplicates(),
        on="crop",
        how="left",
    )

    share_cols = [c for c in df.columns if c.endswith("_pct")]
    for col in share_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    # Guard against published shares that do not sum to 100 (rounding).
    df["shares_sum_pct"] = df[share_cols].sum(axis=1, min_count=1)
    df["shares_sum_ok"] = (df["shares_sum_pct"] - 100.0).abs() <= 1.0

    df = add_provenance(df, "crop_postharvest_use", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = PROCESSED_DIR / OUT
    df.to_csv(out, index=False)
    log(f"built {OUT}: {len(df)} rows, {df['crop'].nunique()} crops")
    return 0


if __name__ == "__main__":
    sys.exit(main())
