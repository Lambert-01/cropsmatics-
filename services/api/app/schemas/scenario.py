"""Request/response models for the Yield Scenario Lab (analytical scenarios).

A scenario has two sides, and the *baseline is never overwritten*: the baseline
is computed from its own parameters and returned alongside the scenario, so a
client can always render "before" and "after" from a single response.

Nothing in this schema can carry an agricultural value into the calculation. A
request names *entities and assumptions only* (period, crop, province, benchmark
strategy, threshold, ranking criterion), which is what keeps the endpoint a
deterministic re-computation rather than a place a number could be injected.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Provenance


class ScenarioParams(BaseModel):
    """The reviewable assumptions that define one side of a scenario.

    Both sides are described independently and completely: an unset field takes
    the documented default for *that* side, and for the two group fields an
    unset value means "no restriction" (all districts). Nothing is inherited
    from the other side, so a parameter that was not sent can never be read as
    either "unchanged" or "cleared" - the response echoes both resolved sides,
    which is what makes the comparison unambiguous.
    """

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
    gap_threshold_pct: float | None = Field(
        None,
        ge=0,
        le=200,
        description=(
            "gap index at or above which a district is flagged high-priority "
            "in this scenario (default 25.0)"
        ),
    )
    province: str | None = Field(None, description="restrict the district group to one province")
    district: str | None = Field(None, description="restrict to a single district")
    ranking_criterion: str | None = Field(
        None,
        description=(
            "gap_index | yield_kg_ha | production_mt | harvested_area_ha "
            "(default gap_index)"
        ),
    )


class ScenarioRequest(BaseModel):
    """A crop is required: yields are only comparable within a crop.

    Maize, beans, cassava and potato kg/ha sit on different natural scales, so a
    cross-crop district ranking would be a meaningless number. Requiring the crop
    here makes that a validation error rather than a silent scientific mistake.
    """

    crop: str = Field(min_length=1, max_length=80, description="canonical crop name, e.g. Maize")
    baseline: ScenarioParams = Field(default_factory=ScenarioParams)
    scenario: ScenarioParams = Field(default_factory=ScenarioParams)


class ScenarioDistrictRow(BaseModel):
    district: str
    rank: int | None = None
    district_code: str | None = None
    province: str | None = None
    yield_kg_ha: float | None = None
    benchmark_yield_kg_ha: float | None = None
    gap_index: float | None = None
    harvested_area_ha: float | None = None
    production_mt: float | None = None
    below_benchmark: bool = False
    below_threshold: bool = False


class ScenarioGapBand(BaseModel):
    id: str
    label: str
    min_pct: float | None = None
    max_pct: float | None = None
    count: int = 0
    share_pct: float | None = None


class ScenarioViewStats(BaseModel):
    #: Districts actually shown (the selected group).
    n_districts: int = 0
    n_below_benchmark: int = 0
    n_below_threshold: int = 0
    ranked_districts: int = 0
    unranked_districts: int = 0
    mean_gap_index: float | None = None
    mean_yield_kg_ha: float | None = None
    total_production_mt: float | None = None
    total_harvested_area_ha: float | None = None
    #: Districts the benchmark was measured over. This is the whole published set
    #: for the crop and period, so it is normally larger than ``n_districts`` when
    #: a group is selected - which is what proves the reference did not move.
    n_benchmark_districts: int = 0
    benchmark_scope: str | None = None


class ScenarioView(BaseModel):
    """One side of the comparison: the ranked districts of one selection."""

    period_code: str | None = None
    period_label: str | None = None
    crop: str
    benchmark_strategy: str
    gap_threshold_pct: float
    ranking_criterion: str
    ranking_criterion_label: str
    ranking_criterion_unit: str | None = None
    ranking_criterion_note: str | None = None
    province: str | None = None
    district: str | None = None
    # True when the period exists but this crop was not tabulated for it. The
    # districts are then empty - never zeroes - and `reason` says why.
    missing: bool = False
    reason: str | None = None
    n_observations: int = 0
    source_id: str | None = None
    rows: list[ScenarioDistrictRow] = Field(default_factory=list)
    gap_bands: list[ScenarioGapBand] = Field(default_factory=list)
    stats: ScenarioViewStats = Field(default_factory=ScenarioViewStats)


class RankMovementRow(BaseModel):
    district: str
    rank_before: int | None = None
    rank_after: int | None = None
    # rank_before - rank_after: positive means the district moved up (5 -> 2 is +3).
    movement: int | None = None
    direction: str = "unchanged"
    gap_before: float | None = None
    gap_after: float | None = None
    yield_before: float | None = None
    yield_after: float | None = None
    below_threshold_before: bool | None = None
    below_threshold_after: bool | None = None


class RankMovement(BaseModel):
    districts: list[RankMovementRow] = Field(default_factory=list)
    n_compared: int = 0
    n_moved: int = 0
    n_unchanged: int = 0
    # Districts that only appear on one side because the district *group* changed.
    # Reported separately so a group change is never read as a performance change.
    entered_group: list[str] = Field(default_factory=list)
    left_group: list[str] = Field(default_factory=list)
    entered_priority: list[str] = Field(default_factory=list)
    left_priority: list[str] = Field(default_factory=list)


class ScenarioChange(BaseModel):
    parameter: str
    label: str
    before: object | None = None
    after: object | None = None


class ModelScenarioAvailability(BaseModel):
    """Whether the *model-based* scenario mode may be offered.

    Mode B is only enabled when a validated model card for the target actually
    exists in ``ml/reports``. With no card, it stays off and says so, rather than
    presenting a modelled guess as an intervention outcome.
    """

    # These field names are part of the public contract (they are echoed from the
    # model registry), so opt out of pydantic's `model_` protected namespace
    # rather than renaming them - see `Provenance` for the same pattern.
    model_config = ConfigDict(protected_namespaces=())

    available: bool = False
    reason: str
    model_name: str | None = None
    model_version: str | None = None
    metrics: dict = Field(default_factory=dict)
    warning: str = (
        "A model-based scenario describes a fitted model's output, not a "
        "guaranteed intervention outcome."
    )


class ScenarioResponse(BaseModel):
    """The result of an analytical scenario.

    ``scenario_type`` is always ``"analytical"``. It exists so a client has an
    explicit, checkable signal that this is a *re-computation* and not a
    prediction; there is deliberately no code path that returns ``"predicted"``.
    """

    model_config = ConfigDict(protected_namespaces=())

    scenario_type: str = "analytical"
    scenario_label: str = "Analytical scenario"
    crop: str
    baseline: ScenarioView
    scenario: ScenarioView
    changes: list[ScenarioChange] = Field(default_factory=list)
    ranking_movement: RankMovement
    model_scenario: ModelScenarioAvailability
    available_periods: list[str] = Field(default_factory=list)
    available_benchmark_strategies: list[str] = Field(default_factory=list)
    available_ranking_criteria: list[dict] = Field(default_factory=list)
    provenance: Provenance
    limitations: list[str] = Field(default_factory=list)
