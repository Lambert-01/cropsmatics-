"""Health and metadata endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.config import get_settings
from app.schemas.common import HealthOut, MetaOut, ReadinessOut
from app.services import meta_service

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    settings = get_settings()
    return HealthOut(service="cropmatics-api", version=settings.version)


@router.get("/health/readiness", response_model=ReadinessOut)
def readiness(response: Response) -> ReadinessOut:
    """Report whether the required processed data are present and usable.

    Returns no secrets and no filesystem paths. The API is CPU/local-file
    backed, so ``status == "degraded"`` means the data pipeline has not been run
    in this environment.

    A ``not_ready`` verdict is returned with HTTP **503**, not 200. Render (and
    the Docker ``HEALTHCHECK``) only reject a deployment on a failing status
    code, so a body that says ``not_ready`` inside a 200 was silently accepted as
    healthy - which is exactly how a stale canonical database stayed in front of
    traffic.
    """
    body = meta_service.readiness()
    if body.get("status") == "not_ready":
        response.status_code = 503
    return ReadinessOut(**body)


@router.get("/meta", response_model=MetaOut)
def meta() -> MetaOut:
    settings = get_settings()
    return MetaOut(project=settings.project_name, version=settings.version)
