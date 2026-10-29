"""District map metrics endpoint (choropleth data)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.analytics import intervention_priority as ip
from app.schemas.analytics import WeightsIn
from app.schemas.common import Provenance
from app.schemas.dashboard import MapMetricsResponse
from app.schemas.field import FieldObservationsResponse
from app.schemas.filters import AnalyticsFilters, analytics_filters
from app.services import analytics_service, map_service

router = APIRouter(prefix="/maps", tags=["maps"])

MapMetric = Literal[
    "production",
    "harvested_area",
    "yield",
    "gap",
    "priority",
    "input_adoption",
    "irrigation",
    "erosion",
]


@router.get("/field-observations", response_model=FieldObservationsResponse)
def field_observations(
    f: AnalyticsFilters = Depends(analytics_filters),
) -> FieldObservationsResponse:
    """Privacy-aware plot area/production evidence for allocation analysis."""
    from app.services import field_service

    return FieldObservationsResponse(**field_service.field_observations(f))


@router.get("/district-metrics", response_model=MapMetricsResponse)
def district_metrics(
    metric: MapMetric = Query(
        map_service.DEFAULT_METRIC,
        description=(
            "production | harvested_area | yield | gap | priority | "
            "input_adoption | irrigation | erosion"
        ),
    ),
    purpose: Literal["productivity_support", "harvest_coordination"] = ip.DEFAULT_PURPOSE,
    threshold_pct: float = Query(0.0, ge=0, le=100),
    f: AnalyticsFilters = Depends(analytics_filters),
) -> MapMetricsResponse:
    """District choropleth values for one metric.

    The default metric (``production``) is an additive quantity that is valid for
    any crop selection, so the map renders before a crop is chosen. ``yield``
    requires a crop: raw yields from different crops are not comparable, so the
    endpoint returns an empty map plus a message instead of an all-crop
    aggregate. ``gap`` stays valid district-wide because it is relative to each
    crop's own benchmark.
    """
    result = map_service.district_metrics(
        f, metric=metric, purpose=purpose, threshold_pct=threshold_pct
    )
    limitations = [
        "district yield requires a crop selection; a gap is relative to each crop's own benchmark",
        "observational association, not causal effect",
        "districts without a valid observation return no value",
    ]
    unavailable = result.get("components_unavailable") or []
    if unavailable:
        limitations.append(
            "the priority score excluded these components because they carry no "
            f"measured value for the selected period: {', '.join(unavailable)}. "
            "Their weight was redistributed over the components that do have data; "
            "no score is reported as a blend of two releases."
        )
        if result.get("available_period"):
            limitations.append(
                "the excluded components are measured in the "
                f"{result['available_period']} district practice/land survey - "
                "select that period to include them"
            )
    if result.get("available_period") and result.get("message"):
        limitations.append(
            f"this layer is single-release; the latest district release is "
            f"{result['available_period']}"
        )
    return MapMetricsResponse(
        **result,
        provenance=Provenance(
            # Never default an empty or other-period map to the 2025 Season B
            # source: the selected release's own registered source is used, and a
            # null is preferable to a false attribution.
            source_id=analytics_service.resolved_source_id(result, f),
            source_period=result.get("period_code") or result["period"],
            reference_period=result.get("reference_period"),
            benchmark_strategy=f.benchmark_strategy,
            method=(
                "district aggregation of the canonical multi-period productivity "
                "panel for the selected period"
                if result.get("period_code")
                else "district aggregation of the processed district x crop table"
            ),
            limitations=limitations,
        ),
    )


@router.post("/district-metrics", response_model=MapMetricsResponse)
def weighted_priority_map(
    weights: WeightsIn,
    purpose: Literal["productivity_support", "harvest_coordination"] = ip.DEFAULT_PURPOSE,
    threshold_pct: float = Query(0.0, ge=0, le=100),
    f: AnalyticsFilters = Depends(analytics_filters),
) -> MapMetricsResponse:
    result = map_service.district_metrics(
        f, metric="priority", weights=weights.to_engine(),
        purpose=purpose, threshold_pct=threshold_pct,
    )
    return MapMetricsResponse(
        **result,
        provenance=Provenance(
            source_id=analytics_service.resolved_source_id(result, f),
            source_period=result.get("period_code") or result["period"],
            reference_period=result.get("reference_period"),
            benchmark_strategy=f.benchmark_strategy,
            method="district mean priority score from the selected intervention weights",
            limitations=[
                "priority scores use documented proxies and are not causal effects",
                "a component with no measured value for the selected period is "
                "excluded and its weight redistributed; it is never scored as a "
                "constant and never borrowed from another release",
            ],
        ),
    )
