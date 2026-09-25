#!/usr/bin/env python3
"""Normalize geography into a canonical district dimension.

Ensures every district that appears in the raw official tables maps to exactly
one entry in ``data/dictionaries/districts.csv``, then writes
``data/interim/dim_district.csv`` for reuse by downstream build steps.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import DICTS_DIR, INTERIM_DIR, log, raw_path


def main() -> int:
    districts = pd.read_csv(DICTS_DIR / "districts.csv")
    districts["district"] = districts["district"].astype(str).str.strip()

    dupes = districts["district"].duplicated().sum()
    if dupes:
        log(f"ERROR: districts dictionary has {dupes} duplicate names")
        return 1

    seen: set[str] = set()
    for key in ("district_factors", "district_crop_productivity"):
        df = pd.read_csv(raw_path(key))
        if "district" in df.columns:
            seen |= set(df["district"].dropna().astype(str).str.strip())

    unknown = sorted(seen - set(districts["district"]))
    if unknown:
        log(f"ERROR: raw districts missing from dictionary: {unknown}")
        return 1

    unused = sorted(set(districts["district"]) - seen)
    if unused:
        log(f"note: dictionary districts not present in 2025B tables: {unused}")

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    out = INTERIM_DIR / "dim_district.csv"
    districts.to_csv(out, index=False)
    log(f"dim_district: {len(districts)} districts -> {out.name} ({len(seen)} seen in data)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
