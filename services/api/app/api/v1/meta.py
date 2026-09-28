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
from app.schemas.periods import PeriodsResponse
from app.services import analytics_service, meta_service, period_service

router = APIRouter(prefix="/meta", tags=["system"])


@router.get("/data-coverage", response_model=CoverageResponse)
def data_coverage() -> CoverageResponse:
    return CoverageResponse(**meta_service.coverage())


@router.get("/periods", response_model=PeriodsResponse)
def periods() -> PeriodsResponse:
    """The published period dimension, derived from the processed tables.

    Returns every period that actually carries rows (2024A-2026B as of the 2026
    releases; 2026 Season C has not been published), newest last, with the
    coverage level and contributing datasets for each. Clients should read this
    instead of hard-coding a period.
    """
    return PeriodsResponse(**period_service.catalog())


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
        # The platform default weighting's documented proxies (the 2025B release,
        # where every component is measured). Other periods exclude the components
        # they cannot measure - see `priority_component_policy`.
        "proxies": analytics_service.PROXY_NOTES,
        "priority_components": [
            {
                "component": name,
                "label": analytics_service.COMPONENT_LABELS[name],
                "weight_key": key,
            }
            for name, key in zip(
                analytics_service.COMPONENT_ORDER,
                ("wg", "wv", "wf", "wr", "wc"),
                strict=True,
            )
        ],
        "priority_component_policy": {
            "policy": "exclude-and-reweight",
            "statement": (
                "A component with no measured value for the selected period is "
                "excluded and its weight is redistributed proportionally over the "
                "components that do have data. No component is ever scored as a "
                "neutral constant, and no score mixes two releases."
            ),
            "statuses": [
                analytics_service.MEASURED,
                analytics_service.PROXY,
                analytics_service.UNAVAILABLE,
                analytics_service.UNDETERMINED,
            ],
            "reference_period": analytics_service.REFERENCE_FACTOR_PERIOD,
            "single_release_components": ["readiness", "cost_constraint"],
        },
        "high_gap_threshold_pct": analytics_service.HIGH_GAP_PCT,
    }
