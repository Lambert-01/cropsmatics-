"""Harvest registration and risk schemas."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Provenance


class HarvestCreate(BaseModel):
    district: str
    crop: str
    expected_harvest_date: date | None = None
    expected_quantity_kg: float | None = Field(default=None, ge=0)
    # Offline-first: client generates the UUID so sync is idempotent.
    client_uuid: str | None = None


class HarvestOut(BaseModel):
    id: str
    district: str
    crop: str
    expected_harvest_date: date | None = None
    expected_quantity_kg: float | None = None
    actual_quantity_kg: float | None = None
    sync_status: str


class RiskOut(BaseModel):
    # Same reason as Provenance: `model_version` is a documented response field.
    model_config = ConfigDict(protected_namespaces=())

    harvest_id: str
    probability: float | None = None
    band: str
    contributing_factors: list[str] = []
    recommended_actions: list[str] = []
    score_label: str = "Risk score"
    model_version: str | None = None
    factors: list[dict] = []
    actions: list[dict] = []
    capacity_context: str | None = None
    provenance: Provenance
