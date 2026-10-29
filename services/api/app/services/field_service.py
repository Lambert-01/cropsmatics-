"""Optional plot-evidence service for field allocation analysis.

The service deliberately aggregates before responding. Plot IDs, household IDs
and exact coordinates remain in the controlled source table and are not exposed
through the public maps endpoint.
"""

from __future__ import annotations

import pandas as pd

from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters


def _source_ids(frame: pd.DataFrame) -> list[str]:
    return sorted({str(value) for value in frame.get("source_id", pd.Series(dtype=object)).dropna()})


def _nullable(value):
    return None if pd.isna(value) else value


def field_observations(f: AnalyticsFilters) -> dict:
    try:
        frame = repo.field_crop_observations()
    except Exception:
        frame = pd.DataFrame()

    provenance_base = {
        "source_id": None,
        "source_period": f.period_key(),
        "method": "optional approved plot microdata, aggregated by period, district and crop",
        "limitations": [
            "plot evidence is a separate research layer and does not replace official SAS estimates",
            "plot identifiers and farmer/household identifiers are not exposed by this endpoint",
            "exact field boundaries are shown only when approved geometry exists in the source",
        ],
    }
    if frame.empty:
        return {
            "available": False,
            "message": (
                "No approved plot-level microdata is loaded for this deployment. "
                "District maps remain available; add an authorised NISR/AHS export "
                "under data/raw/nisr/sas_microdata/ and rebuild the data image."
            ),
            "rows": [],
            "count": 0,
            "n_plot_records": 0,
            "geometry_available": False,
            "n_records_with_geometry": 0,
            "provenance": provenance_base,
        }

    filtered = apply_filters(frame, f, crop_column="canonical_crop_name")
    if f.crop and filtered.empty and "crop_raw" in frame.columns:
        filtered = frame[frame["crop_raw"].astype(str).str.lower() == f.crop.lower()]
    if filtered.empty:
        provenance_base["source_id"] = ",".join(_source_ids(frame)) or None
        return {
            "available": False,
            "message": "No plot-level records match the selected period, crop or geography.",
            "rows": [],
            "count": 0,
            "n_plot_records": 0,
            "geometry_available": False,
            "n_records_with_geometry": 0,
            "provenance": provenance_base,
        }

    if "canonical_crop_name" not in filtered.columns:
        filtered = filtered.assign(canonical_crop_name=filtered.get("crop_raw"))
    working = filtered.copy()
    working["_crop"] = working["canonical_crop_name"]
    working["_area"] = pd.to_numeric(working.get("area_ha"), errors="coerce")
    working["_production"] = pd.to_numeric(working.get("production_kg"), errors="coerce")
    geometry = working.get("geometry_available", pd.Series(False, index=working.index))
    working["_geometry"] = geometry.fillna(False).astype(str).str.lower().isin(
        {"true", "1", "yes"}
    )
    group_columns = ["period_code", "district", "district_code", "province", "_crop"]
    grouped = working.groupby(group_columns, dropna=False, sort=True)
    rows: list[dict] = []
    for key, group in grouped:
        values = dict(zip(group_columns, key, strict=True))
        area = group["_area"].sum(min_count=1)
        production = group["_production"].sum(min_count=1)
        area_value = float(area) if pd.notna(area) else None
        production_value = float(production) if pd.notna(production) else None
        rows.append(
            {
                "period_code": _nullable(values.get("period_code")),
                "district": _nullable(values.get("district")),
                "district_code": _nullable(values.get("district_code")),
                "province": _nullable(values.get("province")),
                "crop": _nullable(values.get("_crop")),
                "n_plots": int(len(group)),
                "area_ha": area_value,
                "production_kg": production_value,
                "yield_kg_ha": (
                    production_value / area_value
                    if production_value is not None and area_value and area_value > 0
                    else None
                ),
                "n_with_geometry": int(group["_geometry"].sum()),
                "geometry_available": bool(group["_geometry"].any()),
                "source_ids": _source_ids(group),
            }
        )

    ids = _source_ids(filtered)
    provenance_base["source_id"] = ",".join(ids) or None
    periods = sorted({str(value) for value in filtered.get("period_code", pd.Series(dtype=object)).dropna()})
    provenance_base["source_period"] = f.period_key() or (periods[0] if len(periods) == 1 else ",".join(periods)) or None
    n_geometry = int(working["_geometry"].sum())
    return {
        "available": True,
        "message": (
            "Plot area and production are aggregated for the selected scope. "
            "Exact field boundaries are unavailable unless the source supplies approved geometry."
        ),
        "rows": rows,
        "count": len(rows),
        "n_plot_records": len(filtered),
        "geometry_available": n_geometry > 0,
        "n_records_with_geometry": n_geometry,
        "provenance": provenance_base,
    }
