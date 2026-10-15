"""Cropmatics Rwanda API entrypoint."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.analytics.intervention_priority import UnscorableWeights
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.repositories.dataset_repository import (
    CanonicalDataUnavailable,
    DatasetOutOfSync,
    DatasetUnavailable,
)

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


@app.exception_handler(UnscorableWeights)
async def _unscorable_weights(_: Request, exc: UnscorableWeights) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"code": "PRIORITY_UNSCORABLE", "detail": str(exc), "retryable": False},
    )


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


@app.exception_handler(DatasetOutOfSync)
async def _dataset_out_of_sync(_: Request, exc: DatasetOutOfSync) -> JSONResponse:
    """A reachable database that serves a different dataset than the image.

    Returned as a typed ``503`` with the expected/loaded versions and period
    counts, so a client can show an honest out-of-sync state and retry rather
    than present stale figures as current.
    """
    return JSONResponse(
        status_code=503,
        content={
            "code": exc.code,
            "message": str(exc),
            "expected_version": exc.expected_version,
            "loaded_version": exc.loaded_version,
            "expected_periods": exc.expected_periods,
            "loaded_periods": exc.loaded_periods,
            "reason": exc.reason,
            "retryable": True,
            "hint": (
                "the database has not been synchronised with the built dataset; "
                "run python scripts/data/canonical_bootstrap.py"
            ),
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
