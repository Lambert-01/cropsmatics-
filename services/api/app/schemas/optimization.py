"""Storage-allocation schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SourceIn(BaseModel):
    id: str
    quantity_kg: float = Field(ge=0)
    crop: str


class FacilityIn(BaseModel):
    id: str
    # None means capacity is NOT verified; such facilities are never assigned
    # a fabricated capacity.
    capacity_kg: float | None = None
    storage_cost_per_kg: float = 0.0
    crops: list[str] = []
    cold_chain: bool = False


class AllocationRequest(BaseModel):
    sources: list[SourceIn]
    facilities: list[FacilityIn]
    distances: dict[str, float] = {}
    max_distance_km: float | None = None


class AssignmentOut(BaseModel):
    source: str
    facility: str
    quantity_kg: float


class AllocationResponse(BaseModel):
    status: str
    total_cost: float
    assignments: list[AssignmentOut] = []
    unassigned: list[dict] = []
    capacity_not_verified: list[str] = []
    notes: list[str] = []
