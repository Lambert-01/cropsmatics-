"""Analytics endpoints (productivity gap, factors, intervention priorities)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.analytics.productivity_gap import STRATEGIES
from app.schemas.analytics import FactorResponse, GapResponse, PriorityResponse
from app.schemas.common import Provenance
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


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
            limitations=[
                "observational district aggregates, not plot-level evidence",
                "associations are not causation",
                "benchmark choice materially affects the gap",
            ],
        ),
    )


@router.get("/factors", response_model=FactorResponse)
def factors(
    crop: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
) -> FactorResponse:
    result = analytics_service.factor_associations(crop=crop, limit=limit)
    return FactorResponse(
        crop=result["crop"],
        factors=result["factors"],
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_FACTORS",
            source_period="2025-B",
            method="Pearson correlation between district factor adoption and yield",
            limitations=[
                "aggregate (ecological) association; not a causal effect",
                "confounding between practices is expected",
                "district-level correlation can differ from farm-level",
            ],
        ),
    )


@router.get("/intervention-priorities", response_model=PriorityResponse)
def intervention_priorities(limit: int = Query(50, ge=1, le=500)) -> PriorityResponse:
    result = analytics_service.priorities(limit=limit)
    return PriorityResponse(
        weights=result["weights"],
        rows=result["rows"],
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period="2025-B",
            method="weighted transparent score over normalized components",
            limitations=result["proxy_notes"],
        ),
    )
