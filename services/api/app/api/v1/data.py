"""Data explorer endpoints (read-only, whitelisted datasets)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status

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
    request: Request,
    key: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    period_code: str | None = Query(
        None,
        description=(
            "published period, e.g. 2025B; supported by datasets that carry a "
            "period dimension (see /api/v1/meta/periods)"
        ),
    ),
    year: int | None = Query(None, ge=2000, le=2100),
    season: str | None = Query(None, description="A, B or C"),
    crop: str | None = Query(None),
    province: str | None = Query(None),
    district: str | None = Query(None),
    district_code: str | None = Query(None),
    indicator_code: str | None = Query(
        None,
        description=(
            "exact indicator code; supported by the long-form practice and "
            "post-harvest tables (see the filters list on this dataset)"
        ),
    ),
    domain: str | None = Query(
        None,
        description="observation domain; supported where the dataset carries one",
    ),
    canonical_crop_name: str | None = Query(None),
    crop_code: str | None = Query(None),
    geography_level: str | None = Query(None),
    farmer_scale: str | None = Query(None),
    row_scope: str | None = Query(None),
    source_id: str | None = Query(None),
    sort_by: str | None = Query(None, description="any column of the dataset"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
) -> DatasetResponse:
    """Read one whitelisted dataset with exact-match filters and safe sorting.

    Only the filters a dataset genuinely supports are accepted (the service
    rejects others with a 400), and sorting is limited to real columns with an
    asc/desc direction — no arbitrary expressions ever reach Pandas.
    """
    dataset_service.assert_known_query_params(
        request.query_params, dataset_service.DATASET_JSON_PARAMS
    )
    requested_filters = dataset_service.parse_filters(
        period_code=period_code,
        year=year,
        season=season,
        crop=crop,
        province=province,
        district=district,
        indicator_code=indicator_code,
        domain=domain,
        extra={
            "district_code": district_code,
            "canonical_crop_name": canonical_crop_name,
            "crop_code": crop_code,
            "geography_level": geography_level,
            "farmer_scale": farmer_scale,
            "row_scope": row_scope,
            "source_id": source_id,
        },
    )
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
