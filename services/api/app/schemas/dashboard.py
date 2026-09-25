"""Visualization-ready view models.

These are deliberately *not* raw CSV rows: the frontend receives clean,
chart/map/table-ready structures with units, periods and provenance attached so
no analytical value is ever recomputed in React.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Provenance

# --- dashboard overview ----------------------------------------------------


class KPI(BaseModel):
    id: str
    label: str
    value: float | None = None
    unit: str | None = None
    period: str | None = None
    source_id: str | None = None
    note: str | None = None


class CoverageNote(BaseModel):
    level: str
    message: str | None = None


class OverviewResponse(BaseModel):
    filters: dict
    period: str | None = None
    available_periods: list[str] = Field(default_factory=list)
    coverage: dict[str, str] = Field(default_factory=dict)
    coverage_level: str | None = None
    n_observations: int = 0
    kpis: list[KPI] = Field(default_factory=list)
    provenance: Provenance


class ProductivityResponse(BaseModel):
    period: str | None = None
    n_observations: int = 0
    kpis: list[KPI] = Field(default_factory=list)
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
    unit: str | None = None
    period: str | None = None
    crop: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    districts: list[MapDistrictMetric] = Field(default_factory=list)
    provenance: Provenance


# --- trends ----------------------------------------------------------------


class TrendPoint(BaseModel):
    period: str
    year: int | None = None
    season: str | None = None
    values: dict[str, float | None] = Field(default_factory=dict)


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


class PostHarvestResponse(BaseModel):
    kpis: list[KPI] = Field(default_factory=list)
    crops: list[PostHarvestCrop] = Field(default_factory=list)
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
