"""Sensitivity service: how stable the priority ranking is to the weights.

Reads the same district x crop candidates the planner uses, re-ranks them under a
reproducible sweep of plausible weightings, and reports per-candidate robustness.

Because the candidates carry raw components, the sweep normalizes them once per
draw exactly as the baseline does - so a candidate's baseline rank here is the same
rank the planner shows for the same weights.
"""

from __future__ import annotations

from dataclasses import replace as dc_replace

from app.analytics import intervention_priority as ip
from app.analytics import sensitivity
from app.schemas.common import Provenance
from app.schemas.filters import AnalyticsFilters
from app.schemas.sensitivity import SensitivityRequest, SensitivityResponse
from app.services import analytics_service, period_service

LIMITATIONS = [
    "a robustness share is the fraction of TESTED weightings in which a candidate "
    "appears in the top group; it is not a probability and not a confidence level",
    "only the weighting choice varies; the underlying observations, the proxies and "
    "the benchmark are held fixed, so this does not express uncertainty in the data",
    "the readiness and cost components are documented proxies, so a ranking that is "
    "stable here can still be unstable if a proxy is replaced",
    "stability is not correctness: a candidate that stays top-ranked under every "
    "weighting is still only a candidate for field investigation",
]


def _filters(payload: SensitivityRequest) -> AnalyticsFilters:
    """Selection for the sweep.

    An unpublished period is rejected rather than silently ignored, matching every
    other period-aware endpoint. With no period the latest published district
    release is used so the response can name the release it tested.
    """
    period = (payload.period_code or "").strip() or None
    if period:
        period_code = period_service.require(period)
    else:
        period_code = (
            period_service.latest_district() or period_service.latest() or None
        )
    return AnalyticsFilters(
        period_code=period_code,
        crop=(payload.crop or "").strip() or None,
        province=(payload.province or "").strip() or None,
        district=(payload.district or "").strip() or None,
        benchmark_strategy=payload.benchmark_strategy or "national_crop_median",
    )


def analyse(
    f: AnalyticsFilters | None = None,
    *,
    weights: dict | None = None,
    n_random: int = sensitivity.DEFAULT_DRAWS,
    seed: int = sensitivity.DEFAULT_SEED,
    top_n: int = 10,
    include_presets: bool = True,
    purpose: str = ip.DEFAULT_PURPOSE,
    threshold_pct: float = 0.0,
) -> dict:
    """Run the sweep over the selected candidate set and return the raw result.

    The sweep uses the same adjusted weights as the planner: when readiness or
    cost components are unavailable for the selected period their weights are
    redistributed - in the baseline *and in every tested draw* - so the sweep
    never tests a weighting that would score a neutral constant as if it were
    measured data, and it never tests a weighting the planner could not apply.
    """
    # The same eligibility rule as the ranking endpoint, from the same function:
    # a sweep can only test weightings over candidates that are actually eligible
    # for the purpose, so a robustness share never counts an above-benchmark
    # district as "stable in the shortlist".
    candidates, _source, unavailable, population = analytics_service.priority_candidates_with_source(
        f, purpose=purpose, threshold_pct=threshold_pct
    )
    effective_weights = analytics_service.adjusted_weights(weights, unavailable, purpose=purpose)
    baseline = analytics_service.normalise_weights(effective_weights)

    sweep = sensitivity.weight_draws(
        n_random=n_random, seed=seed, include_presets=include_presets
    )
    if unavailable:
        sweep = dc_replace(
            sweep,
            draws=[
                analytics_service.adjusted_weights(draw, unavailable, purpose=purpose)
                for draw in sweep.draws
            ],
        )
    # The reported presets are the ones that were actually tested, so a client
    # cannot offer a starting point the engine would silently change.
    presets = {
        key: analytics_service.adjusted_weights(preset, unavailable, purpose=purpose)
        for key, preset in sensitivity.PRESETS.items()
    }

    # Build period-aware proxy notes from the actual frame so the notes match the data.
    df_for_notes = analytics_service.candidate_frame(f)
    proxy_notes = analytics_service.proxy_notes_for(df_for_notes)
    availability = analytics_service.component_availability(df_for_notes)

    if not candidates:
        return {
            "districts_analysed": 0,
            "n_scenarios_tested": sweep.total,
            "n_random_draws": sweep.n_random,
            "top_n": top_n,
            "weights": baseline,
            "presets_included": sweep.presets_included,
            "seed": seed,
            "rows": [],
            "robust_count": 0,
            "presets": presets,
            "proxy_notes": proxy_notes,
            "components_unavailable": unavailable,
            "component_availability": availability,
            "disclaimer": sensitivity.DISCLAIMER,
            "limitations": LIMITATIONS,
        }

    result = sensitivity.analyse(
        candidates,
        weights=effective_weights,
        sweep=sweep,
        top_n=top_n,
        purpose=purpose,
    )
    if f is not None and f.district:
        result["rows"] = [
            row for row in result["rows"] if row["district"].casefold() == f.district.casefold()
        ]
        result["districts_analysed"] = len(result["rows"])
        result["robust_count"] = sum(row["robust"] for row in result["rows"])
    result["presets"] = presets
    result["proxy_notes"] = proxy_notes
    result["components_unavailable"] = unavailable
    result["component_availability"] = availability
    result["limitations"] = LIMITATIONS
    result["purpose"] = purpose
    result["purpose_label"] = ip.PURPOSE_LABELS.get(purpose, purpose)
    result["purpose_note"] = ip.PURPOSE_NOTES.get(purpose)
    result["methodology_version"] = ip.METHODOLOGY_VERSION
    result["n_eligible"] = population.n_reference
    result["n_ineligible"] = len(population.ineligible)
    return result


def run(payload: SensitivityRequest) -> SensitivityResponse:
    """Execute the sweep and return it as a fully-described response."""
    f = _filters(payload)
    result = analyse(
        f,
        weights=payload.weights.to_engine() if "weights" in payload.model_fields_set else None,
        n_random=payload.n_random,
        seed=payload.seed,
        top_n=payload.top_n,
        include_presets=payload.include_presets,
        purpose=payload.purpose,
        threshold_pct=payload.threshold_pct,
    )

    limitations = list(result["limitations"])
    if not result["rows"]:
        limitations.insert(
            0,
            "no candidate is published for this selection, so there is nothing to "
            "test; this is reported as no candidates rather than as a stable ranking",
        )
    if result.get("components_unavailable"):
        excluded = ", ".join(result["components_unavailable"])
        limitations.insert(
            0,
            "for this period the following priority components carry no measured "
            f"data and were excluded from every tested weighting: {excluded}. Their "
            "weight was redistributed over the components that do have data; no "
            "neutral constant was scored in their place.",
        )
    # Keep the response and its provenance telling the same story.
    result["limitations"] = limitations

    return SensitivityResponse(
        **result,
        weight_labels=sensitivity.WEIGHT_LABELS,
        preset_labels=sensitivity.PRESET_LABELS,
        provenance=Provenance(
            source_id=f"NISR_SAS_{f.period_code}" if f.period_code else None,
            source_period=f.period_code,
            benchmark_strategy=f.benchmark_strategy,
            method=(
                "deterministic re-ranking of the published district x crop candidates "
                f"under {result['n_scenarios_tested']} tested weightings "
                f"({result['n_random_draws']} simplex draws, seed {payload.seed}, plus "
                "named planning presets); only the weighting choice varies, so the "
                "reported share measures ranking robustness, not data uncertainty"
            ),
            limitations=limitations,
        ),
    )

