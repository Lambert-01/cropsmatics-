"""Aggregate all ``/api/v1`` routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    assistant,
    auth,
    crops,
    dashboard,
    data,
    facilities,
    geography,
    harvests,
    health,
    maps,
    meta,
    optimization,
    reports,
    risk,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(meta.router)
api_router.include_router(data.router)
api_router.include_router(auth.router)
api_router.include_router(geography.router)
api_router.include_router(crops.router)
api_router.include_router(dashboard.router)
api_router.include_router(analytics.router)
api_router.include_router(maps.router)
api_router.include_router(harvests.router)
api_router.include_router(facilities.router)
api_router.include_router(optimization.router)
api_router.include_router(risk.router)
api_router.include_router(reports.router)
api_router.include_router(assistant.router)
