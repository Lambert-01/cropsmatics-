"""Visualization-ready view models.

These are deliberately *not* raw CSV rows: the frontend receives clean,
chart/map/table-ready structures with units, periods and provenance attached so
no analytical value is ever recomputed in React.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.analytics import ComponentAvailability
from app.schemas.common import Provenance

# --- dashboard overview ----------------------------------------------------


class KPI(BaseModel):
    id: str
    label: str
    value: float | None = None
    unit: str | None = None
    period: str | None = None
    # Canonical YYYYS period this specific number describes. Present so a client
    # can never present a 2025B value as if it belonged to the selected period.
    period_code: str | None = None
    source_id: str | None = None
    note: str | None = None
    # "selection" -> describes the current crop/period/geography selection.
    # "context"   -> comes from a different release and must be shown separately.
    scope: str = "selection"


class CoverageNote(BaseModel):
    level: str
    message: str | None = None


class PeriodSnapshot(BaseModel):
    """The one release a single-release panel describes.

    Present in the ``history`` scope, where no release is selected: the district
    figures still have to come from somewhere, so the response names that
    release instead of letting a client present it as the whole period axis.
    """

    period_code: str | None = None
    label: str | None = None
    coverage_level: str | None = None
    note: str | None = None


class PeriodTimelineEntry(BaseModel):
    """One published period on the shared axis, with its own availability.

    Carries the same availability vocabulary as ``/meta/periods`` (``published``,
    ``servable``, ``availability_status``) so the overview can disable or explain
    a release the serving panel does not carry yet, instead of advertising it as
    usable and letting a client request it.
    """

    period_code: str
    label: str
    coverage_level: str | None = None
    n_districts: int = 0
    n_crops: int = 0
    is_latest: bool = False
    is_latest_district: bool = False
    published: bool = True
    servable: bool = False
    availability_status: str = "not_servable"
    availability_message: str | None = None


class OverviewResponse(BaseModel):
    filters: dict
    # The filters actually applied to the figures below. In history scope this
    # differs from ``filters``: the request is "all published periods" but the
    # district snapshot is pinned to ``snapshot.period_code``.
    effective_filters: dict = Field(default_factory=dict)
    period: str | None = None
    period_code: str | None = None
    #: "period" (one selected release) or "history" (all published periods).
    scope: str = "period"
    #: The release a single-release panel describes, or null in period scope.
    snapshot: PeriodSnapshot | None = None
    #: The published period axis, in both scopes, so a client can show how many
    #: releases exist and let a reader switch between them.
    period_timeline: list[PeriodTimelineEntry] = Field(default_factory=list)
    available_periods: list[str] = Field(default_factory=list)
    coverage: dict[str, str] = Field(default_factory=dict)
    coverage_level: str | None = None
    n_observations: int = 0
    # Full metric set (kept for existing clients).
    kpis: list[KPI] = Field(default_factory=list)
    # At most four KPIs that share one analytical scope and one period. A client
    # renders these as the headline strip; everything else is secondary.
    primary_kpis: list[KPI] = Field(default_factory=list)
    secondary_kpis: list[KPI] = Field(default_factory=list)
    provenance: Provenance


class GapBand(BaseModel):
    """One band of the yield-gap distribution, with its own cut points."""

    id: str
    label: str
    min_pct: float | None = None
    max_pct: float | None = None
    count: int = 0
    share_pct: float | None = None


class SameSeasonYoY(BaseModel):
    """Same-season, previous-year yield change for one selection.

    Seasons differ agronomically, so this compares the same season one year
    earlier (2025B vs 2026B) instead of stepping A -> B -> C.
    """

    available: bool = False
    reason: str | None = None
    period_code: str | None = None
    period_label: str | None = None
    previous_period_code: str | None = None
    previous_period_label: str | None = None
    current_yield_kg_ha: float | None = None
    previous_yield_kg_ha: float | None = None
    change_pct: float | None = None
    crop: str | None = None
    district: str | None = None
    province: str | None = None
    note: str | None = None


class ProductivityResponse(BaseModel):
    period: str | None = None
    period_code: str | None = None
    #: False when an explicitly requested period could not be served. In that
    #: case ``kpis`` is empty rather than filled with manufactured zeros.
    available: bool = True
    unavailable_reason: str | None = None
    #: Structured out-of-sync/unavailable detail (code, reason, periods).
    availability: dict | None = None
    n_observations: int = 0
    kpis: list[KPI] = Field(default_factory=list)
    primary_kpis: list[KPI] = Field(default_factory=list)
    secondary_kpis: list[KPI] = Field(default_factory=list)
    # None when no crop is selected (a cross-crop mean yield is meaningless).
    yoy: SameSeasonYoY | None = None
    gap_bands: list[GapBand] = Field(default_factory=list)
    # ``median_is_degenerate`` is True when median(gap) is structurally 0 because
    # the benchmark is itself a distribution median; clients must not present
    # that as "no gap anywhere".
    gap_summary: dict | None = None
    rows: list[dict] = Field(default_factory=list)
    provenance: Provenance


# --- maps ------------------------------------------------------------------


class MapDistrictMetric(BaseModel):
    district: str
    district_code: str | None = None
    province: str | None = None
    agro_ecological_zone: str | None = None
    value: float | None = None
    n_observations: int = 0
    details: dict = Field(default_factory=dict)


class MapMetricsResponse(BaseModel):
    metric: str
    metric_label: str
    purpose: str | None = None
    methodology_version: str | None = None
    shortfall_threshold_pct: float | None = None
    unit: str | None = None
    period: str | None = None
    period_code: str | None = None
    crop: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    districts: list[MapDistrictMetric] = Field(default_factory=list)
    # True when the metric cannot be mapped without a crop (yield): the map must
    # explain this instead of rendering an all-crop aggregate.
    requires_crop: bool = False
    message: str | None = None
    # The release that does carry the metric when the selected period does not
    # (single-release adoption/irrigation/erosion layers), or - for the priority
    # metric - the release that carries components the selected period cannot
    # measure.
    available_period: str | None = None
    # Set when a period-specific metric also consumes a single-release component
    # (the priority score's readiness/cost proxies). Always null under the
    # exclusion policy: no score is reported as a blend of two releases.
    reference_period: str | None = None
    #: Priority components with no measured value for the selected period, whose
    #: weight was redistributed instead of being scored as a constant.
    components_unavailable: list[str] = Field(default_factory=list)
    component_availability: list[ComponentAvailability] = Field(default_factory=list)
    source_id: str | None = None
    provenance: Provenance


# --- trends ----------------------------------------------------------------


class TrendPoint(BaseModel):
    period: str
    year: int | None = None
    season: str | None = None
    values: dict[str, float | None] = Field(default_factory=dict)


class SameSeasonChange(BaseModel):
    """A same-season delta computed by the platform, not by a client.

    ``available`` is false whenever the comparison cannot be made - the prior
    year is absent, published blank, or a zero baseline - and ``reason`` says
    which. A missing comparison is never reported as a 0 % change.
    """

    metric: str
    unit: str | None = None
    available: bool = False
    reason: str | None = None
    period_code: str | None = None
    period_label: str | None = None
    previous_period_code: str | None = None
    previous_period_label: str | None = None
    current_value: float | None = None
    previous_value: float | None = None
    change_pct: float | None = None
    change_abs: float | None = None


class NationalBoardCrop(BaseModel):
    """One crop on the national board, aligned to the shared period axis."""

    crop: str
    coverage: str = "national"
    n_published_periods: int = 0
    latest_published_period: str | None = None
    latest_published_label: str | None = None
    #: metric -> value per position of ``NationalBoardResponse.periods``.
    #: A null is a period the release did not tabulate for this crop.
    series: dict[str, list[float | None]] = Field(default_factory=dict)
    changes: dict[str, SameSeasonChange] = Field(default_factory=dict)


class NationalBoardTotals(BaseModel):
    """The national total across the crops that published a value.

    Yield here is production over harvested area across the crops that published
    both - never an average of per-crop yields, which would be meaningless.
    Aligned to the same period axis as the per-crop series.
    """

    series: dict[str, list[float | None]] = Field(default_factory=dict)
    changes: dict[str, SameSeasonChange] = Field(default_factory=dict)


class NationalBoardResponse(BaseModel):
    """Read-only national crop board.

    One request for the whole board, with the period axis and the same-season
    deltas decided here so the client only presents them.
    """

    metric_units: dict[str, str] = Field(default_factory=dict)
    periods: list[str] = Field(default_factory=list)
    period_labels: dict[str, str] = Field(default_factory=dict)
    crops: list[NationalBoardCrop] = Field(default_factory=list)
    #: The all-crop national total, on the same axis. Home leads with this.
    national: NationalBoardTotals | None = None
    provenance: Provenance


class TrendResponse(BaseModel):
    crop: str | None = None
    # Populated only for the optional compare view (2-5 crops).
    compared_crops: list[str] | None = None
    kind: str
    metric_units: dict[str, str] = Field(default_factory=dict)
    points: list[TrendPoint] = Field(default_factory=list)
    provenance: Provenance


# --- factors ---------------------------------------------------------------


class FactorMetric(BaseModel):
    factor: str
    label: str
    correlation: float | None = None
    absolute_correlation: float | None = None
    n_observations: int = 0
    direction: str | None = None
    interpretation: str = "association only; not evidence of causation"


class FactorsResponse(BaseModel):
    crop: str | None = None
    district: str | None = None
    factors: list[FactorMetric] = Field(default_factory=list)
    # Set when the requested period has no factor data at all, so an empty list
    # is never mistaken for "no association measured".
    note: str | None = None
    provenance: Provenance


# --- post-harvest ----------------------------------------------------------


class PostHarvestCrop(BaseModel):
    crop: str
    sold_pct: float | None = None
    own_consumption_pct: float | None = None
    stored_pct: float | None = None
    post_harvest_losses_pct: float | None = None
    seeds_pct: float | None = None
    fodder_pct: float | None = None
    other_usage_pct: float | None = None
    shares_sum_ok: bool | None = None
    risk_band: str | None = None


class PostHarvestHeadline(BaseModel):
    """One headline crop for a share column, chosen by Python.

    Picking the maximum is an analytical decision, not a formatting detail: it
    decides which crop a page leads with, so it is made once here and returned
    with the number of crops it was chosen from. A client renders it.
    """

    id: str
    label: str
    unit: str
    crop: str | None = None
    value: float | None = None
    #: How many crops the maximum was chosen from, so a reader can tell a
    #: 17-crop headline from a one-crop selection.
    n_crops_considered: int = 0


class PostHarvestResponse(BaseModel):
    kpis: list[KPI] = Field(default_factory=list)
    crops: list[PostHarvestCrop] = Field(default_factory=list)
    #: The headline picks, computed here. Clients render them rather than
    #: searching the crop list themselves, so web and mobile cannot disagree.
    headlines: list[PostHarvestHeadline] = Field(default_factory=list)
    provenance: Provenance


# --- heatmap ---------------------------------------------------------------


class HeatmapCell(BaseModel):
    district: str
    crop: str
    value: float | None = None


class HeatmapResponse(BaseModel):
    metric: str
    districts: list[str] = Field(default_factory=list)
    crops: list[str] = Field(default_factory=list)
    cells: list[HeatmapCell] = Field(default_factory=list)
    max_value: float | None = None
    min_value: float | None = None
    unit: str | None = None
    provenance: Provenance


# --- coverage / sources / models -------------------------------------------


class CoverageResponse(BaseModel):
    coverage: dict[str, dict[str, str]] = Field(default_factory=dict)
    details: list[dict] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SourceItem(BaseModel):
    dataset: str | None = None
    owner: str | None = None
    type: str | None = None
    coverage: str | None = None
    use: str | None = None
    access_status: str | None = None
    url: str | None = None
    official_page: str | None = None
    redistribution_note: str | None = None


class SourcesResponse(BaseModel):
    sources: list[SourceItem] = Field(default_factory=list)
    provenance: Provenance


class ModelInfo(BaseModel):
    name: str
    version: str | None = None
    target: str | None = None
    mae: float | None = None
    rmse: float | None = None
    r2: float | None = None
    n_train: int | None = None
    n_test: int | None = None
    training_period: str | None = None
    validation_method: str | None = None
    status: str = "unavailable"
    note: str | None = None


class ModelsResponse(BaseModel):
    models: list[ModelInfo] = Field(default_factory=list)
    provenance: Provenance


# --- facilities ------------------------------------------------------------


class FacilityItem(BaseModel):
    district: str
    district_code: str | None = None
    initiative: str | None = None
    context: str | None = None
    capacity_kg: float | None = None
    capacity_status: str = "not_verified"
    capacity_note: str | None = None
    source_id: str | None = None


class FacilitiesResponse(BaseModel):
    capacity_not_verified: bool = True
    facilities: list[FacilityItem] = Field(default_factory=list)
    note: str
    provenance: Provenance
