"""Analytics schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import Provenance


class ForecastTargetDecision(BaseModel):
    """One candidate forecast target and the backtest's verdict on it."""

    target_id: str | None = None
    crop: str | None = None
    season: str | None = None
    metric: str | None = None
    geography_level: str | None = None
    district: str | None = None
    model: str | None = None
    horizon: str | None = None
    label: str | None = None
    interval_level: float | None = None
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
    selection: dict = Field(default_factory=dict)
    scope_note: str | None = None
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
    """One eligible district x crop candidate and the score it was given.

    A row only ever describes a candidate that is **eligible** for the stated
    planning purpose. An above-benchmark candidate is not returned as a
    low-scoring row: "no shortfall" and "a small shortfall" are different facts, so
    ineligible candidates travel in ``PriorityResponse.ineligible`` with their
    reasons instead.
    """

    id: str
    district: str
    crop: str
    score: float
    band: str
    yield_kg_ha: float | None = None
    benchmark_yield_kg_ha: float | None = None
    harvested_area_ha: float | None = None
    #: The signed published gap (``100 * (1 - yield / benchmark)``). Negative
    #: means above the benchmark. The score's gap component is built from the
    #: non-negative ``shortfall_pct``, never from this value.
    gap: float
    #: ``max(gap, 0)`` - the part of the gap that is a shortfall.
    shortfall_pct: float | None = None
    eligible: bool = True
    #: Present exactly when ``eligible`` is false.
    eligibility_reason: str | None = None
    purpose: str | None = None
    #: Size of the reference population the components were normalized over.
    reference_n: int | None = None
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


class PriorityIneligibleRow(BaseModel):
    """A candidate excluded from the ranking, and the fact that excluded it.

    Reported rather than dropped, so a planner can see that the district they
    expected is absent *because it has no shortfall*, not because the data are
    missing.
    """

    id: str
    reason: str


class PriorityResponse(BaseModel):
    weights: dict
    rows: list[PriorityRow]
    #: Which planning question this ranking answers. A shortfall ranking and an
    #: operational-scale ranking are never presented as the same list.
    purpose: str = "productivity_support"
    purpose_label: str | None = None
    purpose_note: str | None = None
    methodology_version: str | None = None
    #: How far below the benchmark a candidate must be to count. Explicit and
    #: adjustable rather than implied.
    shortfall_threshold_pct: float = 0.0
    #: The stated reference population the components were normalized over, and a
    #: sentence naming it. Inspecting one district does not change it.
    reference_population: dict = Field(default_factory=dict)
    reference_population_note: str | None = None
    n_eligible: int = 0
    n_ineligible: int = 0
    ineligible: list[PriorityIneligibleRow] = Field(default_factory=list)
    proxy_notes: list[str] = Field(default_factory=list)
    #: Components whose weight was redistributed: no measured value for the
    #: selected period, or no discriminating value across the population.
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

#: The engine's own keys. These are *output* vocabulary: every ranking response
#: echoes them under ``weights``. They are deliberately not accepted as input.
ENGINE_WEIGHT_KEYS: frozenset[str] = frozenset(WEIGHT_KEYS.values())

#: The tolerance the sum-to-one check allows, stated once so the error message
#: and the check cannot disagree.
WEIGHTS_SUM_TOLERANCE = 0.02


class WeightsIn(BaseModel):
    """Adjustable intervention weights. Must be non-negative and sum to ~1.

    The input vocabulary is the planner's own field names
    (``gap``/``vulnerability``/``affected_scale``/``readiness``/``cost``). The
    engine keys (``wg``/``wv``/``wf``/``wr``/``wc``) are what a ranking response
    *returns*, and are rejected here rather than ignored.

    Ignoring them was the real defect: a caller that posted back the dictionary a
    previous response had just handed it got HTTP 200 and a ranking computed from
    the *default* weighting instead - a plausible, wrong answer with nothing to
    indicate the assumptions had been discarded. Unknown keys are therefore
    refused outright (`extra="forbid"`), and engine keys get a message that names
    both vocabularies.
    """

    model_config = ConfigDict(extra="forbid")

    gap: float = Field(0.30, ge=0, le=1, description="weight on the productivity gap")
    vulnerability: float = Field(0.20, ge=0, le=1)
    affected_scale: float = Field(0.20, ge=0, le=1)
    readiness: float = Field(0.20, ge=0, le=1)
    cost: float = Field(0.10, ge=0, le=1)

    @model_validator(mode="before")
    @classmethod
    def _reject_engine_keys(cls, data: object) -> object:
        """Refuse the engine's own key names with an actionable message.

        Runs before field validation so the reader is told *what shape to send*
        instead of pydantic's generic extra-input error.
        """
        if isinstance(data, dict):
            used_engine_keys = sorted(ENGINE_WEIGHT_KEYS.intersection(data))
            if used_engine_keys:
                raise ValueError(
                    "weights must use the planner field names "
                    f"({', '.join(WEIGHT_KEYS)}); got the engine keys "
                    f"{', '.join(used_engine_keys)}, which the API returns and does "
                    "not accept as input. Rename them, e.g. wg -> gap."
                )
        return data

    @model_validator(mode="after")
    def _sum_to_one(self) -> WeightsIn:
        total = self.gap + self.vulnerability + self.affected_scale + self.readiness + self.cost
        if abs(total - 1.0) > WEIGHTS_SUM_TOLERANCE:
            raise ValueError(
                f"weights must sum to 1.0 (got {total:.4f}); adjust the values so the "
                f"total is within {WEIGHTS_SUM_TOLERANCE:g} of 1.0"
            )
        return self

    def to_engine(self) -> dict:
        return {WEIGHT_KEYS[k]: getattr(self, k) for k in WEIGHT_KEYS}


class PriorityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weights: WeightsIn = Field(default_factory=WeightsIn)
    limit: int = Field(50, ge=1, le=500)
    purpose: Literal["productivity_support", "harvest_coordination"] = "productivity_support"
    threshold_pct: float = Field(0.0, ge=0, le=100)
