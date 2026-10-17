"""Harvest registration and risk schemas."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import Provenance


class HarvestCreate(BaseModel):
    district: str
    crop: str
    expected_harvest_date: date | None = None
    harvest_start_date: date | None = None
    harvest_end_date: date | None = None
    expected_quantity_kg: float | None = Field(default=None, ge=0)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    notes: str | None = Field(default=None, max_length=2000)
    needs_storage_assistance: bool = False
    farm_client_uuid: str | None = Field(default=None, max_length=64)
    # Offline-first: client generates the UUID so sync is idempotent.
    client_uuid: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _harvest_window_is_ordered(self) -> HarvestCreate:
        if (
            self.harvest_start_date
            and self.harvest_end_date
            and self.harvest_start_date > self.harvest_end_date
        ):
            raise ValueError("harvest_start_date must not be after harvest_end_date")
        return self


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
