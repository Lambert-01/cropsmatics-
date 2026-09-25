"""District map metrics endpoint (choropleth data)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

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
    result = map_service.district_metrics(f, metric=metric)
    return MapMetricsResponse(
        **result,
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period=result["period"],
            benchmark_strategy=f.benchmark_strategy,
            method="district aggregation of processed district x crop table",
            limitations=[
                "district-level aggregates only for 2025 Season B",
                "observational association, not causal effect",
                "districts without a valid observation return no value",
            ],
        ),
    )
