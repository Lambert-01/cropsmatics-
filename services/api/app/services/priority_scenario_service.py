"""Analytical priority-scenario orchestration for the Intervention Planner.

This layer only *wires together* existing, verified pieces:

* ``analytics_service.priority_candidates`` produces the district x crop
  candidate set with the engine's raw components;
* ``analytics.intervention_priority.rank`` scores and orders them under a weighting;
* ``analytics.priority_scenario`` turns two rankings into two reviewable views and
  reports the movement between them;
* ``analytics.sensitivity`` supplies the named planning positions a scenario can
  offer as starting points.

No agricultural statistic is computed here for the first time and nothing is
imputed. A candidate a release did not tabulate simply does not exist, and is
reported as absent - never as a zero-scoring priority.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.analytics import intervention_priority as ip
from app.analytics import priority_scenario as ps
from app.analytics import sensitivity
from app.analytics.productivity_gap import STRATEGIES
from app.analytics.scenario import ScenarioError, validate_strategy
from app.schemas.common import Provenance
from app.schemas.filters import AnalyticsFilters
from app.schemas.priority_scenario import (
    PriorityCandidateRow,
    PriorityMovement,
    PriorityScenarioParams,
    PriorityScenarioRequest,
    PriorityScenarioResponse,
    PriorityView,
    PriorityViewStats,
    WeightDelta,
)
from app.schemas.scenario import ScenarioChange
from app.services import analytics_service, period_service

DEFAULT_BENCHMARK_STRATEGY = "national_crop_median"


class UnknownSelectionError(ValueError):
    """Raised when a scenario side selects something that cannot be ranked."""


@dataclass(frozen=True)
class ResolvedSide:
    """One fully-specified side of the comparison."""

    weights: dict
    period_code: str
    benchmark_strategy: str
    province: str | None
    district: str | None
    crop: str | None
    top_n: int
    min_score: float

    def as_dict(self) -> dict:
        return {
            "period_code": self.period_code,
            "benchmark_strategy": self.benchmark_strategy,
            "province": self.province,
            "district": self.district,
            "crop": self.crop,
            "top_n": self.top_n,
            "min_score": self.min_score,
        }

    def filters(self) -> AnalyticsFilters:
        return AnalyticsFilters(
            period_code=self.period_code,
            crop=self.crop,
            province=self.province,
            district=self.district,
            benchmark_strategy=self.benchmark_strategy,
        )


def _default_period() -> str:
    fallback = period_service.latest_district() or period_service.latest()
    if not fallback:
        raise period_service.UnknownPeriodError(
            "no processed period data found - run `make data` to build the panel"
        )
    return fallback


def _clean_text(value: str | None) -> str | None:
    """Treat a blank string as "no restriction" rather than as a filter value."""
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped or None


def resolve_side(params: PriorityScenarioParams) -> ResolvedSide:
    """Apply the documented defaults to one side of the request.

    An unpublished period is rejected (matching every other period-aware
    endpoint) rather than silently falling back, so a scenario can never describe
    a period the caller did not ask for.
    """
    period = _clean_text(params.period_code)
    period_code = period_service.require(period) if period else _default_period()

    strategy = _clean_text(params.benchmark_strategy) or DEFAULT_BENCHMARK_STRATEGY
    try:
        validate_strategy(strategy)
    except ScenarioError as exc:
        raise UnknownSelectionError(str(exc)) from exc

    district = _clean_text(params.district)
    # A district already implies its own province: combining them would silently
    # empty the candidate set whenever the district sits outside the province.
    province = None if district else _clean_text(params.province)

    return ResolvedSide(
        weights=params.weights.to_engine(),
        period_code=period_code,
        benchmark_strategy=strategy,
        province=province,
        district=district,
        crop=_clean_text(params.crop),
        top_n=params.top_n,
        min_score=params.min_score,
    )


def _missing_reason(side: ResolvedSide, label: str) -> str:
    scope = " · ".join(
        part
        for part in (
            side.crop,
            side.period_code,
            side.district or (f"{side.province} province" if side.province else None),
        )
        if part
    )
    return (
        f"no district x crop candidates for {scope} ({label}): the selection has no "
        "published productivity rows with a positive yield, so there is nothing to "
        "rank. This is reported as no candidates rather than as zero-priority districts"
    )


def build_side(side: ResolvedSide, label: str) -> PriorityView:
    """Build one ranked view from the selected candidates."""
    candidates, source_id = analytics_service.priority_candidates_with_source(side.filters())

    if not candidates:
        return PriorityView(
            label=label,
            weights=side.weights,
            top_n=side.top_n,
            period_code=side.period_code,
            period_label=period_service.label(side.period_code),
            crop=side.crop,
            province=side.province,
            district=side.district,
            benchmark_strategy=side.benchmark_strategy,
            missing=True,
            reason=_missing_reason(side, label),
            source_id=None,
        )

    ranked = ip.rank(candidates, weights=side.weights)
    view = ps.build_view(
        ranked,
        weights=side.weights,
        top_n=side.top_n,
        min_score=side.min_score,
        label=label,
    )

    return PriorityView(
        label=label,
        weights=side.weights,
        top_n=side.top_n,
        period_code=side.period_code,
        period_label=period_service.label(side.period_code),
        crop=side.crop,
        province=side.province,
        district=side.district,
        benchmark_strategy=side.benchmark_strategy,
        missing=False,
        source_id=source_id,
        n_observations=view["stats"]["n_candidates"],
        rows=[PriorityCandidateRow(**row) for row in view["rows"]],
        stats=PriorityViewStats(**view["stats"]),
    )


def run(payload: PriorityScenarioRequest) -> PriorityScenarioResponse:
    """Execute an analytical priority scenario and return both sides plus movement."""
    baseline_side = resolve_side(payload.baseline)
    scenario_side = resolve_side(payload.scenario)

    baseline_view = build_side(baseline_side, "Baseline")
    scenario_view = build_side(scenario_side, "Scenario")

    movement = ps.compare(
        baseline_view.model_dump(), scenario_view.model_dump(), top_n=scenario_side.top_n
    )

    changes = [
        ScenarioChange(**change)
        for change in ps.summarise_changes(baseline_side.as_dict(), scenario_side.as_dict())
    ]
    weight_deltas = [
        WeightDelta(**{**delta, "label": sensitivity.WEIGHT_LABELS.get(delta["key"])})
        for delta in ps.weight_deltas(baseline_side.weights, scenario_side.weights)
    ]

    limitations = [
        "an analytical priority scenario re-ranks published observations under "
        "different planning assumptions; it is not a budget model, not a yield "
        "forecast and not a statement that any district must receive an intervention",
        "re-weighting changes a candidate's relative position inside the same "
        "candidate set, so it can move up because a peer moved down - the score "
        "components are what explain why",
        "the readiness and cost components are documented proxies; a ranking that "
        "moves when a proxy is re-weighted is expressing that proxy's influence, "
        "not a measured effect",
        "softening a weight without new field evidence does not make a candidate a "
        "better or worse place to intervene; it changes what the planner is ranking by",
    ]
    if baseline_view.missing or scenario_view.missing:
        limitations.append(
            "one side of this comparison has no candidate at all, so no movement is "
            "reported for it"
        )
    if scenario_side.top_n != baseline_side.top_n:
        limitations.append(
            "the top-N shortlist size differs between the two sides, so an "
            "entry or exit of the shortlist can reflect the threshold rather than "
            "the weighting"
        )

    return PriorityScenarioResponse(
        baseline=baseline_view,
        scenario=scenario_view,
        changes=changes,
        weight_deltas=weight_deltas,
        ranking_movement=PriorityMovement(**movement),
        available_periods=period_service.period_codes(),
        available_benchmark_strategies=list(STRATEGIES),
        available_presets=sensitivity.PRESETS,
        preset_labels=sensitivity.PRESET_LABELS,
        weight_labels=sensitivity.WEIGHT_LABELS,
        proxy_notes=analytics_service.PROXY_NOTES,
        provenance=Provenance(
            source_id=scenario_view.source_id or baseline_view.source_id,
            source_period=f"{baseline_side.period_code}-{scenario_side.period_code}",
            benchmark_strategy=scenario_side.benchmark_strategy,
            method=(
                "deterministic re-ranking of district x crop candidates from published "
                "district aggregates under two sets of reviewable planning weights; "
                "the score is a weighted, min-max normalised sum of documented "
                "components and no value is modelled, imputed or forecast"
            ),
            limitations=limitations,
        ),
        limitations=limitations,
    )
