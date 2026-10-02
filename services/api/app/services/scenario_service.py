"""Analytical scenario orchestration for the Yield Scenario Lab.

This layer only *wires together* existing, verified pieces:

* ``productivity_service.panel_rows`` reads the canonical published panel;
* ``analytics.productivity_gap.compute_gaps`` produces the benchmark and gap;
* ``analytics.scenario`` ranks districts and compares two views;
* ``analytics_service.gap_distribution`` bins the gap distribution.

No agricultural statistic is computed here for the first time, and nothing is
imputed. A crop x district cell that a release did not tabulate stays absent, and
is reported as absent - never as zero.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.analytics import scenario as sim
from app.analytics.productivity_gap import STRATEGIES
from app.schemas.common import Provenance
from app.schemas.scenario import (
    ModelScenarioAvailability,
    RankMovement,
    ScenarioChange,
    ScenarioDistrictRow,
    ScenarioGapBand,
    ScenarioParams,
    ScenarioRequest,
    ScenarioResponse,
    ScenarioView,
    ScenarioViewStats,
)
from app.services import analytics_service, meta_service, period_service, productivity_service

DEFAULT_BENCHMARK_STRATEGY = "national_crop_median"

#: Crops the panel genuinely carries. Used only to tell "we do not publish this
#: crop" (404) apart from "we publish it, but not for this period" (empty view).
UNKNOWN_CROP_MESSAGE = (
    "crop {crop!r} has no published productivity rows; see /api/v1/crops for "
    "supported names"
)


class UnknownCropError(ValueError):
    """Raised when the requested crop is not in the published panel at all."""


@dataclass(frozen=True)
class Resolved:
    """One fully-specified side of the comparison."""

    period_code: str
    benchmark_strategy: str
    gap_threshold_pct: float
    ranking_criterion: str
    province: str | None
    district: str | None

    def as_dict(self) -> dict:
        return {
            "period_code": self.period_code,
            "benchmark_strategy": self.benchmark_strategy,
            "gap_threshold_pct": self.gap_threshold_pct,
            "province": self.province,
            "district": self.district,
            "ranking_criterion": self.ranking_criterion,
        }


def _default_period() -> str:
    fallback = period_service.latest_district() or period_service.latest()
    if not fallback:
        raise period_service.UnknownPeriodError(
            "no processed period data found - run `make data` to build the panel"
        )
    return fallback


def _clean_text(value: str | None) -> str | None:
    """Treat a blank string as \"no restriction\" rather than as a filter value."""
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped or None


def resolve_side(params: ScenarioParams) -> Resolved:
    """Apply the documented defaults to one side of the request.

    An unpublished period is rejected (matching every other period-aware
    endpoint) instead of silently falling back, so a scenario can never describe
    a period the caller did not ask for.
    """
    period = _clean_text(params.period_code)
    period_code = period_service.require(period) if period else _default_period()

    strategy = _clean_text(params.benchmark_strategy) or DEFAULT_BENCHMARK_STRATEGY
    sim.validate_strategy(strategy)

    criterion = _clean_text(params.ranking_criterion) or sim.DEFAULT_RANKING_CRITERION
    sim.validate_criterion(criterion)

    threshold = (
        sim.DEFAULT_GAP_THRESHOLD_PCT
        if params.gap_threshold_pct is None
        else float(params.gap_threshold_pct)
    )

    district = _clean_text(params.district)
    # A district already implies its own province; combining them would silently
    # return nothing whenever the caller picked a district outside that province.
    province = None if district else _clean_text(params.province)

    return Resolved(
        period_code=period_code,
        benchmark_strategy=strategy,
        gap_threshold_pct=threshold,
        ranking_criterion=criterion,
        province=province,
        district=district,
    )


def _crop_exists(crop: str) -> bool:
    try:
        return not productivity_service.crop_trend(crop=crop).get("missing", True)
    except Exception:
        return False


def _selection(crop: str, side: Resolved) -> tuple[pd.DataFrame, dict]:
    """Every district the crop published for the side's period.

    Deliberately **not** filtered by the side's district group. The benchmark has
    to be measured over the whole published set for the crop, and the group is
    applied afterwards for display only - see ``analytics.scenario.build_view``.
    Filtering here would make the reference level move whenever the group changed.
    """
    result = productivity_service.panel_rows(
        period_code=side.period_code,
        crop=crop,
        geography_level="DISTRICT",
        # One row per district x crop, so this is a ceiling, not a truncation.
        limit=2000,
    )
    return pd.DataFrame(result["rows"]), result


def _gap_bands(districts: pd.DataFrame) -> list[ScenarioGapBand]:
    if districts.empty or "gap_index" not in districts.columns:
        return []
    return [
        ScenarioGapBand(**band)
        for band in analytics_service.gap_distribution(districts)
    ]


def build_side(crop: str, side: Resolved, basis: dict) -> tuple[ScenarioView, list[str]]:
    """Build one ranked view, plus the limitations this side specifically needs."""
    limitations: list[str] = []
    frame, source = _selection(crop, side)

    if frame.empty:
        reason = (
            f"{crop} has no published district rows for {basis['period_label']}"
            + (f" in {side.district}" if side.district else "")
            + (f" in {side.province} province" if side.province else "")
            + "; the crop was not tabulated for this selection, which is reported "
            "as no observations rather than as zero yield"
        )
        return (
            ScenarioView(
                period_code=basis["period_code"],
                period_label=basis["period_label"],
                crop=crop,
                benchmark_strategy=side.benchmark_strategy,
                gap_threshold_pct=side.gap_threshold_pct,
                ranking_criterion=side.ranking_criterion,
                ranking_criterion_label=basis["criterion_label"],
                ranking_criterion_unit=basis["criterion_unit"],
                ranking_criterion_note=basis["criterion_note"],
                province=side.province,
                district=side.district,
                missing=True,
                reason=reason,
                source_id=None,
            ),
            limitations,
        )

    districts = sim.district_frame(frame, side.benchmark_strategy)
    # Benchmark over every published district, then restrict for display.
    view = sim.build_view(
        frame,
        strategy=side.benchmark_strategy,
        gap_threshold_pct=side.gap_threshold_pct,
        ranking_criterion=side.ranking_criterion,
        province=side.province,
        district=side.district,
    )
    stats = view["stats"]
    selected = sim.apply_group(districts, province=side.province, district=side.district)

    # The crop is published for this period, but not for the requested group.
    # That is a different statement from "the crop has no data", so it gets its
    # own reason rather than reading as an absence of observations anywhere.
    if selected.empty:
        group = side.district or (f"{side.province} province" if side.province else "this group")
        return (
            ScenarioView(
                period_code=basis["period_code"],
                period_label=basis["period_label"],
                crop=crop,
                benchmark_strategy=side.benchmark_strategy,
                gap_threshold_pct=side.gap_threshold_pct,
                ranking_criterion=side.ranking_criterion,
                ranking_criterion_label=basis["criterion_label"],
                ranking_criterion_unit=basis["criterion_unit"],
                ranking_criterion_note=basis["criterion_note"],
                province=side.province,
                district=side.district,
                missing=True,
                reason=(
                    f"{crop} has no published district rows for {basis['period_label']} "
                    f"in {group}, so there is nothing to rank for this group; this is "
                    "reported as no observations rather than as zero yield"
                ),
                source_id=source.get("source_id") or None,
                # Display counts are zero because nothing is shown, but the
                # benchmark still covers the whole published set - reporting that
                # is what distinguishes "no rows in this group" from "no data".
                stats=ScenarioViewStats(**view["stats"]),
            ),
            limitations,
        )

    dropped = frame[frame["yield_kg_ha"].fillna(0) <= 0]
    if not dropped.empty:
        limitations.append(
            f"{len(dropped)} published district row(s) for {crop} in this period carry "
            "no positive yield (a blank or zero official cell) and are excluded from "
            "the benchmark and ranking; they are not treated as zero yield"
        )
    if side.province or side.district:
        limitations.append(
            "the benchmark is measured over every published district for the crop, so "
            "narrowing the district group changes which districts are shown but not the "
            "reference level they are measured against"
        )

    return (
        ScenarioView(
            period_code=basis["period_code"],
            period_label=basis["period_label"],
            crop=crop,
            benchmark_strategy=side.benchmark_strategy,
            gap_threshold_pct=side.gap_threshold_pct,
            ranking_criterion=side.ranking_criterion,
            ranking_criterion_label=basis["criterion_label"],
            ranking_criterion_unit=basis["criterion_unit"],
            ranking_criterion_note=basis["criterion_note"],
            province=side.province,
            district=side.district,
            missing=False,
            # Rows behind the districts actually shown; the benchmark covers more
            # (see stats.n_benchmark_districts).
            n_observations=int(len(selected)),
            source_id=source.get("source_id") or None,
            rows=[ScenarioDistrictRow(**row) for row in view["rows"]],
            gap_bands=_gap_bands(selected),
            stats=ScenarioViewStats(**stats),
        ),
        limitations,
    )


def model_scenario_availability(crop: str) -> ModelScenarioAvailability:
    """Whether Mode B (model-based) may be offered, from the real model registry.

    A model card only counts when it exists on disk *and* carries a validation
    metric for a yield target. With no such card the mode stays off and explains
    why, rather than offering controls that would imply an intervention effect
    the platform cannot support.
    """
    try:
        cards = meta_service.models()
    except Exception:
        cards = []

    yield_cards = [
        card
        for card in cards
        if card.get("status") == "available"
        and "yield" in str(card.get("target") or "").lower()
        and any(card.get(metric) is not None for metric in ("mae", "rmse", "r2"))
    ]

    if not yield_cards:
        return ModelScenarioAvailability(
            available=False,
            reason=(
                "No validated yield model is registered, so a model-based "
                "scenario cannot be offered. The analytical scenario above uses "
                "only published observations."
            ),
        )

    card = yield_cards[0]
    return ModelScenarioAvailability(
        available=True,
        reason="A validated yield model card is registered.",
        model_name=card.get("name"),
        model_version=card.get("version"),
        metrics={
            metric: card.get(metric) for metric in ("mae", "rmse", "r2") if card.get(metric) is not None
        },
    )


def run(payload: ScenarioRequest) -> ScenarioResponse:
    """Execute an analytical scenario and return both sides plus the movement."""
    crop = payload.crop.strip()
    if not _crop_exists(crop):
        raise UnknownCropError(UNKNOWN_CROP_MESSAGE.format(crop=crop))

    baseline_side = resolve_side(payload.baseline)
    scenario_side = resolve_side(payload.scenario)

    def basis(side: Resolved) -> dict:
        spec = sim.RANKING_CRITERIA[side.ranking_criterion]
        return {
            "period_code": side.period_code,
            "period_label": period_service.label(side.period_code),
            "criterion_label": spec["label"],
            "criterion_unit": spec.get("unit"),
            "criterion_note": spec.get("note"),
        }

    baseline_view, baseline_limits = build_side(crop, baseline_side, basis(baseline_side))
    scenario_view, scenario_limits = build_side(crop, scenario_side, basis(scenario_side))

    movement = sim.compare_views(
        [row.model_dump() for row in baseline_view.rows],
        [row.model_dump() for row in scenario_view.rows],
    )

    changes = [
        ScenarioChange(**change)
        for change in sim.summarise_changes(
            {**baseline_side.as_dict(), "crop": crop},
            {**scenario_side.as_dict(), "crop": crop},
        )
    ]

    limitations = [
        "an analytical scenario re-computes published observations under "
        "different assumptions; it is not a forecast and not an intervention model",
        "rank movement is relative position inside the selected district group - "
        "a district can move up because a peer fell",
        "observed associations in this data are not causal effects, so a scenario "
        "result must not be read as the outcome of changing any practice",
        "the benchmark strategy materially changes the reported gap, so a scenario "
        "that switches strategy is comparing two different questions",
    ]
    limitations.extend(baseline_limits)
    limitations.extend(limit for limit in scenario_limits if limit not in limitations)

    periods = period_service.period_codes()
    period_note = None
    if baseline_view.missing or scenario_view.missing:
        period_note = (
            "one side of this comparison has no published rows for the crop, so no "
            "district movement is reported for it"
        )
    if period_note and period_note not in limitations:
        limitations.append(period_note)

    return ScenarioResponse(
        crop=crop,
        baseline=baseline_view,
        scenario=scenario_view,
        changes=changes,
        ranking_movement=RankMovement(**movement),
        model_scenario=model_scenario_availability(crop),
        available_periods=periods,
        available_benchmark_strategies=list(STRATEGIES),
        available_ranking_criteria=[
            {
                "id": key,
                "label": spec["label"],
                "unit": spec.get("unit"),
                "note": spec.get("note"),
            }
            for key, spec in sim.RANKING_CRITERIA.items()
        ],
        provenance=Provenance(
            source_id=scenario_view.source_id or baseline_view.source_id,
            source_period=f"{baseline_side.period_code}-{scenario_side.period_code}",
            benchmark_strategy=scenario_side.benchmark_strategy,
            method=(
                "deterministic re-computation of the Productivity Gap Index and district "
                "ranking over published SAS district aggregates under two sets of "
                "reviewable assumptions; no value is modelled, imputed or forecast"
            ),
            limitations=limitations,
        ),
        limitations=limitations,
    )
