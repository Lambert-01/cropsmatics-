"""Cropmatics Rwanda API entrypoint."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.repositories.dataset_repository import CanonicalDataUnavailable, DatasetUnavailable

configure_logging()
settings = get_settings()

app = FastAPI(
    title=f"{settings.project_name} API",
    version=settings.version,
    description=(
        "Agricultural data and decision-intelligence API for Cropmatics Rwanda. "
        "It supports productivity gaps, intervention priorities, post-harvest risk "
        "and storage allocation. Model output describes associations and priorities "
        "for investigation, not proven causal effects."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["system"])
def root_health() -> dict:
    """Unversioned probe for infrastructure (load balancers, uptime checks)."""
    return {"status": "ok", "service": "cropmatics-api", "version": settings.version}


@app.exception_handler(DatasetUnavailable)
async def _dataset_unavailable(_: Request, exc: DatasetUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "code": "DATA_NOT_AVAILABLE",
            "detail": str(exc),
            "hint": "run `make data` to build processed tables",
        },
    )


@app.exception_handler(CanonicalDataUnavailable)
async def _canonical_unavailable(_: Request, exc: CanonicalDataUnavailable) -> JSONResponse:
    """A ``required``-mode deployment must not answer from files.

    Returned as a typed ``503`` so a client can branch on ``code`` instead of
    parsing prose, and so a monitoring probe can tell an unavailable canonical
    database apart from a missing dataset.
    """
    return JSONResponse(
        status_code=503,
        content={
            "code": exc.code,
            "detail": str(exc),
            "hint": "check GET /api/v1/health/readiness for the canonical database state",
        },
    )
