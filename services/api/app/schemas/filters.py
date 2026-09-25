"""Reusable analytics filter model shared by dashboard/analytics/map endpoints.

Query parameters are consistent across endpoints so the frontend can drive all
of them from one URL-backed filter store:

    year, season, crop, province, district, benchmark_strategy, limit

``apply_filters`` centralises the (crop/district/province/period) slicing so no
Pandas filtering leaks into router files.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from fastapi import Query


@dataclass(frozen=True)
class AnalyticsFilters:
    year: int | None = None
    season: str | None = None
    crop: str | None = None
    province: str | None = None
    district: str | None = None
    benchmark_strategy: str = "national_crop_median"
    limit: int = 500


def analytics_filters(
    year: int | None = Query(None, ge=2000, le=2100),
    season: str | None = Query(None, description="A, B or C"),
    crop: str | None = Query(None, description="canonical crop name, e.g. Maize"),
    province: str | None = Query(None),
    district: str | None = Query(None),
    benchmark_strategy: str = Query(
        "national_crop_median",
        description=(
            "national_crop_median | national_crop_season_median | "
            "top_quartile_comparable_districts | agro_ecological_peer_group"
        ),
    ),
    limit: int = Query(500, ge=1, le=5000),
) -> AnalyticsFilters:
    """FastAPI dependency that collects the shared filter query parameters."""
    return AnalyticsFilters(
        year=year,
        season=season,
        crop=crop,
        province=province,
        district=district,
        benchmark_strategy=benchmark_strategy,
        limit=limit,
    )


CROP_COL = "canonical_crop_name"


def apply_filters(df: pd.DataFrame, f: AnalyticsFilters, *, crop_column: str = CROP_COL) -> pd.DataFrame:
    """Return ``df`` sliced by the filter values that are present.

    Matching is case-insensitive for text filters, and unknown values simply
    yield an empty frame (the UI then shows a proper empty state) rather than
    silently falling back to unrelated data.
    """
    out = df
    if f.year is not None and "year" in out.columns:
        out = out[out["year"] == f.year]
    if f.season and "season" in out.columns:
        out = out[out["season"].astype(str).str.upper() == f.season.upper()]
    if f.crop and crop_column in out.columns:
        out = out[out[crop_column].astype(str).str.lower() == f.crop.lower()]
    if f.province and "province" in out.columns:
        out = out[out["province"].astype(str).str.lower() == f.province.lower()]
    if f.district and "district" in out.columns:
        out = out[out["district"].astype(str).str.lower() == f.district.lower()]
    return out
