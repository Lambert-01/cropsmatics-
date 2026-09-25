"""National storage / cold-chain context schemas.

Every field here is national or program level. ``level_of_analysis`` and
``label`` are part of the contract so a client cannot render these numbers as
facility capacity by accident.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Provenance


class InfrastructureItem(BaseModel):
    infrastructure_type: str | None = None
    existing_number: float | int | None = None
    existing_capacity_mt: float | int | None = None
    new_number: float | int | None = None
    new_capacity_mt: float | int | None = None
    total_number: float | int | None = None
    total_capacity_mt: float | int | None = None
    period: str | None = None
    source_url: str | None = None


class InfrastructureTotals(BaseModel):
    existing_number: float | int | None = None
    existing_capacity_mt: float | int | None = None
    new_number: float | int | None = None
    new_capacity_mt: float | int | None = None
    total_number: float | int | None = None
    total_capacity_mt: float | int | None = None
    capacity_unit: str = "mt"
    period: str | None = None
    note: str | None = None


class ProgramIndicator(BaseModel):
    indicator: str | None = None
    value: float | int | None = None
    unit: str | None = None
    notes: str | None = None
    period: str | None = None
    source_url: str | None = None


class ColdChainProgram(BaseModel):
    indicators: list[ProgramIndicator] = Field(default_factory=list)
    program_districts: list[str] = Field(default_factory=list)
    facility_capacity: None = None
    facility_capacity_status: str = "not_verified"
    facility_location_status: str = "not_published"
    note: str | None = None


class StorageInfrastructureResponse(BaseModel):
    level_of_analysis: str = "national"
    label: str = "National totals - not facility-level capacity"
    items: list[InfrastructureItem] = Field(default_factory=list)
    totals: InfrastructureTotals | None = None
    program: ColdChainProgram
    provenance: Provenance


class FacilityContextResponse(BaseModel):
    district_in_program: bool | None = None
    program_districts: list[str] = Field(default_factory=list)
    capacity: None = None
    capacity_status: str = "not_verified"
    note: str = "Program membership only. No facility capacity or location is published."
