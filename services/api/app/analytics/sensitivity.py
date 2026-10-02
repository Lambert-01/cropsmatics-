"""Ranking robustness across weighting assumptions.

A priority ranking built on weights is only as trustworthy as its sensitivity to
those weights. This module answers the question a planner actually has: *if we
had chosen different but equally defensible weights, would this district still be
a priority?*

Two things this is **not**:

* it is not a probability. The draws are a designed sweep over plausible
  planning assumptions, not a random sample from a real-world distribution, so an
  inclusion share is a **robustness share** and is labelled as one everywhere it
  is reported;
* it is not an uncertainty estimate for the underlying agricultural data. It
  measures sensitivity to the weighting choice only, and says so.

It is fully deterministic: the same seed and the same candidate set produce the
same numbers, so a result can be reproduced and reviewed.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from app.analytics import intervention_priority as ip

WEIGHT_KEYS: tuple[str, ...] = ("wg", "wv", "wf", "wr", "wc")

WEIGHT_LABELS: dict[str, str] = {
    "wg": "Productivity gap",
    "wv": "Vulnerability / exposure",
    "wf": "Affected scale",
    "wr": "Readiness",
    "wc": "Cost constraint",
}

#: Named assumption sets. Every sweep includes these, so the tested set always
#: contains the planners' own defensible positions and not only random points.
PRESETS: dict[str, dict[str, float]] = {
    "balanced": dict(ip.DEFAULT_WEIGHTS),
    "productivity_gap_focused": {"wg": 0.50, "wv": 0.15, "wf": 0.15, "wr": 0.15, "wc": 0.05},
    "affected_area_focused": {"wg": 0.20, "wv": 0.20, "wf": 0.45, "wr": 0.10, "wc": 0.05},
    "readiness_focused": {"wg": 0.20, "wv": 0.15, "wf": 0.15, "wr": 0.45, "wc": 0.05},
    "vulnerability_focused": {"wg": 0.20, "wv": 0.45, "wf": 0.15, "wr": 0.15, "wc": 0.05},
}

#: Display names for the presets, so a client never has to humanise a key.
PRESET_LABELS: dict[str, str] = {
    "balanced": "Balanced (platform default)",
    "productivity_gap_focused": "Productivity gap focused",
    "affected_area_focused": "Affected area focused",
    "readiness_focused": "Readiness focused",
    "vulnerability_focused": "Vulnerability focused",
}

DEFAULT_SEED = 42
DEFAULT_DRAWS = 200
MAX_DRAWS = 2000

DISCLAIMER = (
    "Ranking robustness across the tested planning assumptions, NOT a probability. "
    "The weights are a designed sweep, not a sample from a real-world distribution."
)


class SensitivityError(ValueError):
    """Raised for a sensitivity request that cannot be honoured."""


@dataclass(frozen=True)
class Sweep:
    """The set of weighting assumptions a ranking was tested against."""

    draws: list[dict] = field(default_factory=list)
    seed: int = DEFAULT_SEED
    n_random: int = 0
    presets_included: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.draws)


def normalize_weights(weights: dict | None) -> dict[str, float]:
    """Force a weighting onto the simplex: non-negative and summing to 1."""
    merged = {key: float((weights or {}).get(key, ip.DEFAULT_WEIGHTS[key])) for key in WEIGHT_KEYS}
    merged = {key: max(0.0, value) for key, value in merged.items()}
    total = sum(merged.values())
    if total <= 0:
        raise SensitivityError("weights must not all be zero")
    return {key: value / total for key, value in merged.items()}


def weight_draws(
    *, n_random: int = DEFAULT_DRAWS, seed: int = DEFAULT_SEED, include_presets: bool = True
) -> Sweep:
    """A reproducible sweep of plausible weightings.

    Random points are drawn uniformly on the simplex (a flat Dirichlet), which is
    the neutral choice when no prior over planning objectives exists. Presets are
    always appended so the sweep cannot miss the standard planning positions.
    """
    if n_random < 0 or n_random > MAX_DRAWS:
        raise SensitivityError(f"n_random must be between 0 and {MAX_DRAWS}")
    if n_random == 0 and not include_presets:
        # A sweep that tests no weighting at all cannot report a robustness share;
        # an all-zero table would read as "nothing is stable" instead of "nothing
        # was tested". Refuse rather than return a misleading zero.
        raise SensitivityError(
            "a sweep must test at least one weighting: set n_random or include_presets"
        )

    rng = random.Random(seed)
    draws: list[dict] = []

    if include_presets:
        draws.extend(dict(values) for values in PRESETS.values())

    for _ in range(n_random):
        raw = [rng.expovariate(1.0) for _ in WEIGHT_KEYS]
        total = sum(raw) or 1.0
        draws.append({key: value / total for key, value in zip(WEIGHT_KEYS, raw, strict=True)})

    return Sweep(
        draws=draws,
        seed=seed,
        n_random=n_random,
        presets_included=list(PRESETS) if include_presets else [],
    )


@dataclass
class DistrictStability:
    """How one district's position behaves across the sweep."""

    id: str
    district: str
    crop: str
    baseline_rank: int
    baseline_band: str
    baseline_score: float
    top_n_inclusions: int
    top_n_share_pct: float
    band_counts: dict[str, int]
    band_shares_pct: dict[str, float]
    dominant_band: str
    band_stability_pct: float
    best_rank: int
    median_rank: float
    worst_rank: int
    rank_range: int

    @property
    def robust(self) -> bool:
        """Stays in the top-N under most tested assumptions."""
        return self.top_n_share_pct >= 75.0


def _median(values: list[int]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return float(ordered[middle])
    return (ordered[middle - 1] + ordered[middle]) / 2.0


def analyse(
    candidates: list[dict],
    *,
    weights: dict | None = None,
    sweep: Sweep | None = None,
    top_n: int = 10,
) -> dict:
    """Re-rank the candidates under every weighting in the sweep.

    Returns per-district robustness shares plus the method used, so a reader can
    see exactly what was varied and what was held fixed.
    """
    if not candidates:
        return {
            "districts_analysed": 0,
            "n_scenarios_tested": 0,
            "top_n": top_n,
            "weights": normalize_weights(weights),
            "rows": [],
            "disclaimer": DISCLAIMER,
        }

    baseline_weights = normalize_weights(weights)
    sweep = sweep or weight_draws()

    baseline = ip.rank(candidates, weights=baseline_weights)
    baseline_rank = {row["id"]: index + 1 for index, row in enumerate(baseline)}
    baseline_band = {row["id"]: row["band"] for row in baseline}
    baseline_score = {row["id"]: row["score"] for row in baseline}
    meta = {row["id"]: row for row in baseline}

    rank_history: dict[str, list[int]] = {row["id"]: [] for row in baseline}
    band_history: dict[str, dict[str, int]] = {row["id"]: {} for row in baseline}
    top_n_hits: dict[str, int] = {row["id"]: 0 for row in baseline}

    for draw in sweep.draws:
        ranked = ip.rank(candidates, weights=draw)
        for index, row in enumerate(ranked):
            identifier = row["id"]
            if identifier not in rank_history:
                continue
            rank = index + 1
            rank_history[identifier].append(rank)
            if rank <= top_n:
                top_n_hits[identifier] += 1
            counts = band_history[identifier]
            counts[row["band"]] = counts.get(row["band"], 0) + 1

    total = max(sweep.total, 1)
    rows: list[dict] = []
    for identifier, ranks in rank_history.items():
        counts = band_history[identifier]
        dominant_band = max(counts, key=lambda band: counts[band]) if counts else baseline_band[identifier]
        rows.append(
            {
                "id": identifier,
                "district": meta[identifier]["district"],
                "crop": meta[identifier]["crop"],
                "baseline_rank": baseline_rank[identifier],
                "baseline_band": baseline_band[identifier],
                "baseline_score": baseline_score[identifier],
                "top_n_inclusions": top_n_hits[identifier],
                "top_n_share_pct": round(100.0 * top_n_hits[identifier] / total, 1),
                "band_counts": counts,
                "band_shares_pct": {
                    band: round(100.0 * count / total, 1) for band, count in counts.items()
                },
                "dominant_band": dominant_band,
                "band_stability_pct": round(100.0 * counts.get(dominant_band, 0) / total, 1),
                "best_rank": min(ranks) if ranks else baseline_rank[identifier],
                "median_rank": _median(ranks),
                "worst_rank": max(ranks) if ranks else baseline_rank[identifier],
                "rank_range": (max(ranks) - min(ranks)) if ranks else 0,
                "robust": (100.0 * top_n_hits[identifier] / total) >= 75.0,
            }
        )

    rows.sort(key=lambda row: row["baseline_rank"])

    return {
        "districts_analysed": len(rows),
        "n_scenarios_tested": sweep.total,
        "n_random_draws": sweep.n_random,
        "presets_included": sweep.presets_included,
        "seed": sweep.seed,
        "top_n": top_n,
        "weights": baseline_weights,
        "rows": rows,
        "robust_count": sum(1 for row in rows if row["robust"]),
        "disclaimer": DISCLAIMER,
    }
