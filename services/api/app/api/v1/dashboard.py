"""Dashboard overview endpoint.

Python computes every headline figure; the frontend only renders it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas.dashboard import OverviewResponse
from app.schemas.filters import AnalyticsFilters, analytics_filters
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=OverviewResponse)
def overview(f: AnalyticsFilters = Depends(analytics_filters)) -> OverviewResponse:
    return OverviewResponse(**dashboard_service.overview(f))
