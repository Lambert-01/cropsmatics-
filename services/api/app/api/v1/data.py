"""Data explorer endpoints (read-only, whitelisted datasets)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.dataset import DatasetInfo, DatasetListResponse, DatasetResponse
from app.services import dataset_service

router = APIRouter(prefix="/meta/dataset", tags=["data"])


@router.get("", response_model=DatasetListResponse)
def list_datasets() -> DatasetListResponse:
    return DatasetListResponse(
        datasets=[DatasetInfo(**d) for d in dataset_service.list_datasets()]
    )


@router.get("/{key}", response_model=DatasetResponse)
def get_dataset(
    key: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: str | None = None,
) -> DatasetResponse:
    try:
        return DatasetResponse(**dataset_service.fetch(key, limit=limit, offset=offset, search=search))
    except KeyError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"unknown dataset: {key!r}; expected one of {sorted(dataset_service.DATASETS)}",
        ) from None
