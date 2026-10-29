#!/usr/bin/env python3
"""Build the privacy-safe field evidence artifact used by hosted API images.

The source extractor keeps respondent-level identifiers locally. This step
removes those identifiers and writes one row per period, district and
canonical crop so the public deployment can expose useful aggregate evidence
without shipping household IDs, plot IDs or coordinates.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd

from scripts.data.common import DATA_DIR, PIPELINE_VERSION, PROCESSED_DIR

ROOT = DATA_DIR.parent
OUTPUT = DATA_DIR / "deployment" / "field_crop_observations.csv"
REQUIRED = {
    "period_code",
    "district",
    "district_code",
    "province",
    "canonical_crop_name",
    "area_ha",
    "production_kg",
    "source_id",
}


def _sum(group: pd.DataFrame, column: str) -> float | None:
    values = pd.to_numeric(group[column], errors="coerce")
    value = values.sum(min_count=1)
    return float(value) if pd.notna(value) else None


def _plot_count(group: pd.DataFrame) -> int:
    if {"farmer_or_household_id", "plot_id"}.issubset(group.columns):
        keys = group[["farmer_or_household_id", "plot_id"]].dropna().astype(str).drop_duplicates()
        if not keys.empty:
            return int(len(keys))
    return int(len(group))


def build(
    input_path: Path = PROCESSED_DIR / "field_crop_observations.csv",
    output_path: Path = OUTPUT,
) -> pd.DataFrame:
    frame = pd.read_csv(input_path)
    missing = REQUIRED.difference(frame.columns)
    if missing:
        raise ValueError(f"field evidence input is missing columns: {sorted(missing)}")

    usable = frame.loc[
        frame["period_code"].notna()
        & frame["district"].notna()
        & frame["canonical_crop_name"].notna()
    ].copy()
    group_columns = [
        "period_code",
        "district",
        "district_code",
        "province",
        "canonical_crop_name",
    ]
    rows: list[dict] = []
    for key, group in usable.groupby(group_columns, dropna=False, sort=True):
        values = dict(zip(group_columns, key, strict=True))
        period = str(values["period_code"])
        area = _sum(group, "area_ha")
        production = _sum(group, "production_kg")
        stable = "|".join(str(values[column] or "") for column in group_columns)
        observation_id = hashlib.sha256(stable.encode("utf-8")).hexdigest()[:24]
        rows.append(
            {
                "field_observation_id": observation_id,
                "period_code": period,
                "year": int(period[:4]) if period[:4].isdigit() else None,
                "season": period[4:] if len(period) == 5 else None,
                "source_id": ",".join(sorted({str(value) for value in group["source_id"].dropna()})),
                "source_file": "NISR AHS 2024 Section 3/4 authorised export",
                "source_table": "crop production and agricultural practices",
                "source_row": None,
                "district": values["district"],
                "district_code": values["district_code"],
                "province": values["province"],
                "segment_id": None,
                "farmer_or_household_id": None,
                "plot_id": None,
                "crop_raw": None,
                "canonical_crop_name": values["canonical_crop_name"],
                "area_ha": area,
                "production_kg": production,
                "production_unit_original": "kg",
                "production_original": production,
                "yield_kg_ha": production / area if production and area and area > 0 else None,
                "latitude": None,
                "longitude": None,
                "geometry_wkt": None,
                "geometry_available": False,
                "access_level": "public_aggregate",
                "record_scope": "aggregated_plot_crop",
                "n_plot_records": int(len(group)),
                "n_plots": _plot_count(group),
                "processing_script": "build_field_deployment_artifact.py",
                "processing_version": PIPELINE_VERSION,
                "is_synthetic": False,
            }
        )

    result = pd.DataFrame(rows)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(output_path, index=False)
    print(f"built {output_path.relative_to(ROOT)}: {len(result)} public aggregate rows")
    return result


if __name__ == "__main__":
    build()
