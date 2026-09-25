"""Health and metadata endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.common import HealthOut, MetaOut

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    settings = get_settings()
    return HealthOut(service="cropmatics-api", version=settings.version)


@router.get("/meta", response_model=MetaOut)
def meta() -> MetaOut:
    settings = get_settings()
    return MetaOut(project=settings.project_name, version=settings.version)
