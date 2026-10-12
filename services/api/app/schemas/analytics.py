"""Analytics schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import Provenance


class ForecastTargetDecision(BaseModel):
    """One candidate forecast target and the backtest's verdict on it."""

    target_id: str | None = None
    #: ``ok`` (published) | ``insufficient_evidence`` (suppressed, with reasons).
    status: str | None = None
    reasons: list[str] = Field(default_factory=list)
    n_series: int = 0
    n_series_eligible: int = 0
    decision_note: str | None = None
    skill_vs_naive: float | None = None
    next_period: str | None = None
    point_estimate: float | None = None
    unit: str | None = None
    interval: list[float] | None = None
    interval_coverage: float | None = None


class ForecastStatusResponse(BaseModel):
    """The forecast publication decision, served verbatim from the backtest.

    ``serves_forecast`` is the only signal a client should branch on. When it is
    false there is no forecast to draw - only the evidence verdict and the
    reasons it failed - and that state is a valid, complete answer.
    """

    report_available: bool
    serves_forecast: bool
    generated: str | None = None
    policy: dict = Field(default_factory=dict)
    policy_is_default: bool | None = None
    method_note: str | None = None
    targets: list[ForecastTargetDecision] = Field(default_factory=list)
    note: str
    provenance: Provenance


class ProductivityRow(BaseModel):
    year: int
    season: str
    district: str
    crop: str
    cultivated_area_ha: float | None = None
    harvested_area_ha: float | None = None
    production_mt: float | None = None
    yield_kg_ha: float | None = None
    benchmark_yield_kg_ha: float | None = None
    gap_index: float | None = None


class GapResponse(BaseModel):
    strategy: str
    count: int
    rows: list[ProductivityRow]
    provenance: Provenance


class IndexedYieldPoint(BaseModel):
    """One published period of one crop's index.

    ``value`` is the published national yield in t/ha; ``index`` is that value
    against the crop's own baseline. Both are null for a period the release did
    not tabulate, so the gap survives to the chart.
    """

    period: str
    label: str
    value: float | None = None
    index: float | None = None


class IndexedYieldSeries(BaseModel):
    """One crop's eligibility and index series."""

    crop: str
    eligible: bool
    #: ``eligible`` | ``ineligible`` - an enum-shaped string for the client.
    availability: str
    baseline: float | None = None
    n_observations: int = 0
    #: Why the crop is ineligible. Present whenever ``eligible`` is false.
    reason: str | None = None
    points: list[IndexedYieldPoint] = Field(default_factory=list)


class IndexedYieldResponse(BaseModel):
    """Per-crop yield index, each against that crop's own published baseline."""

    metric: str
    unit: str
    baseline_definition: str
    min_periods: int
    periods: list[str] = Field(default_factory=list)
    series: list[IndexedYieldSeries] = Field(default_factory=list)
    provenance: Provenance


class FactorAssociation(BaseModel):
    factor: str
    correlation_with_yield: float | None = None
    n_observations: int
    note: str = "association only; not evidence of causation"


class FactorResponse(BaseModel):
    crop: str | None = None
    factors: list[FactorAssociation]
    provenance: Provenance


class PriorityRow(BaseModel):
    id: str
    district: str
    crop: str
    score: float
    band: str
    yield_kg_ha: float | None = None
    benchmark_yield_kg_ha: float | None = None
    harvested_area_ha: float | None = None
    gap: float
    vulnerability: float
    affected_scale: float
    #: Normalized component the engine used. ``None`` means the component has no
    #: measured value for the selected period, so its weight was redistributed
    #: rather than applied to a neutral constant.
    readiness: float | None = None
    cost_constraint: float | None = None


class ComponentAvailability(BaseModel):
    """What one priority component is actually made of, for the selected period.

    ``status`` is one of ``measured`` / ``proxy`` / ``unavailable`` /
    ``undetermined``. A component that is ``unavailable`` must be reported as a
    missing value, never as a constant.
    """

    component: str
    label: str
    status: str
    source_period: str | None = None
    note: str | None = None


class PriorityResponse(BaseModel):
    weights: dict
    rows: list[PriorityRow]
    proxy_notes: list[str] = Field(default_factory=list)
    #: Components whose weight was redistributed over the components that do have
    #: measured data for the selected period.
    components_unavailable: list[str] = Field(default_factory=list)
    component_availability: list[ComponentAvailability] = Field(default_factory=list)
    provenance: Provenance


# Human-readable weight keys accepted by the Intervention Planner.
WEIGHT_KEYS = {
    "gap": "wg",
    "vulnerability": "wv",
    "affected_scale": "wf",
    "readiness": "wr",
    "cost": "wc",
}


class WeightsIn(BaseModel):
    """Adjustable intervention weights. Must be non-negative and sum to ~1."""

    gap: float = Field(0.30, ge=0, le=1)
    vulnerability: float = Field(0.20, ge=0, le=1)
    affected_scale: float = Field(0.20, ge=0, le=1)
    readiness: float = Field(0.20, ge=0, le=1)
    cost: float = Field(0.10, ge=0, le=1)

    @model_validator(mode="after")
    def _sum_to_one(self) -> WeightsIn:
        total = self.gap + self.vulnerability + self.affected_scale + self.readiness + self.cost
        if abs(total - 1.0) > 0.02:
            raise ValueError(f"weights must sum to ~1.0 (got {total:.3f})")
        return self

    def to_engine(self) -> dict:
        return {WEIGHT_KEYS[k]: getattr(self, k) for k in WEIGHT_KEYS}


class PriorityRequest(BaseModel):
    weights: WeightsIn = Field(default_factory=WeightsIn)
    limit: int = Field(50, ge=1, le=500)
