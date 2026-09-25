#!/usr/bin/env python3
"""Build the data-coverage matrix.

The interface must never imply that detailed district data exist for every
period. This script derives, from the processed tables themselves, which
dataset covers which period at which geographic level:

    district       -> real district-level values available
    national       -> national values only for this period
    national_crop  -> national values at crop level only

National context periods (2024B/2025A/2026A) are recorded for the productivity
dataset even though district rows only exist for 2025B, so the UI can say
"showing national statistics" instead of fabricating district estimates.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import PROCESSED_DIR, PROCESSED_FILES, log

OUT = PROCESSED_FILES["data_coverage"]
SCRIPT = "scripts/data/build_data_coverage.py"

# Datasets whose district rows may be sparse but whose national counterpart
# exists for other periods (from the national trend tables).
DISTRICT_DATASETS = [
    "district_crop_productivity",
    "district_factors",
    "irrigation_water",
    "erosion_control",
]


def _period(df: pd.DataFrame) -> pd.Series:
    if {"year", "season"}.issubset(df.columns):
        return df["year"].astype(str) + df["season"].astype(str)
    if "year" in df.columns:
        return df["year"].astype(str)
    if "period" in df.columns:
        # National add-on tables use a free-text reporting period (e.g. 2024/2025).
        return df["period"].astype(str)
    return pd.Series(["" for _ in range(len(df))], index=df.index)


def _coverage_for(name: str, df: pd.DataFrame) -> list[dict]:
    periods = _period(df)
    rows: list[dict] = []
    for period, group in df.assign(_period=periods).groupby("_period"):
        has_district = "district" in group.columns and group["district"].notna().any()
        n_districts = int(group["district"].nunique()) if has_district else 0
        n_crops = int(group["canonical_crop_name"].nunique()) if "canonical_crop_name" in group else 0
        if has_district and n_districts > 1:
            level = "district"
        elif n_crops > 0:
            level = "national_crop"
        else:
            level = "national"
        rows.append(
            {
                "dataset": name,
                "period": period,
                "coverage_level": level,
                "n_districts": n_districts,
                "n_crops": n_crops,
                "source_id": group["source_id"].iloc[0] if "source_id" in group else "",
            }
        )
    return rows


def main() -> int:
    rows: list[dict] = []
    available: dict[str, pd.DataFrame] = {}
    for name in [
        "district_crop_productivity",
        "district_factors",
        "irrigation_water",
        "erosion_control",
        "crop_postharvest_use",
        "national_crop_trends",
        "national_input_trends",
        "cold_chain_context",
        "postharvest_infrastructure",
        "cold_chain_network_summary",
    ]:
        path = PROCESSED_DIR / PROCESSED_FILES[name]
        if path.exists():
            available[name] = pd.read_csv(path)
            rows.extend(_coverage_for(name, available[name]))

    # Productivity only has district rows for 2025B; add the national periods.
    if "district_crop_productivity" in available:
        district_periods = {r["period"] for r in rows if r["dataset"] == "district_crop_productivity"}
        if "national_crop_trends" in available:
            for period in _period(available["national_crop_trends"]).dropna().unique():
                if period not in district_periods:
                    rows.append(
                        {
                            "dataset": "district_crop_productivity",
                            "period": period,
                            "coverage_level": "national",
                            "n_districts": 0,
                            "n_crops": 0,
                            "source_id": "NISR_SAS_2024_2026_NATIONAL_TRENDS",
                        }
                    )

    out = pd.DataFrame(rows).sort_values(["dataset", "period"])
    out["processing_script"] = SCRIPT
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out.to_csv(PROCESSED_DIR / OUT, index=False)
    log(f"built {OUT}: {len(out)} dataset x period coverage rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
