"""Storage/aggregation optimization endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.optimization import storage_allocation
from app.schemas.optimization import AllocationRequest, AllocationResponse

router = APIRouter(prefix="/optimization", tags=["optimization"])


@router.post("/storage-allocation", response_model=AllocationResponse)
def storage_allocation_endpoint(payload: AllocationRequest) -> AllocationResponse:
    sources = [storage_allocation.Source(s.id, s.quantity_kg, s.crop) for s in payload.sources]
    facilities = [
        storage_allocation.Facility(
            f.id, f.capacity_kg, f.storage_cost_per_kg, list(f.crops), f.cold_chain
        )
        for f in payload.facilities
    ]
    # Request distances arrive as a JSON object keyed "source|facility".
    distances = {}
    for key, value in payload.distances.items():
        src, _, fac = key.partition("|")
        distances[(src, fac)] = float(value)

    result = storage_allocation.allocate(
        sources, facilities, distances, max_distance_km=payload.max_distance_km
    )
    return AllocationResponse(
        status=result.status,
        total_cost=result.total_cost,
        assignments=result.assignments,
        unassigned=result.unassigned,
        capacity_not_verified=result.capacity_not_verified,
        notes=result.notes,
    )
