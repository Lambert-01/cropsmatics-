#!/usr/bin/env python3
"""Build the cleaned national input/practice adoption trend table (07).

Periods run 2024A/B/C through 2026A/B. Some series only begin in 2025 (irrigation,
anti-erosion, agroforestry, mechanization); those cells stay null, never zero.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import (
    PROCESSED_DIR,
    PROCESSED_FILES,
    add_provenance,
    log,
    raw_path,
)

OUT = PROCESSED_FILES["national_input_trends"]
SCRIPT = "scripts/data/build_input_trends.py"


def main() -> int:
    df = pd.read_csv(raw_path("national_input_trends"))

    for col in [c for c in df.columns if c.endswith("_pct")]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = add_provenance(df, "national_input_trends", SCRIPT)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(f"built {OUT}: {len(df)} rows across {df['year'].nunique()} years")
    return 0


if __name__ == "__main__":
    sys.exit(main())
