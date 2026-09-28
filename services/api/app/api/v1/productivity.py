"""Period-aware productivity endpoints.

These read the canonical multi-period panel (``crop_productivity.csv``), which
carries district area/harvest/production/yield for every published period
(2024A-2026B). They are the period-first counterpart to ``/analytics/productivity``
(kept unchanged for existing clients) and are the endpoints a client should use
when it wants a specific season.

Both endpoints state which period the numbers describe, list the periods that
exist, and reject an unpublished period (``2026C``) instead of returning an empty
page. Nothing is imputed: a blank official cell stays null.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.common import Provenance
from app.schemas.periods import (
    PeriodProductivityResponse,
    PeriodTrendPoint,
    PeriodTrendResponse,
)
from app.services import period_service, productivity_service

router = APIRouter(prefix="/productivity", tags=["productivity"])


@router.get("", response_model=PeriodProductivityResponse)
def productivity(
    period_code: str | None = Query(
        None,
        description=(
            "published period, e.g. 2024A, 2025B, 2026B. Defaults to the latest "
            "period that carries district observations."
        ),
    ),
    crop: str | None = Query(None, description="canonical crop name, e.g. Maize"),
    district: str | None = Query(None),
    province: str | None = Query(None),
    geography_level: str = Query(
        "DISTRICT",
        pattern="^(DISTRICT|NATIONAL)$",
        description="DISTRICT (default) or NATIONAL aggregate rows",
    ),
    limit: int = Query(500, ge=1, le=5000),
) -> PeriodProductivityResponse:
    """District x crop productivity for one published period."""
    try:
        result = productivity_service.panel_rows(
            period_code=period_code,
            crop=crop,
            district=district,
            province=province,
            geography_level=geography_level,
            limit=limit,
        )
    except period_service.UnknownPeriodError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return PeriodProductivityResponse(
        period_code=result["period_code"],
        label=result["label"],
        defaulted_to_latest=result["defaulted_to_latest"],
        filters=result["filters"],
        n_observations=result["n_observations"],
        n_districts=result["n_districts"],
        n_crops=result["n_crops"],
        available_periods=result["available_periods"],
        rows=result["rows"],
        provenance=Provenance(
            source_id=result["source_id"],
            source_period=result["period_code"],
            method=(
                "published SAS district x crop aggregates, one row per period x "
                "geography x crop; values are reported as published and never imputed"
            ),
            limitations=[
                "observational district aggregates, not plot-level evidence",
                "seasonal crop coverage differs between releases (Season C "
                "releases tabulate fewer crops)",
                "national and SSF/LSF rows are returned only when "
                "geography_level=NATIONAL is requested",
            ],
        ),
    )


@router.get("/trend", response_model=PeriodTrendResponse)
def trend(
    crop: str = Query(..., description="canonical crop name, e.g. Maize"),
    district: str | None = Query(
        None,
        description=(
            "district name for a district series; omit for the published national "
            "series (the platform never sums districts into a national figure)"
        ),
    ),
    season: str | None = Query(
        None,
        pattern="^[ABCabc]$",
        description="restrict to one season across years, e.g. B for every Season B",
    ),
) -> PeriodTrendResponse:
    """One crop across the published periods, for a district or nationally."""
    try:
        result = productivity_service.crop_trend(crop=crop, district=district, season=season)
    except period_service.UnknownPeriodError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if result["missing"]:
        raise HTTPException(
            status_code=404,
            detail=(
                f"crop {crop!r} has no published productivity rows; "
                f"see /api/v1/crops for supported names"
            ),
        )

    return PeriodTrendResponse(
        crop=result["crop"],
        district=result["district"],
        geography_scope=result["geography_scope"],
        unit=productivity_service.UNITS,
        points=[PeriodTrendPoint(**point) for point in result["points"]],
        available_periods=result["available_periods"],
        provenance=Provenance(
            source_id=result["source_id"],
            source_period="2024A-2026B",
            method=(
                "published district (or national) productivity rows per period; "
                "null means the crop was not tabulated for that period"
            ),
            limitations=[
                "periods missing from the series were not published for that crop",
                "district series cannot be aggregated into a national figure here",
            ],
        ),
    )
