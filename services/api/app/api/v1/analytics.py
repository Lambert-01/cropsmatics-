"""Analytics endpoints (productivity, factors, trends, priorities).

Routers only wire HTTP to services; all Pandas work lives in
``app.services.analytics_service`` and friends.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.analytics.productivity_gap import STRATEGIES
from app.schemas.analytics import (
    GapResponse,
    PriorityRequest,
    PriorityResponse,
)
from app.schemas.common import Provenance
from app.schemas.dashboard import (
    FactorsResponse,
    HeatmapResponse,
    PostHarvestResponse,
    ProductivityResponse,
    TrendResponse,
)
from app.schemas.filters import AnalyticsFilters, analytics_filters
from app.schemas.storage import StorageInfrastructureResponse
from app.services import (
    analytics_service,
    postharvest_service,
    storage_service,
    trend_service,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

_GAP_LIMITATIONS = [
    "observational district aggregates, not plot-level evidence",
    "associations are not causation",
    "benchmark choice materially affects the gap",
    "district data only exist for 2025 Season B",
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
            limitations=_GAP_LIMITATIONS,
        ),
    )


@router.get("/productivity", response_model=ProductivityResponse)
def productivity(f: AnalyticsFilters = Depends(analytics_filters)) -> ProductivityResponse:
    result = analytics_service.productivity(f)
    return ProductivityResponse(
        period=result["period"],
        n_observations=result["n_observations"],
        kpis=result["kpis"],
        rows=result["rows"],
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period=result["period"],
            benchmark_strategy=f.benchmark_strategy,
            method="district aggregation of processed district x crop table",
            limitations=_GAP_LIMITATIONS,
        ),
    )


@router.get("/factors", response_model=FactorsResponse)
def factors(f: AnalyticsFilters = Depends(analytics_filters)) -> FactorsResponse:
    result = analytics_service.factor_associations(f)
    return FactorsResponse(
        crop=result["crop"],
        district=result["district"],
        factors=result["factors"],
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
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            benchmark_strategy=f.benchmark_strategy,
            method="median district x crop value",
            limitations=_GAP_LIMITATIONS[:3],
        ),
    )


@router.get("/trends", response_model=TrendResponse)
def trends(crop: str | None = Query(None)) -> TrendResponse:
    result = trend_service.crop_trends(crop=crop)
    return TrendResponse(
        crop=result["crop"],
        kind=result["kind"],
        metric_units=result["metric_units"],
        points=result["points"],
        provenance=Provenance(
            source_id="NISR_SAS_2024_2026_NATIONAL_TRENDS",
            method=(
                "published crop yield for a selected crop; otherwise total production / total harvested area across non-aggregate crops"
            ),
            limitations=[
                "national series, not district estimates",
                "periods available depend on the published releases",
            ],
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
def post_harvest() -> PostHarvestResponse:
    result = postharvest_service.summary()
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
        "provenance": Provenance(
            source_id="NISR_SAS_2025B_IRRIGATION_WATER",
            source_period=result["period"],
            method="official district irrigation technique and water-source shares",
            limitations=["district shares only for 2025 Season B"],
        ).model_dump(),
    }


@router.get("/erosion")
def erosion(f: AnalyticsFilters = Depends(analytics_filters)) -> dict:
    result = analytics_service.erosion_summary(f)
    return {
        **result,
        "provenance": Provenance(
            source_id="NISR_SAS_2025B_EROSION",
            source_period=result["period"],
            method="official district erosion-control technique and severity shares",
            limitations=["district shares only for 2025 Season B"],
        ).model_dump(),
    }


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
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period="2025-B",
            method="weighted transparent score over normalized components",
            limitations=result["proxy_notes"],
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
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period="2025-B",
            method="user-adjusted weights over transparent normalized components",
            limitations=result["proxy_notes"],
        ),
    )
