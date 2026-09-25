"""Health and metadata endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.common import HealthOut, MetaOut, ReadinessOut
from app.services import meta_service

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    settings = get_settings()
    return HealthOut(service="cropmatics-api", version=settings.version)


@router.get("/health/readiness", response_model=ReadinessOut)
def readiness() -> ReadinessOut:
    """Report whether the required processed data are present and usable.

    Returns no secrets and no filesystem paths. The API is CPU/local-file
    backed, so ``status == "degraded"`` means the data pipeline has not been run
    in this environment.
    """
    return ReadinessOut(**meta_service.readiness())


@router.get("/meta", response_model=MetaOut)
def meta() -> MetaOut:
    settings = get_settings()
    return MetaOut(project=settings.project_name, version=settings.version)
