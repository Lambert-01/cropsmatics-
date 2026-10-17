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
