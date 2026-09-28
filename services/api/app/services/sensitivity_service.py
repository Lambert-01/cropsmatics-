"""Sensitivity service: how stable the priority ranking is to the weights.

Reads the same district x crop candidates the planner uses, re-ranks them under a
reproducible sweep of plausible weightings, and reports per-district robustness.

Because the candidates carry raw components, the sweep normalizes them once per
draw exactly as the baseline does - so a district's baseline rank here is the same
rank the planner shows for the same weights.
"""

from __future__ import annotations

from app.analytics import sensitivity
from app.analytics import intervention_priority as ip
from app.schemas.filters import AnalyticsFilters
from app.services import analytics_service

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


def analyse(
    f: AnalyticsFilters | None = None,
    *,
    weights: dict | None = None,
    n_random: int = sensitivity.DEFAULT_DRAWS,
    seed: int = sensitivity.DEFAULT_SEED,
    top_n: int = 10,
    include_presets: bool = True,
) -> dict:
    """Run the sweep over the selected candidate set."""
    candidates = analytics_service.priority_candidates(f)
    baseline = analytics_service.normalise_weights(weights)

    sweep = sensitivity.weight_draws(
        n_random=n_random, seed=seed, include_presets=include_presets
    )

    if not candidates:
        return {
            "districts_analysed": 0,
            "n_scenarios_tested": sweep.total,
            "top_n": top_n,
            "weights": baseline,
            "presets_included": sweep.presets_included,
            "seed": seed,
            "rows": [],
            "robust_count": 0,
            "presets": sensitivity.PRESETS,
            "weights_used": {**ip.DEFAULT_WEIGHTS, **baseline},
            "proxy_notes": analytics_service.PROXY_NOTES,
            "disclaimer": sensitivity.DISCLAIMER,
            "limitations": LIMITATIONS,
        }

    result = sensitivity.analyse(
        candidates, weights=weights, sweep=sweep, top_n=top_n
    )
    result["presets"] = sensitivity.PRESETS
    result["proxy_notes"] = analytics_service.PROXY_NOTES
    result["limitations"] = LIMITATIONS
    return result
