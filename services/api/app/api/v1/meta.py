"""Metadata endpoints: data coverage, sources, models, algorithms."""

from __future__ import annotations

from fastapi import APIRouter

from app.analytics.productivity_gap import STRATEGIES
from app.schemas.common import DataVersionOut, Provenance
from app.schemas.dashboard import (
    CoverageResponse,
    ModelInfo,
    ModelsResponse,
    SourceItem,
    SourcesResponse,
)
from app.services import analytics_service, meta_service

router = APIRouter(prefix="/meta", tags=["system"])


@router.get("/data-coverage", response_model=CoverageResponse)
def data_coverage() -> CoverageResponse:
    return CoverageResponse(**meta_service.coverage())


@router.get("/sources", response_model=SourcesResponse)
def sources() -> SourcesResponse:
    return SourcesResponse(
        sources=[SourceItem(**s) for s in meta_service.sources()],
        provenance=Provenance(
            source_id="SOURCE_REGISTRY",
            method="curated registry + processed official source registry",
            limitations=["official source pages are external and may change"],
        ),
    )


@router.get("/data-version", response_model=DataVersionOut)
def data_version() -> DataVersionOut:
    """Identify the processed-data build serving this API (no hashes/paths)."""
    return DataVersionOut(**meta_service.data_version())


@router.get("/models", response_model=ModelsResponse)
def models() -> ModelsResponse:
    found = meta_service.models()
    if not found:
        found = [
            ModelInfo(
                name="yield_baseline",
                status="unavailable",
                note="Model not yet trained for this selection. Run `make ml` to produce a model card.",
            ).model_dump()
        ]
    return ModelsResponse(
        models=[ModelInfo(**m) for m in found],
        provenance=Provenance(
            method="model cards read from ml/reports/*.json",
            limitations=["metrics are reported only when a real model card exists"],
        ),
    )


@router.get("/algorithms")
def algorithms() -> dict:
    """Describe the analytical methods so the transparency page can render them."""
    return {
        "benchmark_strategies": [
            {"id": s, "label": s.replace("_", " ").title()} for s in STRATEGIES
        ],
        "priority_weights": analytics_service.ip.DEFAULT_WEIGHTS,
        "proxies": analytics_service.PROXY_NOTES,
        "high_gap_threshold_pct": analytics_service.HIGH_GAP_PCT,
    }
