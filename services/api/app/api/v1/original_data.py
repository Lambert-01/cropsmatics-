"""Original NISR SAS worksheet browser endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.schemas.dataset import (
    OriginalSourceInfo,
    OriginalSourceListResponse,
    OriginalSourceResponse,
)
from app.services import original_source_service as service

router = APIRouter(prefix="/meta/original-sources", tags=["data"])


@router.get("", response_model=OriginalSourceListResponse)
def list_original_sources(
    release: str | None = None,
    source_id: str | None = None,
    mapped: bool | None = None,
    availability: str | None = Query(None, pattern="^(full extract|inventory only)$"),
    search: str | None = None,
) -> OriginalSourceListResponse:
    has_extract = None if availability is None else availability == "full extract"
    sources = service.list_sources(
        release=release,
        source_id=source_id,
        mapped=mapped,
        has_extract=has_extract,
        search=search,
    )
    all_sources = service.list_sources()
    return OriginalSourceListResponse(
        sources=[OriginalSourceInfo(**source) for source in sources],
        count=len(sources),
        filter_options=service.filter_options(),
        available_extract_count=sum(1 for source in all_sources if source["has_extract"]),
        inventory_only_count=sum(1 for source in all_sources if not source["has_extract"]),
    )


@router.get("/{key:path}/download")
def download_original_source(key: str) -> Response:
    path = service.csv_path(key)
    item = service.get_source(key)
    content = path.read_bytes()
    filename = Path(item["csv_file"] or path.name).name
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if path.suffix.lower() == ".xlsx"
        else "text/csv; charset=utf-8"
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{key:path}", response_model=OriginalSourceResponse)
def get_original_source(
    key: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = None,
) -> OriginalSourceResponse:
    return OriginalSourceResponse(
        **service.fetch_source(key, limit=limit, offset=offset, search=search)
    )
