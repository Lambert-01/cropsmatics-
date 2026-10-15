"""Request/response models for the Intervention Priority Scenario Lab.

The same shape as the yield scenario (``app.schemas.scenario``), applied to the
planner: two sets of independently-specified, reviewable assumptions produce two
rankings, and the movement between them is reported candidate by candidate.

The unit is a **district x crop candidate** rather than a district, because the
priority engine scores each crop in each district separately and collapsing that
would hide which crop drove a score. ``weights`` reuse the planner's own
vocabulary (``WeightsIn``) so a scenario is expressed in the same terms the
Intervention Planner already exposes.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.analytics import ComponentAvailability, WeightsIn
from app.schemas.common import Provenance
from app.schemas.scenario import ScenarioChange


class PriorityScenarioParams(BaseModel):
    """The reviewable assumptions that define one side of the comparison.

    Each side is described completely and independently: an unset selection field
    means "no restriction" for *that* side, and nothing is inherited from the
    other side. The response echoes both resolved sides, so a reader can always
    see exactly what was compared.

    Unknown fields are refused rather than ignored. A misspelled
    ``benchmark`` (for ``benchmark_strategy``) would otherwise be dropped and the
    side silently ranked against the default benchmark - a wrong comparison that
    looks like a successful one.
    """

    model_config = ConfigDict(extra="forbid")

    weights: WeightsIn = Field(
        default_factory=WeightsIn,
        description="planner weights; must be non-negative and sum to ~1.0",
    )
    purpose: str | None = Field(
        None,
        description=(
            "productivity_support (default: candidates must have a positive yield "
            "shortfall) | harvest_coordination (operational scale and perishability; "
            "not a shortfall ranking)"
        ),
    )
    shortfall_threshold_pct: float = Field(
        0.0,
        ge=0,
        le=100,
        description="how far below the benchmark counts as a shortfall",
    )
    period_code: str | None = Field(
        None, description="published period, e.g. 2026B; see /api/v1/meta/periods"
    )
    benchmark_strategy: str | None = Field(
        None,
        description=(
            "national_crop_median | national_crop_season_median | "
            "top_quartile_comparable_districts | agro_ecological_peer_group"
        ),
    )
    province: str | None = Field(None, description="restrict the candidate set to one province")
    district: str | None = Field(None, description="restrict the candidate set to one district")
    crop: str | None = Field(None, description="restrict the candidate set to one crop")
    top_n: int = Field(
        10, ge=1, le=200, description="how many ranked candidates count as the review shortlist"
    )
    min_score: float = Field(
        0.0, ge=0, le=1, description="candidates scoring below this are not presented at all"
    )


class PriorityScenarioRequest(BaseModel):
    """Two independently specified rankings over the same candidate universe."""

    model_config = ConfigDict(extra="forbid")

    baseline: PriorityScenarioParams = Field(default_factory=PriorityScenarioParams)
    scenario: PriorityScenarioParams = Field(default_factory=PriorityScenarioParams)


class PriorityCandidateRow(BaseModel):
    """One district x crop candidate as the ranking engine placed it.

    Every row is **eligible** for the purpose the side was ranked under. An
    above-benchmark candidate is reported through ``PriorityView.ineligible``
    with its reason, not here as a LOW-scoring priority.
    """

    id: str
    district: str
    crop: str | None = None
    rank: int
    score: float
    band: str
    #: CRITICAL or HIGH - the bands the planner communicates as "a priority".
    in_priority_group: bool = False
    #: Inside this side's top-N shortlist.
    in_top_n: bool = False
    shortfall_pct: float | None = None
    eligible: bool = True
    eligibility_reason: str | None = None
    purpose: str | None = None
    reference_n: int | None = None


class PriorityIneligibleRow(BaseModel):
    """A candidate this side excluded, and the fact that excluded it."""

    id: str
    reason: str


class PriorityViewStats(BaseModel):
    n_candidates: int = 0
    n_priority_group: int = 0
    n_top_n: int = 0
    band_counts: dict[str, int] = Field(default_factory=dict)
    mean_score: float | None = None


class PriorityView(BaseModel):
    """One side of the comparison: a ranked candidate list plus its statistics."""

    label: str | None = None
    #: Which planning question this side answers (``productivity_support`` or
    #: ``harvest_coordination``). Both sides of one comparison use the same one.
    purpose: str | None = None
    shortfall_threshold_pct: float = 0.0
    #: Engine-keyed weights actually used (wg/wv/wf/wr/wc).
    weights: dict[str, float] = Field(default_factory=dict)
    top_n: int = 10
    period_code: str | None = None
    period_label: str | None = None
    crop: str | None = None
    province: str | None = None
    district: str | None = None
    benchmark_strategy: str | None = None
    #: True when this side's selection has no candidates at all. The rows are then
    #: empty - never zeros - and `reason` says why.
    missing: bool = False
    reason: str | None = None
    source_id: str | None = None
    n_observations: int = 0
    #: Components that have no measured value for *this side's* period, so their
    #: weights were redistributed before ranking.
    components_unavailable: list[str] = Field(default_factory=list)
    component_availability: list[ComponentAvailability] = Field(default_factory=list)
    #: Eligible candidates this side ranked, and the candidates it excluded for
    #: being at or above their benchmark. A side with candidates but none eligible
    #: is ``missing`` with a reason, not an empty ranking.
    n_eligible: int = 0
    n_ineligible: int = 0
    ineligible: list[PriorityIneligibleRow] = Field(default_factory=list)
    reference_population: dict = Field(default_factory=dict)
    rows: list[PriorityCandidateRow] = Field(default_factory=list)
    stats: PriorityViewStats = Field(default_factory=PriorityViewStats)


class PriorityMovementRow(BaseModel):
    """One candidate's position before and after.

    ``district`` is the crop-qualified candidate label, because one district can
    hold several priorities and a bare name would merge two different rows.
    """

    district: str
    rank_before: int | None = None
    rank_after: int | None = None
    # rank_before - rank_after: positive means the candidate moved up.
    movement: int | None = None
    direction: str = "unchanged"
    score_before: float | None = None
    score_after: float | None = None
    band_before: str | None = None
    band_after: str | None = None
    in_top_n_before: bool | None = None
    in_top_n_after: bool | None = None


class PriorityMovement(BaseModel):
    districts: list[PriorityMovementRow] = Field(default_factory=list)
    n_compared: int = 0
    n_moved: int = 0
    n_unchanged: int = 0
    # Candidates that only appear on one side because the *selection* changed.
    # Reported separately so a selection change is never read as a re-prioritisation.
    entered_group: list[str] = Field(default_factory=list)
    left_group: list[str] = Field(default_factory=list)
    # Candidates that entered/left this side's top-N shortlist. Named for
    # consistency with the yield scenario's movement contract.
    entered_priority: list[str] = Field(default_factory=list)
    left_priority: list[str] = Field(default_factory=list)


class WeightDelta(BaseModel):
    """Per-weight change, so a weighting scenario explains itself."""

    key: str
    label: str | None = None
    before: float | None = None
    after: float | None = None
    delta: float | None = None


class PriorityScenarioResponse(BaseModel):
    """The result of an analytical priority scenario.

    ``scenario_type`` is always ``"analytical"``: this re-ranks published
    observations, it is not a budget model, a yield forecast, or a statement that
    any district must receive a particular intervention.
    """

    scenario_type: str = "analytical"
    scenario_label: str = "Analytical scenario"
    #: The shared planning purpose both sides were ranked under.
    purpose: str | None = None
    purpose_label: str | None = None
    purpose_note: str | None = None
    methodology_version: str | None = None
    #: How far below the benchmark a candidate must be to appear at all.
    shortfall_threshold_pct: float = 0.0
    baseline: PriorityView
    scenario: PriorityView
    changes: list[ScenarioChange] = Field(default_factory=list)
    weight_deltas: list[WeightDelta] = Field(default_factory=list)
    ranking_movement: PriorityMovement
    available_periods: list[str] = Field(default_factory=list)
    available_benchmark_strategies: list[str] = Field(default_factory=list)
    #: Named planning positions a client can offer as a starting point. Engine-keyed,
    #: exactly like ``PriorityView.weights``, so the two are always comparable.
    available_presets: dict[str, dict[str, float]] = Field(default_factory=dict)
    #: Display names for ``available_presets``, keyed by preset id.
    preset_labels: dict[str, str] = Field(default_factory=dict)
    #: Display names for the engine weight keys (wg/wv/wf/wr/wc).
    weight_labels: dict[str, str] = Field(default_factory=dict)
    proxy_notes: list[str] = Field(default_factory=list)
    #: Union of the components excluded on either side because they carry no
    #: measured value for that side's period.
    components_unavailable: list[str] = Field(default_factory=list)
    #: Per-component status for the baseline side's frame (the frame the notes
    #: are built from). Both sides report their own list in ``PriorityView``.
    component_availability: list[ComponentAvailability] = Field(default_factory=list)
    provenance: Provenance
    limitations: list[str] = Field(default_factory=list)
