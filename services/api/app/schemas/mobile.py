"""Read models for the Cropmatics mobile intelligence home screen.

Everything here is *derived from the processed official data* — no headline figure
is hard-coded, and ``null`` always means "not published for this selection"
rather than zero. The mobile client renders these values verbatim; it never
recomputes an official statistic on the device.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Provenance


class MobileSummaryCard(BaseModel):
    """One tappable headline count on the Home screen."""

    id: str
    label: str
    value: int
    unit: str | None = None
    route: str | None = None
    note: str | None = None


class FeaturedTopic(BaseModel):
    """A real, data-derived insight the Home screen can lead with."""

    id: str
    title: str
    summary: str
    route: str
    source_id: str | None = None
    period: str | None = None


class MobileHomeResponse(BaseModel):
    latest_period: str | None = None
    latest_period_label: str | None = None
    latest_period_coverage: str | None = None
    crop_count: int = 0
    district_count: int = 0
    indicator_count: int = 0
    source_count: int = 0
    summary_cards: list[MobileSummaryCard] = Field(default_factory=list)
    featured_topics: list[FeaturedTopic] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)
    coverage_notes: list[str] = Field(default_factory=list)
    data_version: dict = Field(default_factory=dict)
    generated_at: str | None = None
    provenance: Provenance


class MobileIndicator(BaseModel):
    """One indicator in the catalogue, annotated with real data availability.

    ``aggregation`` declares how the indicator may validly be combined (see the
    module docstring in ``app.services.mobile_service``): a ``crop_required``
    indicator must never be averaged across crops.
    """

    id: str
    label: str
    category: str
    dataset: str
    column: str
    unit: str | None = None
    aggregation: str = "specialized"
    source_id: str | None = None
    source_label: str | None = None
    source_period: str | None = None
    period: str | None = None
    coverage_level: str | None = None
    available: bool = False


class MobileIndicatorCategory(BaseModel):
    id: str
    label: str
    indicator_count: int = 0
    available_count: int = 0
    available: bool = False


class MobileIndicatorsResponse(BaseModel):
    latest_period: str | None = None
    latest_period_label: str | None = None
    categories: list[MobileIndicatorCategory] = Field(default_factory=list)
    indicators: list[MobileIndicator] = Field(default_factory=list)
    provenance: Provenance
