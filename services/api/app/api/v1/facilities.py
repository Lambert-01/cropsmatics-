"""Facility context endpoints.

No facility capacity is fabricated. Until verified capacity snapshots exist,
these endpoints return the public cold-chain **context** and mark capacity as
``not_verified``. Null capacity is preserved as null (never converted to 0).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.common import Provenance
from app.schemas.dashboard import FacilitiesResponse
from app.services import facility_service

router = APIRouter(prefix="/facilities", tags=["facilities"])


@router.get("/context", response_model=FacilitiesResponse)
def context(district: str | None = None) -> FacilitiesResponse:
    result = facility_service.context(district=district)
    return FacilitiesResponse(
        capacity_not_verified=result["capacity_not_verified"],
        facilities=result["facilities"],
        note=result["note"],
        provenance=Provenance(**result["provenance"]),
    )


@router.get("/nearby", response_model=FacilitiesResponse)
def nearby(district: str | None = None) -> FacilitiesResponse:
    """Backwards-compatible alias for :func:`context`."""
    return context(district=district)
