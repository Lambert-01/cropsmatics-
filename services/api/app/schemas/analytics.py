"""Analytics schemas."""

from __future__ import annotations

from pydantic import BaseModel

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
    gap: float
    vulnerability: float
    affected_scale: float
    readiness: float
    cost_constraint: float


class PriorityResponse(BaseModel):
    weights: dict
    rows: list[PriorityRow]
    provenance: Provenance
