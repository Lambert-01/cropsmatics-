"""Canonical data endpoints: what is loaded, and what it covers.

    GET /api/v1/data/version
    GET /api/v1/data/coverage

Both answer with whichever layer actually served them — ``postgres`` for the
canonical tables, ``processed_csv`` for the pipeline's files standing in when no
database is available. Neither ever reports a missing domain as zero.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.data_status import DataEnvelope
from app.services import data_status_service

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/version", response_model=DataEnvelope)
def version() -> DataEnvelope:
    """The dataset build behind these answers, and where it is served from."""
    return DataEnvelope(**data_status_service.version())


@router.get("/coverage", response_model=DataEnvelope)
def coverage() -> DataEnvelope:
    """Period and geographic coverage, read from the canonical tables when ready."""
    return DataEnvelope(**data_status_service.coverage())
