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
    year: int | None = Query(None, ge=2000, le=2100),
    season: str | None = Query(None, description="A, B or C"),
    crop: str | None = Query(None),
    province: str | None = Query(None),
    district: str | None = Query(None),
    sort_by: str | None = Query(None, description="any column of the dataset"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
) -> DatasetResponse:
    """Read one whitelisted dataset with exact-match filters and safe sorting.

    Only the filters a dataset genuinely supports are accepted (the service
    rejects others with a 400), and sorting is limited to real columns with an
    asc/desc direction — no arbitrary expressions ever reach Pandas.
    """
    requested_filters = {
        "year": str(year) if year is not None else "",
        "season": season or "",
        "crop": crop or "",
        "province": province or "",
        "district": district or "",
    }
    requested_filters = {k: v for k, v in requested_filters.items() if v}
    try:
        return DatasetResponse(
            **dataset_service.fetch(
                key,
                limit=limit,
                offset=offset,
                search=search,
                filters=requested_filters,
                sort_by=sort_by,
                sort_dir=sort_dir,
            )
        )
    except KeyError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"unknown dataset: {key!r}; expected one of {sorted(dataset_service.DATASETS)}",
        ) from None
