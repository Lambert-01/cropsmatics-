"""Analytics endpoints (productivity, factors, trends, priorities).

Routers only wire HTTP to services; all Pandas work lives in
``app.services.analytics_service`` and friends.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.analytics.productivity_gap import STRATEGIES
from app.schemas.analytics import (
    GapResponse,
    IndexedYieldResponse,
    PriorityRequest,
    PriorityResponse,
)
from app.schemas.common import Provenance
from app.schemas.dashboard import (
    FactorsResponse,
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
    indexed_yield_service,
    national_board_service,
    period_service,
    postharvest_service,
    storage_service,
    trend_service,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

def _gap_limitations() -> list[str]:
    """Limitations built from the period catalogue, not from literals.

    The previous hardcoded "covers 2024A-2026B" became false as soon as 2022 and
    2023 were ingested. See /api/v1/meta/periods for the full matrix.
    """
    return [
        "observational district aggregates, not plot-level evidence",
        "associations are not causation",
        "benchmark choice materially affects the gap",
        f"district productivity covers {period_service.district_range()}; district "
        f"input/practice, irrigation and erosion tables cover "
        f"{period_service.single_release_scope()} only",
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
        n_observations=result["n_observations"],
        kpis=result["kpis"],
        primary_kpis=result.get("primary_kpis", []),
        secondary_kpis=result.get("secondary_kpis", []),
        yoy=result.get("yoy"),
        gap_bands=result.get("gap_bands", []),
        gap_summary=result.get("gap_summary"),
        rows=result["rows"],
        provenance=Provenance(
            source_id=result.get("source_id") or "NISR_SAS_2025B_DISTRICT_CROP",
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
            source_id=(
                f"NISR_SAS_{f.period_code}"
                if f.period_code
                else "NISR_SAS_2025B_DISTRICT_CROP"
            ),
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
            source_id="NISR_SAS_2024_2026_NATIONAL_TRENDS",
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


@router.get("/post-harvest", response_model=PostHarvestResponse)
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
            limitations=["district shares cover 2025 Season B only"],
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
            limitations=["district shares cover 2025 Season B only"],
        ).model_dump(),
    }


@router.get("/practice-indicators")
def practice_indicators(
    f: AnalyticsFilters = Depends(analytics_filters),
    domain: str | None = Query(
        None,
        description=(
            "practice | irrigation | water_source | erosion_control | "
            "erosion_severity; omit for every domain"
        ),
    ),
) -> dict:
    """Multi-period district practice/irrigation/erosion observations.

    This is the endpoint that surfaces the 78 SAS sheets which were mapped and
    ingested with lineage but had no processed dataset behind them. Unlike the
    legacy single-release ``/analytics/irrigation`` and ``/analytics/erosion``,
    which stay exactly as they are, this one carries the real period dimension
    (2024A-2026B) and reports per-indicator availability.
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
                    f"published periods: {periods[0]}-{periods[-1]}"
                    if periods
                    else "no periods are available in this deployment"
                ),
                "the coverage audit's legacy district tables still serve 2025 Season B only",
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


@router.get("/intervention-priorities", response_model=PriorityResponse)
def intervention_priorities(
    limit: int = Query(50, ge=1, le=500),
    f: AnalyticsFilters = Depends(analytics_filters),
) -> PriorityResponse:
    result = analytics_service.priorities(limit=limit, f=f)
    return PriorityResponse(
        weights=result["weights"],
        rows=result["rows"],
        proxy_notes=result["proxy_notes"],
        components_unavailable=result["components_unavailable"],
        component_availability=result["component_availability"],
        provenance=Provenance(
            source_id=(
                result.get("source_id")
                or (f"NISR_SAS_{f.period_code}" if f.period_code else "NISR_SAS_2025B_DISTRICT_CROP")
            ),
            source_period=f.period_code or "2025-B",
            method="weighted transparent score over normalized components",
            limitations=_priority_limitations(result),
        ),
    )


@router.post("/intervention-priorities", response_model=PriorityResponse)
def intervention_priorities_weighted(
    payload: PriorityRequest,
    f: AnalyticsFilters = Depends(analytics_filters),
) -> PriorityResponse:
    result = analytics_service.priorities(
        limit=payload.limit, weights=payload.weights.to_engine(), f=f
    )
    return PriorityResponse(
        weights=result["weights"],
        rows=result["rows"],
        proxy_notes=result["proxy_notes"],
        components_unavailable=result["components_unavailable"],
        component_availability=result["component_availability"],
        provenance=Provenance(
            source_id=(
                result.get("source_id")
                or (f"NISR_SAS_{f.period_code}" if f.period_code else "NISR_SAS_2025B_DISTRICT_CROP")
            ),
            source_period=f.period_code or "2025-B",
            method="user-adjusted weights over transparent normalized components",
            limitations=_priority_limitations(result),
        ),
    )
