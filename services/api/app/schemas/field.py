"""Privacy-aware plot evidence response models."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Provenance


class FieldAllocationRow(BaseModel):
    """Plot evidence aggregated before it leaves the API."""

    period_code: str | None = None
    district: str | None = None
    district_code: str | None = None
    province: str | None = None
    crop: str | None = None
    n_plots: int = 0
    area_ha: float | None = None
    production_kg: float | None = None
    yield_kg_ha: float | None = None
    n_with_geometry: int = 0
    geometry_available: bool = False
    source_ids: list[str] = Field(default_factory=list)


class FieldObservationsResponse(BaseModel):
    """Aggregated plot evidence for the maps allocation workspace."""

    available: bool = False
    message: str
    rows: list[FieldAllocationRow] = Field(default_factory=list)
    count: int = 0
    n_plot_records: int = 0
    geometry_available: bool = False
    n_records_with_geometry: int = 0
    provenance: Provenance
