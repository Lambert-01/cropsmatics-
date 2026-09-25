"""Analytics schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import Provenance


class ProductivityRow(BaseModel):
    year: int
    season: str
    district: str
    crop: str
    cultivated_area_ha: float | None = None
    harvested_area_ha: float | None = None
    production_mt: float | None = None
    yield_kg_ha: float | None = None
    benchmark_yield_kg_ha: float | None = None
    gap_index: float | None = None


class GapResponse(BaseModel):
    strategy: str
    count: int
    rows: list[ProductivityRow]
    provenance: Provenance


class FactorAssociation(BaseModel):
    factor: str
    correlation_with_yield: float | None = None
    n_observations: int
    note: str = "association only; not evidence of causation"


class FactorResponse(BaseModel):
    crop: str | None = None
    factors: list[FactorAssociation]
    provenance: Provenance


class PriorityRow(BaseModel):
    id: str
    district: str
    crop: str
    score: float
    band: str
    yield_kg_ha: float | None = None
    benchmark_yield_kg_ha: float | None = None
    harvested_area_ha: float | None = None
    gap: float
    vulnerability: float
    affected_scale: float
    readiness: float
    cost_constraint: float


class PriorityResponse(BaseModel):
    weights: dict
    rows: list[PriorityRow]
    proxy_notes: list[str] = Field(default_factory=list)
    provenance: Provenance


# Human-readable weight keys accepted by the Intervention Planner.
WEIGHT_KEYS = {
    "gap": "wg",
    "vulnerability": "wv",
    "affected_scale": "wf",
    "readiness": "wr",
    "cost": "wc",
}


class WeightsIn(BaseModel):
    """Adjustable intervention weights. Must be non-negative and sum to ~1."""

    gap: float = Field(0.30, ge=0, le=1)
    vulnerability: float = Field(0.20, ge=0, le=1)
    affected_scale: float = Field(0.20, ge=0, le=1)
    readiness: float = Field(0.20, ge=0, le=1)
    cost: float = Field(0.10, ge=0, le=1)

    @model_validator(mode="after")
    def _sum_to_one(self) -> WeightsIn:
        total = self.gap + self.vulnerability + self.affected_scale + self.readiness + self.cost
        if abs(total - 1.0) > 0.02:
            raise ValueError(f"weights must sum to ~1.0 (got {total:.3f})")
        return self

    def to_engine(self) -> dict:
        return {WEIGHT_KEYS[k]: getattr(self, k) for k in WEIGHT_KEYS}


class PriorityRequest(BaseModel):
    weights: WeightsIn = Field(default_factory=WeightsIn)
    limit: int = Field(50, ge=1, le=500)
