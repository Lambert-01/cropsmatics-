"""Productivity Gap Index with configurable benchmarks.

    PGI = 100 * (benchmark_yield - observed_yield) / benchmark_yield

Benchmark strategies are configurable and the chosen one is always reported so
results are reproducible and open to review. Implemented with the standard
library only (no pandas/sklearn) so it is trivially unit-testable.

Strategies:
    national_crop_median              median yield per crop
    national_crop_season_median       median yield per (crop, season)
    top_quartile_comparable_districts mean of the top quartile per (crop, season)
    multi_year_crop_baseline          mean of prior-season yields per crop
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from statistics import mean, median

STRATEGIES = (
    "national_crop_median",
    "national_crop_season_median",
    "top_quartile_comparable_districts",
    "multi_year_crop_baseline",
)


def productivity_gap(observed: float | None, benchmark: float | None) -> float | None:
    """Single-observation PGI. Returns ``None`` when undefined."""
    if observed is None or benchmark is None or benchmark <= 0:
        return None
    return 100.0 * (benchmark - observed) / benchmark


def _quartile(values: Sequence[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("empty sequence")
    pos = (len(ordered) - 1) * q
    lo, hi = int(pos), min(int(pos) + 1, len(ordered) - 1)
    frac = pos - lo
    return ordered[lo] * (1 - frac) + ordered[hi] * frac


def _group(rows: Iterable[Mapping], keys: tuple[str, ...]) -> dict:
    groups: dict = defaultdict(list)
    for row in rows:
        y = row.get("yield_kg_ha")
        if y is None or y <= 0:
            continue
        groups[tuple(row.get(k) for k in keys)].append(float(y))
    return groups


def benchmark_yield(
    target: Mapping,
    rows: Iterable[Mapping],
    strategy: str = "national_crop_season_median",
) -> float | None:
    """Benchmark yield for one target observation under the given strategy."""
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown benchmark strategy: {strategy!r}; expected one of {STRATEGIES}")

    rows = list(rows)
    crop = target.get("canonical_crop_name") or target.get("crop")

    if strategy in ("national_crop_median",):
        groups = _group(rows, ("canonical_crop_name",))
        vals = groups.get((crop,))
        return median(vals) if vals else None

    if strategy == "national_crop_season_median":
        groups = _group(rows, ("canonical_crop_name", "season"))
        vals = groups.get((crop, target.get("season")))
        return median(vals) if vals else None

    if strategy == "top_quartile_comparable_districts":
        groups = _group(rows, ("canonical_crop_name", "season"))
        vals = groups.get((crop, target.get("season")))
        if not vals:
            return None
        cut = _quartile(vals, 0.75)
        top = [v for v in vals if v >= cut]
        return mean(top) if top else None

    # multi_year_crop_baseline: mean of years strictly before the target year.
    ty = target.get("year")
    prior = [
        float(r["yield_kg_ha"]) for r in rows
        if (r.get("canonical_crop_name") or r.get("crop")) == crop
        and r.get("yield_kg_ha")
        and r["yield_kg_ha"] > 0
        and ty is not None
        and r.get("year") is not None
        and r["year"] < ty
    ]
    return mean(prior) if prior else None


def compute_gaps(rows: Sequence[Mapping], strategy: str = "national_crop_season_median") -> list[dict]:
    """Return new row dicts annotated with benchmark + gap_index."""
    out = []
    for row in rows:
        b = benchmark_yield(row, rows, strategy)
        out.append({**row, "benchmark_yield_kg_ha": b,
                    "gap_index": productivity_gap(row.get("yield_kg_ha"), b),
                    "benchmark_strategy": strategy})
    return out
