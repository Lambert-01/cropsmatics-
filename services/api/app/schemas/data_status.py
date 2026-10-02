"""Response schemas for canonical data status endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DataEnvelope(BaseModel):
    """A canonical-data answer, with the source that served it.

    ``source`` is the honest part: ``postgres`` means the canonical tables, and
    ``processed_csv`` means the pipeline's files stood in for them because the
    database was unavailable or empty. A client that shows a provenance badge
    can be right about which one it got.
    """

    data: dict
    source: str
    generated_at: str
    limitations: list[str] = Field(default_factory=list)


class IndicatorItem(BaseModel):
    indicator_code: str
    name: str
    description: str | None = None
    unit_code: str
    domain: str
    geographic_levels: list[str]
    has_crop_dimension: bool
    unit_name: str | None = None
    unit_dimension: str | None = None
    source_files: list[str] = Field(default_factory=list)


class IndicatorsResponse(BaseModel):
    indicators: list[IndicatorItem]
    source: str
    generated_at: str
    count: int = 0
