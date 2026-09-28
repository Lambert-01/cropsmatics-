"""Sensitivity service: how stable the priority ranking is to the weights.

Reads the same district x crop candidates the planner uses, re-ranks them under a
reproducible sweep of plausible weightings, and reports per-candidate robustness.

Because the candidates carry raw components, the sweep normalizes them once per
draw exactly as the baseline does - so a candidate's baseline rank here is the same
rank the planner shows for the same weights.
"""

from __future__ import annotations

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
) -> dict:
    """Run the sweep over the selected candidate set and return the raw result."""
    candidates = analytics_service.priority_candidates(f)
    baseline = analytics_service.normalise_weights(weights)

    sweep = sensitivity.weight_draws(
        n_random=n_random, seed=seed, include_presets=include_presets
    )

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
            "presets": sensitivity.PRESETS,
            "proxy_notes": analytics_service.PROXY_NOTES,
            "disclaimer": sensitivity.DISCLAIMER,
            "limitations": LIMITATIONS,
        }

    result = sensitivity.analyse(candidates, weights=weights, sweep=sweep, top_n=top_n)
    result["presets"] = sensitivity.PRESETS
    result["proxy_notes"] = analytics_service.PROXY_NOTES
    result["limitations"] = LIMITATIONS
    return result


def run(payload: SensitivityRequest) -> SensitivityResponse:
    """Execute the sweep and return it as a fully-described response."""
    f = _filters(payload)
    result = analyse(
        f,
        weights=payload.weights.to_engine(),
        n_random=payload.n_random,
        seed=payload.seed,
        top_n=payload.top_n,
        include_presets=payload.include_presets,
    )

    limitations = list(result["limitations"])
    if not result["rows"]:
        limitations.insert(
            0,
            "no candidate is published for this selection, so there is nothing to "
            "test; this is reported as no candidates rather than as a stable ranking",
        )

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

