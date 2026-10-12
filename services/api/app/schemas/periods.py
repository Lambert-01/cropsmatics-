"""Period dimension and period-aware productivity view models.

``period_code`` is a first-class part of the public contract: a request either
names one of the published periods or omits it, and the response always states
which period the numbers describe. The catalogue is derived from the processed
tables (see ``app.services.period_service``), so a period can never be advertised
that the data do not carry.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Provenance
from app.schemas.dashboard import SameSeasonChange


class PeriodDatasetCoverage(BaseModel):
    """How one dataset covers one period."""

    dataset: str
    coverage_level: str
    n_districts: int = 0
    n_crops: int = 0
    source_id: str | None = None


class PeriodInfo(BaseModel):
    period_code: str
    year: int
    season: str
    label: str
    # district | national - the level the period genuinely carries.
    coverage_level: str | None = None
    n_districts: int = 0
    n_crops: int = 0
    datasets: list[PeriodDatasetCoverage] = Field(default_factory=list)
    is_latest: bool = False
    is_latest_district: bool = False

    # --- availability semantics ---------------------------------------------
    #: The release exists in the processed/source coverage.
    published: bool = True
    #: The canonical dataset in this deployment actually carries rows for it.
    #: A published-but-not-servable period must never be advertised as usable.
    servable: bool = False
    #: Rows / districts / crops the canonical productivity panel holds for it.
    canonical_n_rows: int = 0
    canonical_n_districts: int = 0
    canonical_n_crops: int = 0
    canonical_source_id: str | None = None
    #: servable | coverage_only | not_servable
    availability_status: str = "not_servable"
    availability_message: str | None = None


class PeriodsResponse(BaseModel):
    count: int = 0
    latest: str | None = None
    latest_district: str | None = None
    periods: list[PeriodInfo] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    #: Published periods a client can safely request today.
    servable_periods: list[str] = Field(default_factory=list)
    servable_count: int = 0
    #: Whether the canonical panel is serving at all in this deployment.
    canonical_serving: bool = False


class PeriodProductivityResponse(BaseModel):
    """One period of the canonical productivity panel."""

    period_code: str
    label: str
    defaulted_to_latest: bool = False
    filters: dict = Field(default_factory=dict)
    n_observations: int = 0
    n_districts: int = 0
    n_crops: int = 0
    available_periods: list[str] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)
    provenance: Provenance


class PeriodTrendPoint(BaseModel):
    period_code: str
    year: int
    season: str
    label: str
    values: dict[str, float | None] = Field(default_factory=dict)


class PeriodTrendResponse(BaseModel):
    crop: str
    district: str | None = None
    geography_scope: str
    unit: dict[str, str] = Field(default_factory=dict)
    points: list[PeriodTrendPoint] = Field(default_factory=list)
    available_periods: list[str] = Field(default_factory=list)
    #: The same-season delta, computed here. ``available`` is false when the
    #: published series cannot support one.
    change: SameSeasonChange | None = None
    provenance: Provenance
