#!/usr/bin/env python3
"""Build the national post-harvest infrastructure table (MINAGRI add-on, 10).

Source: MINAGRI Annual Report 2024/2025, post-harvest infrastructure table
(``data/raw/external/minagri/10_national_postharvest_infrastructure_2024_2025.csv``).

LEVEL OF ANALYSIS: this table is **national**. Every row is tagged
``geographic_level = national``. It must never be joined to a district or
attached to an individual facility marker - the published figures are national
totals that already include every facility of that type in the country.

Capacity is only ever carried through as published. Nothing is inferred, and
``total_*`` columns are checked against ``existing_* + new_*`` rather than
silently recomputed.
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

OUT = PROCESSED_FILES["postharvest_infrastructure"]
SCRIPT = "scripts/data/build_postharvest_infrastructure.py"

NUMERIC_COLUMNS = [
    "existing_number",
    "existing_capacity_mt",
    "new_number",
    "new_capacity_mt",
    "total_number",
    "total_capacity_mt",
]


def main() -> int:
    df = pd.read_csv(raw_path("postharvest_infrastructure"))

    for col in NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["infrastructure_type"] = df["infrastructure_type"].astype(str).str.strip()
    df["capacity_unit"] = "mt"

    # Published totals are never recomputed here; validate_raw.py checks that
    # total_* agrees with existing_* + new_* and reports any disagreement.

    # Aggregate row for national KPI cards (explicitly derived, not published).
    derived_totals = {
        "infrastructure_type": "ALL TYPES (derived sum of published rows)",
        "existing_number": df["existing_number"].sum(),
        "existing_capacity_mt": df["existing_capacity_mt"].sum(),
        "new_number": df["new_number"].sum(),
        "new_capacity_mt": df["new_capacity_mt"].sum(),
        "total_number": df["total_number"].sum(),
        "total_capacity_mt": df["total_capacity_mt"].sum(),
        "period": df["period"].iloc[0] if "period" in df.columns else "",
        "geographic_level": "national",
        "source_url": df["source_url"].iloc[0] if "source_url" in df.columns else "",
        "capacity_unit": "mt",
        "is_derived_total": True,
    }
    df["is_derived_total"] = False
    df = pd.concat([df, pd.DataFrame([derived_totals])], ignore_index=True)

    df = df.sort_values(["is_derived_total", "infrastructure_type"]).reset_index(drop=True)
    df = add_provenance(df, "postharvest_infrastructure", SCRIPT)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)

    published = df[~df["is_derived_total"]]
    log(
        f"built {OUT}: {len(published)} national infrastructure types, "
        f"total capacity {df.loc[df['is_derived_total'], 'total_capacity_mt'].iloc[0]:,.0f} mt "
        f"(national totals - not facility-level capacity)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
