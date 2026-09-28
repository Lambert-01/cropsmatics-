"""District map metrics endpoint (choropleth data)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.schemas.analytics import WeightsIn
from app.schemas.common import Provenance
from app.schemas.dashboard import MapMetricsResponse
from app.schemas.filters import AnalyticsFilters, analytics_filters
from app.services import map_service

router = APIRouter(prefix="/maps", tags=["maps"])

MapMetric = Literal["yield", "gap", "priority", "input_adoption", "irrigation", "erosion"]


@router.get("/district-metrics", response_model=MapMetricsResponse)
def district_metrics(
    metric: MapMetric = Query("gap", description="yield | gap | priority | input_adoption | irrigation | erosion"),
    f: AnalyticsFilters = Depends(analytics_filters),
) -> MapMetricsResponse:
    """District choropleth values for one metric.

    ``yield`` and ``gap`` require a crop selection: raw yields from different
    crops are not comparable, so the endpoint returns an empty map plus a
    message instead of an all-crop aggregate.
    """
    result = map_service.district_metrics(f, metric=metric)
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
            source_id=result.get("source_id") or "NISR_SAS_2025B_DISTRICT_CROP",
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
    f: AnalyticsFilters = Depends(analytics_filters),
) -> MapMetricsResponse:
    result = map_service.district_metrics(f, metric="priority", weights=weights.to_engine())
    return MapMetricsResponse(
        **result,
        provenance=Provenance(
            source_id=result.get("source_id") or "NISR_SAS_2025B_DISTRICT_CROP",
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
