"""Reusable analytics filter model shared by dashboard/analytics/map endpoints.

Query parameters are consistent across endpoints so the frontend can drive all
of them from one URL-backed filter store:

    period_code, year, season, crop, province, district, benchmark_strategy, limit

``period_code`` (``2025B``) is the canonical period selector and takes precedence
over the separate ``year``/``season`` pair, which is kept for backward
compatibility with existing clients. An unpublished period (for example 2026C) is
rejected with a 422 listing the published ones rather than silently returning an
empty page.

``apply_filters`` centralises the (crop/district/province/period) slicing so no
Pandas filtering leaks into router files.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd
from fastapi import HTTPException, Query

from app.services import period_service


BenchmarkStrategy = Literal[
    "national_crop_median",
    "national_crop_season_median",
    "top_quartile_comparable_districts",
    "agro_ecological_peer_group",
]


@dataclass(frozen=True)
class AnalyticsFilters:
    period_code: str | None = None
    year: int | None = None
    season: str | None = None
    crop: str | None = None
    province: str | None = None
    district: str | None = None
    benchmark_strategy: str = "national_crop_median"
    limit: int = 500

    def period_key(self) -> str | None:
        """The period this filter selects: ``period_code`` first, then year+season."""
        if self.period_code:
            return self.period_code
        if self.year and self.season:
            return period_service.format_code(self.year, self.season)
        return None


def analytics_filters(
    period_code: str | None = Query(
        None,
        description=(
            "published period, e.g. 2025B or 2026B; see /api/v1/meta/periods. "
            "Takes precedence over year+season."
        ),
    ),
    year: int | None = Query(None, ge=2000, le=2100),
    season: str | None = Query(None, description="A, B or C"),
    crop: str | None = Query(None, description="canonical crop name, e.g. Maize"),
    province: str | None = Query(None),
    district: str | None = Query(None),
    benchmark_strategy: BenchmarkStrategy = Query(
        "national_crop_median",
        description=(
            "national_crop_median | national_crop_season_median | "
            "top_quartile_comparable_districts | agro_ecological_peer_group"
        ),
    ),
    limit: int = Query(500, ge=1, le=5000),
) -> AnalyticsFilters:
    """FastAPI dependency that collects the shared filter query parameters."""
    canonical: str | None = None
    if period_code:
        try:
            canonical = period_service.require(period_code)
        except period_service.UnknownPeriodError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AnalyticsFilters(
        period_code=canonical,
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
    if f.period_code:
        # Prefer a real period column; otherwise fall back to year+season so the
        # same filter works on the legacy single-release tables.
        if "period_code" in out.columns:
            out = out[out["period_code"].astype(str) == f.period_code]
        elif {"year", "season"}.issubset(out.columns):
            year, season = period_service.parse(f.period_code)
            out = out[
                (out["year"] == year)
                & (out["season"].astype(str).str.upper() == season)
            ]
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
