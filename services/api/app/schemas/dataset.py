"""Dataset explorer schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DatasetInfo(BaseModel):
    key: str
    label: str
    source_id: str
    #: Which selector group this dataset belongs to. Current multi-period tables
    #: lead; legacy single-release extracts are kept as an archive so a client
    #: does not have to hand-maintain a tab per release.
    group: str = "current"
    group_label: str = "Current (multi-period)"
    #: The exact-match query params this dataset accepts, so a client can offer
    #: dataset-appropriate filters rather than params the API rejects.
    filters: list[str] = Field(default_factory=list)


class DatasetListResponse(BaseModel):
    datasets: list[DatasetInfo] = Field(default_factory=list)


class DatasetResponse(BaseModel):
    key: str
    label: str
    source_id: str
    columns: list[str] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)
    count: int = 0
    offset: int = 0
    limit: int = 100
    # Echoes the whitelisted filters/sort actually applied, so the UI can show
    # the effective scope. None when the request was unfiltered.
    sort: dict | None = None
    filters: dict | None = None
    # Complete distinct values for supported exact-match filters. The explorer
    # uses these to render select controls instead of raw text inputs.
    filter_options: dict[str, list[str]] = Field(default_factory=dict)


class OriginalSourceInfo(BaseModel):
    key: str
    release: str
    folder: str
    source_id: str
    source_workbook: str
    sheet_name: str
    title: str | None = None
    used_range: str | None = None
    rows: int = 0
    columns: int = 0
    csv_file: str | None = None
    raw_path: str | None = None
    source_format: str | None = None
    has_extract: bool = False
    mapped: bool = False
    mapping_id: str | None = None
    ingestion_stage: str | None = None
    exclusion_reason: str | None = None
    source_provenance: str | None = None


class OriginalSourceListResponse(BaseModel):
    sources: list[OriginalSourceInfo] = Field(default_factory=list)
    count: int = 0
    filter_options: dict[str, list[str]] = Field(default_factory=dict)
    available_extract_count: int = 0
    inventory_only_count: int = 0


class OriginalSourceResponse(BaseModel):
    source: OriginalSourceInfo
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    count: int = 0
    offset: int = 0
    limit: int = 100
    search: str | None = None
