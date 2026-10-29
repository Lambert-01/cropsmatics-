"""Analytics endpoints (productivity, factors, trends, priorities).

Routers only wire HTTP to services; all Pandas work lives in
``app.services.analytics_service`` and friends.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.analytics import intervention_priority as ip
from app.analytics.productivity_gap import STRATEGIES
from app.schemas.analytics import (
    ForecastStatusResponse,
    GapResponse,
    IndexedYieldResponse,
    PriorityRequest,
    PriorityResponse,
)
from app.schemas.common import Provenance
from app.schemas.dashboard import (
    FactorsResponse,
    FertilizerSourceResponse,
    HeatmapResponse,
    NationalBoardResponse,
    PostHarvestResponse,
    ProductivityResponse,
    TrendResponse,
)
from app.schemas.filters import AnalyticsFilters, analytics_filters
from app.schemas.storage import StorageInfrastructureResponse
from app.services import (
    analytics_service,
    canonical_trend_service,
    indexed_yield_service,
    meta_service,
    national_board_service,
    period_service,
    postharvest_service,
    storage_service,
    trend_service,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _resolved_source_id(result: dict, f: AnalyticsFilters) -> str | None:
    """Source id for a result, never a fabricated identifier (see the service)."""
    return analytics_service.resolved_source_id(result, f)


def _legacy_single_release_limit(what: str) -> str:
    """One limitation line for a legacy single-release extract.

    Names the period the extract actually covers, the multi-period practice series
    that supersedes it where one exists, and the endpoint that serves it. A bare
    "covers 2025 Season B only" left a reader with no way to find the newer data.
    """
    practice_range = period_service.practice_period_range()
    text = (
        f"legacy single-release extract: {what} cover "
        f"{period_service.single_release_scope()} only"
    )
    if practice_range:
        text += (
            f"; the multi-period practice observations cover {practice_range} and are "
            "served by GET /api/v1/analytics/practice-indicators"
        )
    return text


def _gap_limitations() -> list[str]:
    """Limitations built from the period catalogue, not from literals.

    The previous hardcoded "covers 2024A-2026B" became false as soon as 2022 and
    2023 were ingested. See /api/v1/meta/periods for the full matrix.
    """
    return [
        "observational district aggregates, not plot-level evidence",
        "associations are not causation",
        "benchmark choice materially affects the gap",
        f"district productivity covers {period_service.district_range()}",
        # Dataset by dataset: the practice observations are multi-period, the legacy
        # wide extract that a ranking component reads is not. "Input/practice,
        # irrigation and erosion are 2025B only" was true of the second and false of
        # the first.
        "district practice observations cover "
        f"{period_service.practice_period_range() or period_service.single_release_scope()}; "
        "the legacy single-release input/practice, irrigation and erosion extracts "
        f"cover {period_service.single_release_scope()} only",
    ]


@router.get("/productivity-gap", response_model=GapResponse)
def productivity_gap(
    strategy: str = Query("national_crop_median", description=f"one of {STRATEGIES}"),
    limit: int = Query(100, ge=1, le=1000),
) -> GapResponse:
    result = analytics_service.gap_report(strategy=strategy, limit=limit)
    return GapResponse(
        strategy=result["strategy"],
        count=result["count"],
        rows=result["rows"],
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period="2025-B",
            benchmark_strategy=strategy,
            method="PGI = 100*(benchmark-observed)/benchmark (crop median benchmark)",
            limitations=_gap_limitations(),
        ),
    )


@router.get("/productivity", response_model=ProductivityResponse)
def productivity(f: AnalyticsFilters = Depends(analytics_filters)) -> ProductivityResponse:
    result = analytics_service.productivity(f)
    return ProductivityResponse(
        period=result["period"],
        period_code=result.get("period_code"),
        available=result.get("available", True),
        unavailable_reason=result.get("unavailable_reason"),
        availability=result.get("availability"),
        n_observations=result["n_observations"],
        kpis=result["kpis"],
        primary_kpis=result.get("primary_kpis", []),
        secondary_kpis=result.get("secondary_kpis", []),
        yoy=result.get("yoy"),
        gap_bands=result.get("gap_bands", []),
        gap_summary=result.get("gap_summary"),
        rows=result["rows"],
        reference=result.get("reference"),
        provenance=Provenance(
            # Never attach the 2025 Season B legacy source to an empty 2022/2023
            # result: an explicitly requested period names its own registered
            # source, and null is preferable to an invented identifier.
            source_id=_resolved_source_id(result, f),
            source_period=f.period_code or result["period"],
            benchmark_strategy=f.benchmark_strategy,
            method=(
                "district aggregation of the canonical multi-period productivity "
                "panel; no cross-crop yield is computed"
                if f.period_code
                else "district aggregation of processed district x crop table; "
                "no cross-crop yield is computed"
            ),
            limitations=_gap_limitations()
            + [
                "the same-season change compares one season with the same season "
                "one year earlier; consecutive seasons are not a time series "
                "because they differ agronomically",
                "the gap distribution counts districts into bands whose cut points "
                "are returned with the counts",
            ],
        ),
    )


@router.get("/factors", response_model=FactorsResponse)
def factors(f: AnalyticsFilters = Depends(analytics_filters)) -> FactorsResponse:
    result = analytics_service.factor_associations(f)
    return FactorsResponse(
        crop=result["crop"],
        district=result["district"],
        factors=result["factors"],
        note=analytics_service.single_release_note(
            f, "district_factors", "district input/practice factor data"
        ),
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_FACTORS",
            source_period="2025-B",
            method="Crop-specific Pearson correlation between district factor adoption and yield; a crop selection is required",
            limitations=[
                "aggregate (ecological) association; not a causal effect",
                "confounding between practices is expected",
                "district-level correlation can differ from farm-level",
                "small samples are explicitly flagged",
            ],
        ),
    )


@router.get("/heatmap", response_model=HeatmapResponse)
def heatmap(
    metric: Literal["gap", "yield"] = Query("gap", description="gap | yield"),
    f: AnalyticsFilters = Depends(analytics_filters),
) -> HeatmapResponse:
    result = analytics_service.heatmap(f, metric=metric)
    return HeatmapResponse(
        metric=result["metric"],
        districts=result["districts"],
        crops=result["crops"],
        cells=result["cells"],
        max_value=result["max_value"],
        min_value=result["min_value"],
        unit=result["unit"],
        provenance=Provenance(
            source_id=_resolved_source_id(result, f),
            source_period=f.period_code,
            benchmark_strategy=f.benchmark_strategy,
            method="median district x crop value",
            limitations=_gap_limitations()[:3],
        ),
    )


@router.get("/trends", response_model=TrendResponse)
def trends(
    crop: str | None = Query(None),
    compare: str | None = Query(
        None,
        description=(
            "Comma-separated 2-5 crop names for an optional comparison view, e.g. "
            "Maize,Beans,Irish Potato. Absolute metrics only — yield is not compared "
            "across crops because different crops do not share a natural yield scale."
        ),
    ),
) -> TrendResponse:
    compare_crops: list[str] | None = None
    if compare:
        compare_crops = [c.strip() for c in compare.split(",") if c.strip()]
        if not (2 <= len(compare_crops) <= 5):
            raise HTTPException(
                status_code=422,
                detail="compare accepts 2 to 5 comma-separated crop names",
            )
    result = trend_service.crop_trends(crop=crop, compare_crops=compare_crops)
    return TrendResponse(
        crop=result.get("crop"),
        compared_crops=result.get("compared_crops"),
        kind=result["kind"],
        metric_units=result["metric_units"],
        points=result["points"],
        provenance=Provenance(
            source_id="NISR_SAS_2024_2026_NATIONAL_TRENDS",
            method=(
                "per-crop published series for the compare view; otherwise published crop yield "
                "for a selected crop; otherwise total production / total harvested area across "
                "non-aggregate crops"
            ),
            limitations=[
                "national series, not district estimates",
                trend_service.BREAKDOWN_LIMITATION,
                "periods available depend on the published releases",
                "compare view excludes yield: raw yields are not comparable across crop species",
            ],
        ),
    )


@router.get("/national-board", response_model=NationalBoardResponse)
def national_board(
    crops: str | None = Query(
        None,
        description=(
            "Comma-separated crop names to restrict the board to, e.g. "
            "Maize,Beans. Omit for every non-aggregate crop."
        ),
    ),
    period_code: str | None = Query(
        None,
        description=(
            "Restrict the board to one published period, e.g. 2025B. "
            "Takes precedence over year+season."
        ),
    ),
    year: int | None = Query(
        None,
        ge=2000,
        le=2100,
        description="Restrict the board to every published season of this year.",
    ),
    season: str | None = Query(
        None,
        description="A, B or C; combine with year to select one period.",
    ),
) -> NationalBoardResponse:
    """The whole national crop board in one read.

    Every crop's series is returned on one shared period axis (null for a period
    the release did not tabulate), and the same-season delta is computed here.
    The mobile board uses this instead of one request per crop, so the numbers
    stay authoritative and the client only presents them.
    """
    names: list[str] | None = None
    if crops:
        names = [c.strip() for c in crops.split(",") if c.strip()]
        if not (2 <= len(names) <= 40):
            raise HTTPException(
                status_code=422,
                detail="national-board accepts between 2 and 40 comma-separated crop names",
            )

    # An unpublished period is a 422 that lists the published ones, matching the
    # shared analytics filter: a selector must not be able to ask for a season
    # NISR has not released and receive a silently empty board.
    scoped_year, scoped_season = year, season.upper() if season else None
    if period_code:
        try:
            scoped_year, scoped_season = period_service.parse(period_code)
        except period_service.UnknownPeriodError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if not period_service.is_published(f"{scoped_year}{scoped_season}"):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"period_code {period_code!r} has not been published; "
                    f"available: {period_service.period_codes()}"
                ),
            )
    elif scoped_season and scoped_season not in period_service.SEASON_LETTERS:
        raise HTTPException(
            status_code=422,
            detail=f"season {season!r} is not one of {period_service.SEASON_LETTERS}",
        )

    result = national_board_service.board(
        names, year=scoped_year, season=scoped_season
    )
    if not result["periods"]:
        # Say what the scope really covers instead of returning an empty axis that
        # reads as "nothing was measured".
        published = period_service.period_codes()
        raise HTTPException(
            status_code=422,
            detail=(
                f"no published national period matches year={scoped_year!r} "
                f"season={scoped_season!r}; available periods: {published}"
            ),
        )
    return NationalBoardResponse(
        **result,
        provenance=Provenance(
            source_id=",".join(result.get("source_ids") or [
                "NISR_SAS_CANONICAL_CROP_PRODUCTIVITY"
            ]),
            source_period="-".join([result["periods"][0], result["periods"][-1]])
            if result["periods"]
            else None,
            method=(
                "published per-crop national series, aligned to one period axis; "
                "same-season delta computed server-side from two published "
                "observations; official aggregate groups excluded"
            ),
            limitations=[
                "national series only, never a district value",
                trend_service.BREAKDOWN_LIMITATION,
                "a period the release did not tabulate is returned as null and "
                "is never interpolated",
                "the same-season comparison is only reported when both the "
                "current and the previous-year observation exist",
                "raw yield is published per crop and is never compared across "
                "crop species",
            ],
        ),
    )


@router.get("/indexed-yield", response_model=IndexedYieldResponse)
def indexed_yield(
    crops: str | None = Query(
        None,
        description=(
            "Comma-separated 2-5 crop names, e.g. Maize,Beans. Omit for every "
            "non-aggregate crop the national trend table carries."
        ),
    ),
) -> IndexedYieldResponse:
    """Per-crop yield index against each crop's own published baseline.

    Raw yields are not comparable across crop species, so this endpoint never
    averages them. Each crop is indexed to the median of its own published
    national yields (= 100), which is the only way to show several crops on one
    axis without inventing a common scale. Eligibility rules and limitations are
    part of the response, not an afterthought.
    """
    names: list[str] | None = None
    if crops:
        names = [c.strip() for c in crops.split(",") if c.strip()]
        if not (2 <= len(names) <= 5):
            raise HTTPException(
                status_code=422,
                detail="indexed-yield accepts 2 to 5 comma-separated crop names",
            )

    result = indexed_yield_service.indexed_yield(names)
    return IndexedYieldResponse(
        **result,
        provenance=Provenance(
            source_id="NISR_SAS_2024_2026_NATIONAL_TRENDS",
            source_period="2024B-2026A",
            method=(
                "index = 100 * published national yield / the crop's own median "
                "published national yield; computed per crop, never pooled "
                "across crops"
            ),
            limitations=indexed_yield_service.LIMITATIONS,
        ),
    )


@router.get("/canonical-trend")
def canonical_trend(
    crop: str | None = Query(
        None,
        description=(
            "One crop name for a published per-crop national series, e.g. Maize. "
            "Omit for the summed national totals."
        ),
    ),
    district: str | None = Query(
        None,
        description=(
            "A district name. Requires crop; answers a district x crop trend from "
            "the canonical panel."
        ),
    ),
) -> dict:
    """A consistent 2022A-2026B trend from the canonical productivity panel.

    Distinct from the legacy ``/analytics/trends`` (which still serves the
    single-release context table for the pages that need it): this endpoint uses
    the panel's published national rows, so the axis is every period NISR has
    released and the methodology does not mix releases in one visual.
    """
    try:
        if district and crop:
            return canonical_trend_service.district_crop_trend(district, crop)
        if district and not crop:
            raise HTTPException(
                status_code=422,
                detail="a district trend requires a crop selection",
            )
        return canonical_trend_service.national_trend(crop)
    except canonical_trend_service.CanonicalTrendUnavailable as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/input-adoption", response_model=TrendResponse)
def input_adoption() -> TrendResponse:
    result = trend_service.input_adoption()
    return TrendResponse(
        kind=result["kind"],
        metric_units=result["metric_units"],
        points=result["points"],
        provenance=Provenance(
            source_id="NISR_SAS_2024_2026_NATIONAL_INPUT_TRENDS",
            method="national published adoption percentages",
            limitations=[
                "national adoption percentages, not district values",
                "some series start later than others and are returned as null",
            ],
        ),
    )


@router.get("/fertilizer-source", response_model=FertilizerSourceResponse)
def fertilizer_source(f: AnalyticsFilters = Depends(analytics_filters)) -> FertilizerSourceResponse:
    """National fertilizer supply-channel context for the selected period."""
    result = trend_service.fertilizer_source_snapshot(f.period_key())
    return FertilizerSourceResponse(
        **result,
        provenance=Provenance(
            source_id="NISR_SAS_2022_ANNUAL,NISR_SAS_2023_ANNUAL,NISR_SAS_2024_ANNUAL,NISR_SAS_2025_ANNUAL,NISR_SAS_2026A,NISR_SAS_2026B",
            source_period=result.get("period_code"),
            method=(
                "mean reported supply-channel share across fertilizer types for "
                "the selected national period; the published National roll-up "
                "is excluded from the mean"
            ),
            limitations=[
                "national context only; not a district or crop measure",
                "shares describe reported source channels, not fertilizer quantity, price or availability",
                "this association does not establish fertilizer effectiveness or causality for yield",
            ],
        ),
    )


@router.get("/post-harvest", response_model=PostHarvestResponse)
@router.get("/postharvest", response_model=PostHarvestResponse, include_in_schema=False)
def post_harvest(
    f: AnalyticsFilters = Depends(analytics_filters),
) -> PostHarvestResponse:
    """National crop-level post-harvest use/loss shares.

    Only ``crop`` meaningfully filters this dataset: the published table is a
    single national 2025-B period with no district dimension, so year/season
    and district are ignored rather than silently pretended to apply.
    """
    try:
        result = postharvest_service.summary(crop=f.crop)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc).strip("'") + " — see /api/v1/crops for supported names",
        ) from exc
    return PostHarvestResponse(**result)


@router.get("/storage-infrastructure", response_model=StorageInfrastructureResponse)
def storage_infrastructure() -> StorageInfrastructureResponse:
    """National MINAGRI post-harvest infrastructure plus cold-chain program context.

    National/program level only: these are not facility capacities and are not
    joined to districts.
    """
    return StorageInfrastructureResponse(**storage_service.infrastructure_summary())


@router.get("/irrigation")
def irrigation(f: AnalyticsFilters = Depends(analytics_filters)) -> dict:
    result = analytics_service.irrigation_summary(f)
    return {
        **result,
        "note": analytics_service.single_release_note(
            f, "irrigation_water", "district irrigation and water-source data"
        ),
        "provenance": Provenance(
            source_id="NISR_SAS_2025B_IRRIGATION_WATER",
            source_period=result["period"],
            method="official district irrigation technique and water-source shares",
            limitations=[_legacy_single_release_limit("irrigation and water-source shares")],
        ).model_dump(),
    }


@router.get("/erosion")
def erosion(f: AnalyticsFilters = Depends(analytics_filters)) -> dict:
    result = analytics_service.erosion_summary(f)
    return {
        **result,
        "note": analytics_service.single_release_note(
            f, "erosion_control", "district erosion-control data"
        ),
        "provenance": Provenance(
            source_id="NISR_SAS_2025B_EROSION",
            source_period=result["period"],
            method="official district erosion-control technique and severity shares",
            limitations=[_legacy_single_release_limit("erosion-control shares")],
        ).model_dump(),
    }


@router.get("/practice-indicators")
def practice_indicators(
    f: AnalyticsFilters = Depends(analytics_filters),
    domain: str | None = Query(
        None,
        description=(
            "practice | irrigation | water_source | erosion_control | "
            "erosion_severity | fertilizer_source_district; omit for every domain"
        ),
    ),
) -> dict:
    """Multi-period district practice/irrigation/erosion observations.

    This is the endpoint that surfaces the 78 SAS sheets which were mapped and
    ingested with lineage but had no processed dataset behind them. Unlike the
    legacy single-release ``/analytics/irrigation`` and ``/analytics/erosion``,
    which stay exactly as they are, this one carries the real period dimension
    (with domain-specific availability across the published calendar) and reports
    per-indicator availability.
    """
    result = analytics_service.practice_indicator_history(f, domain)
    source_ids = sorted(
        {
            str(row["source_id"])
            for row in result.get("observations", [])
            if row.get("source_id")
        }
    )
    periods = result.get("periods") or []
    return {
        **result,
        "provenance": Provenance(
            # Derived from the rows that answered, never an invented aggregate id.
            source_id=",".join(source_ids) if source_ids else "NISR_SAS_PRACTICE_OBSERVATION",
            source_period=result.get("period"),
            method=(
                "official NISR SAS district shares for agricultural practices, "
                "irrigation technique, water source, erosion control and erosion "
                "severity, extracted per published release"
            ),
            limitations=[
                (
                    f"published periods in this selection: {periods[0]}-{periods[-1]}"
                    if periods
                    else "no periods are available in this deployment"
                ),
                (
                    "core practice, irrigation, water-source and erosion domains "
                    "cover 2024A-2026B; district fertilizer-source shares cover "
                    "2022A-2026B"
                ),
                (
                    "the legacy single-release district extracts served by "
                    "/analytics/irrigation and /analytics/erosion still cover "
                    f"{period_service.single_release_scope()} only"
                ),
                "a published null is returned as null, never as zero",
                "an indicator absent for a period simply has no rows",
            ],
        ).model_dump(),
    }


@router.get("/postharvest-history")
def postharvest_history(f: AnalyticsFilters = Depends(analytics_filters)) -> dict:
    """Multi-period crop post-harvest use shares (2024A-2026B), long form."""
    result = analytics_service.postharvest_history(f)
    source_ids = sorted(
        {
            str(row["source_id"])
            for row in result.get("observations", [])
            if row.get("source_id")
        }
    )
    return {
        **result,
        "provenance": Provenance(
            source_id=",".join(source_ids) if source_ids else "NISR_SAS_POSTHARVEST_OBSERVATION",
            source_period=result.get("period"),
            method="official NISR SAS crop post-harvest use shares, extracted per published release",
            limitations=[
                "shares are published per crop and period and are not comparable across crops",
                (
                    f"{result.get('shares_off_total', 0)} period x crop group(s) do not sum to "
                    "100 within the rounding tolerance; they are flagged, never rescaled"
                ),
                "the legacy single-release table (/analytics/post-harvest) is unchanged",
            ],
        ).model_dump(),
    }


@router.get("/forecast-status", response_model=ForecastStatusResponse)
def forecast_status(
    crop: str | None = Query(None, max_length=80),
    season: str | None = Query(None, pattern="^[ABCabc]$"),
    district: str | None = Query(None, max_length=80),
    province: str | None = Query(None, max_length=80),
    period_code: str | None = Query(None, pattern=r"^\d{4}[ABCabc]$"),
) -> ForecastStatusResponse:
    """Whether a validated forecast may be served, and why not when it may not.

    The answer is read from the chronological backtest report
    (``ml/reports/forecast/backtest.json``), which is the publication gate: a
    target is only publishable when a default-policy rolling-origin backtest
    cleared every gate. With no passing target the response still returns 200 —
    "no forecast, here is the evidence verdict" is a complete result, not an
    error — and every blocking reason travels with it so a client can explain
    the absence honestly instead of hiding the workspace.
    """
    status = meta_service.forecast_status(
        crop=crop, season=season, district=district, province=province, period_code=period_code,
    )
    return ForecastStatusResponse(
        **status,
        provenance=Provenance(
            source_id="ML_FORECAST_BACKTEST",
            source_period=status.get("generated"),
            method=(
                "rolling-origin expanding-window backtest against naive "
                "baselines; publication decided by a fixed default policy"
            ),
            limitations=[
                "a forecast is served only when its target passed every "
                "publication gate under the default policy",
                "associations and scenarios elsewhere in the product are not "
                "forecasts and are never derived from this report",
                "skill is scored one step ahead on the same season only",
                "no causal claim about any input is implied by any target here",
            ],
        ),
    )


def _priority_limitations(result: dict) -> list[str]:
    """Proxy notes plus an explicit statement of what was excluded, and why.

    A reader must be able to tell from the response itself that an excluded
    component was not scored, instead of inferring it from a component that
    happens to be zero.
    """
    limitations = list(result["proxy_notes"])
    unavailable = result.get("components_unavailable") or []
    if unavailable:
        limitations.append(
            "the following components carry no measured value for the selected "
            f"period and were excluded from the score: {', '.join(unavailable)}. "
            "Their weight was redistributed over the components that do have data, "
            "so no neutral constant enters the score."
        )
    return limitations


#: The planning purposes the ranking endpoint answers. A value outside this set is
#: a 422 rather than a silent fallback to the default, because the two purposes
#: produce lists that mean different things.
PRIORITY_PURPOSES = ip.PURPOSES


def _priority_payload(result: dict, f: AnalyticsFilters, method: str) -> dict:
    """Everything a client needs to read a ranking honestly, from one place.

    Built once for both the read and the weighted-recompute route, so the two
    cannot describe the same ranking differently.
    """
    return {
        "weights": result["weights"],
        "rows": result["rows"],
        "purpose": result["purpose"],
        "purpose_label": result["purpose_label"],
        "purpose_note": result["purpose_note"],
        "methodology_version": result["methodology_version"],
        "shortfall_threshold_pct": result["shortfall_threshold_pct"],
        "reference_population": result["reference_population"],
        "reference_population_note": result["reference_population_note"],
        "n_eligible": result["n_eligible"],
        "n_ineligible": result["n_ineligible"],
        "ineligible": result["ineligible"],
        "proxy_notes": result["proxy_notes"],
        "components_unavailable": result["components_unavailable"],
        "component_availability": result["component_availability"],
        "provenance": Provenance(
            source_id=_resolved_source_id(result, f),
            source_period=result.get("period_code"),
            method=method,
            limitations=_priority_limitations(result),
        ),
    }


@router.get("/intervention-priorities", response_model=PriorityResponse)
def intervention_priorities(
    limit: int = Query(50, ge=1, le=500),
    purpose: str = Query(
        ip.DEFAULT_PURPOSE,
        description=(
            "productivity_support (candidates must have a positive published yield "
            "shortfall) | harvest_coordination (operational scale and perishability; "
            "not a shortfall ranking)"
        ),
    ),
    threshold_pct: float = Query(
        0.0, ge=0, le=100, description="how far below the benchmark counts as a shortfall"
    ),
    f: AnalyticsFilters = Depends(analytics_filters),
) -> PriorityResponse:
    if purpose not in PRIORITY_PURPOSES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"unknown planning purpose {purpose!r}; expected one of "
                f"{', '.join(PRIORITY_PURPOSES)}"
            ),
        )
    result = analytics_service.priorities(
        limit=limit, f=f, purpose=purpose, threshold_pct=threshold_pct
    )
    return PriorityResponse(
        **_priority_payload(
            result, f, "weighted transparent score over the reference population"
        )
    )


@router.post("/intervention-priorities", response_model=PriorityResponse)
def intervention_priorities_weighted(
    payload: PriorityRequest,
    f: AnalyticsFilters = Depends(analytics_filters),
) -> PriorityResponse:
    result = analytics_service.priorities(
        limit=payload.limit,
        weights=payload.weights.to_engine() if "weights" in payload.model_fields_set else None,
        f=f,
        purpose=payload.purpose,
        threshold_pct=payload.threshold_pct,
    )
    return PriorityResponse(
        **_priority_payload(
            result, f, "user-adjusted weights over the reference population"
        )
    )
