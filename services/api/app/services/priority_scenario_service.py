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
    purpose: str = ip.DEFAULT_PURPOSE
    threshold_pct: float = ip.DEFAULT_SHORTFALL_THRESHOLD_PCT

    def as_dict(self) -> dict:
        return {
            "period_code": self.period_code,
            "benchmark_strategy": self.benchmark_strategy,
            "province": self.province,
            "district": self.district,
            "crop": self.crop,
            "top_n": self.top_n,
            "min_score": self.min_score,
            "shortfall_threshold_pct": self.threshold_pct,
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
    # Keep the same reference scope as the ranking and map. District inspection
    # must not silently discard an explicitly selected province.
    province = _clean_text(params.province)

    purpose = _clean_text(getattr(params, "purpose", None)) or ip.DEFAULT_PURPOSE
    if purpose not in ip.PURPOSES:
        raise UnknownSelectionError(
            f"unknown planning purpose {purpose!r}; expected one of {ip.PURPOSES}"
        )

    return ResolvedSide(
        weights=(
            params.weights.to_engine() if "weights" in params.model_fields_set
            else dict(ip.PURPOSE_WEIGHTS[purpose])
        ),
        period_code=period_code,
        benchmark_strategy=strategy,
        province=province,
        district=district,
        crop=_clean_text(params.crop),
        top_n=params.top_n,
        min_score=params.min_score,
        purpose=purpose,
        threshold_pct=float(getattr(params, "shortfall_threshold_pct", 0.0) or 0.0),
    )


def _missing_reason(side: ResolvedSide, label: str, population: ip.Population) -> str:
    scope = " · ".join(
        part
        for part in (
            side.crop,
            side.period_code,
            side.district or (f"{side.province} province" if side.province else None),
        )
        if part
    )
    if side.district or population.ineligible:
        # The candidate exists but is not a target for this purpose. Saying so is
        # the difference between "no data" and "no shortfall here".
        return (
            f"no candidate for {scope} ({label}) is eligible for "
            f"{ip.PURPOSE_LABELS.get(population.purpose, population.purpose)} under the "
            "selected eligibility threshold. Reported as no "
            "eligible candidate rather than as zero-priority districts."
        )
    return (
        f"no district x crop candidates for {scope} ({label}): the selection has no "
        "published productivity rows with a positive yield, so there is nothing to "
        "rank. This is reported as no candidates rather than as zero-priority districts"
    )


def _eligibility_fields(population: ip.Population) -> dict:
    """The eligibility counts and reasons one side reports about itself."""
    return {
        "n_eligible": population.n_reference,
        "n_ineligible": len(population.ineligible),
        "ineligible": [
            {"id": cid, "reason": reason}
            for cid, reason in sorted(population.ineligible.items())
        ][:200],
        "reference_population": population.as_dict(),
    }


def build_side(
    side: ResolvedSide,
    label: str,
) -> PriorityView:
    """Build one ranked view from the selected candidates.

    Eligibility is applied once, from the shared engine population, so the two
    sides and the planner's own shortlist cannot disagree about who is a
    candidate. When a component is unavailable for the selected period - or
    carries no discriminating value across the population - its weight is
    redistributed before ranking, so the score is never computed from a neutral
    constant that would look like measured data.
    """
    # The same eligibility rule, from the same function, that the ranking
    # endpoint and the map use: a scenario cannot rank a candidate the planner's
    # own shortlist considers ineligible.
    purpose, threshold_pct = side.purpose, side.threshold_pct
    candidates, source_id, unavailable, population = analytics_service.priority_candidates_with_source(
        side.filters(), purpose=purpose, threshold_pct=threshold_pct
    )
    effective_weights = ip.effective_weights(side.weights, tuple(unavailable), purpose=purpose)
    availability = analytics_service.component_availability(
        analytics_service.candidate_frame(side.filters())
    )
    eligibility = {
        **_eligibility_fields(population),
        "shortfall_threshold_pct": threshold_pct,
    }
    ranked = ip.rank(
        candidates, weights=effective_weights, purpose=purpose,
        threshold_pct=threshold_pct, unavailable=tuple(unavailable),
    )
    if side.district:
        ranked = [row for row in ranked if row["district"].casefold() == side.district.casefold()]

    if not ranked:
        return PriorityView(
            label=label,
            weights=effective_weights,
            top_n=side.top_n,
            period_code=side.period_code,
            period_label=period_service.label(side.period_code),
            crop=side.crop,
            province=side.province,
            district=side.district,
            benchmark_strategy=side.benchmark_strategy,
            missing=True,
            reason=_missing_reason(side, label, population),
            source_id=None,
            purpose=purpose,
            components_unavailable=unavailable,
            component_availability=availability,
            **eligibility,
        )

    view = ps.build_view(
        ranked,
        weights=effective_weights,
        top_n=side.top_n,
        min_score=side.min_score,
        label=label,
    )

    return PriorityView(
        label=label,
        weights=effective_weights,
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
        purpose=purpose,
        components_unavailable=unavailable,
        component_availability=availability,
        rows=[PriorityCandidateRow(**row) for row in view["rows"]],
        stats=PriorityViewStats(**view["stats"]),
        **eligibility,
    )


def run(payload: PriorityScenarioRequest) -> PriorityScenarioResponse:
    """Execute an analytical priority scenario and return both sides plus movement."""
    baseline_side = resolve_side(payload.baseline)
    scenario_side = resolve_side(payload.scenario)

    if baseline_side.purpose != scenario_side.purpose:
        raise UnknownSelectionError(
            "baseline.purpose and scenario.purpose must match; compare weights or "
            "thresholds within one planning purpose."
        )
    purpose = scenario_side.purpose
    threshold_pct = scenario_side.threshold_pct

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

    # Build period-aware proxy notes from the actual candidate frame.
    df_for_notes = analytics_service.candidate_frame(baseline_side.filters())
    proxy_notes = analytics_service.proxy_notes_for(df_for_notes)
    # Availability is resolved per side (each side has its own period); the
    # response-level list is the union, and the per-component detail describes the
    # baseline frame the notes are built from.
    baseline_availability = analytics_service.component_availability(df_for_notes)
    unavailable_union = sorted(
        {*baseline_view.components_unavailable, *scenario_view.components_unavailable}
    )

    if baseline_side.threshold_pct != scenario_side.threshold_pct:
        limitations.insert(
            0,
            "The shortfall threshold differs between the two sides. Eligibility and "
            "the normalization population may change; shortlist movement is not "
            "solely a change in weighting.",
        )

    return PriorityScenarioResponse(
        purpose=purpose,
        purpose_label=ip.PURPOSE_LABELS.get(purpose, purpose),
        purpose_note=ip.PURPOSE_NOTES.get(purpose),
        methodology_version=ip.METHODOLOGY_VERSION,
        shortfall_threshold_pct=threshold_pct,
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
        proxy_notes=proxy_notes,
        components_unavailable=unavailable_union,
        component_availability=baseline_availability,
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
