"""Productivity Gap Index (PGI) with configurable benchmarks.

    PGI = 100 * (benchmark_yield - observed_yield) / benchmark_yield

A higher PGI means the observed yield is further below its benchmark. No single
benchmark strategy is hardcoded: callers choose one and the chosen strategy is
returned so results stay reviewable. See docs/10_ML_METHODOLOGY.md.
"""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd

STRATEGIES = (
    "national_crop_median",
    "national_crop_season_median",
    "top_quartile_comparable_districts",
    "agro_ecological_peer_group",
)

_YIELD = "yield_kg_ha"
_CROP = "canonical_crop_name"
_SEASON = "season"
_ZONE = "agro_ecological_zone"


def benchmark_series(df: pd.DataFrame, strategy: str) -> pd.Series:
    """Return a per-row benchmark yield for the given strategy."""
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown benchmark strategy: {strategy!r}; expected one of {STRATEGIES}")

    valid = df[_YIELD].where(df[_YIELD] > 0)

    if strategy == "national_crop_median":
        return valid.groupby(df[_CROP]).transform("median")

    if strategy == "national_crop_season_median":
        return valid.groupby([df[_CROP], df[_SEASON]]).transform("median")

    if strategy == "top_quartile_comparable_districts":
        grouped = valid.groupby([df[_CROP], df[_SEASON]])
        threshold = grouped.transform(lambda s: s.quantile(0.75))
        top = valid.where(valid >= threshold)
        return top.groupby([df[_CROP], df[_SEASON]]).transform("median")

    # agro_ecological_peer_group
    zone = df[_ZONE] if _ZONE in df.columns else pd.Series("ALL", index=df.index)
    return valid.groupby([df[_CROP], df[_SEASON], zone]).transform("median")


def productivity_gap(observed: float | None, benchmark: float | None) -> float | None:
    """Single-observation PGI. Returns ``None`` when undefined."""
    if benchmark is None or benchmark <= 0 or observed is None:
        return None
    return 100.0 * (benchmark - observed) / benchmark


def compute_gaps(df: pd.DataFrame, strategy: str = "national_crop_median") -> pd.DataFrame:
    """Attach ``benchmark_yield_kg_ha``, ``gap_index`` and ``benchmark_strategy``."""
    out = df.copy()
    benchmark = benchmark_series(out, strategy)
    out["benchmark_yield_kg_ha"] = benchmark
    out["gap_index"] = [
        productivity_gap(o, b)
        for o, b in zip(out[_YIELD].tolist(), benchmark.tolist(), strict=True)
    ]
    out["benchmark_strategy"] = strategy
    return out


def top_gaps(df: pd.DataFrame, n: int = 20, crops: Sequence[str] | None = None) -> pd.DataFrame:
    """Largest positive gaps, one row per district x crop, for planner review."""
    gapped = compute_gaps(df)
    if crops:
        gapped = gapped[gapped[_CROP].isin(crops)]
    gapped = gapped[gapped["gap_index"].notna() & (gapped[_YIELD] > 0)]
    return gapped.sort_values("gap_index", ascending=False).head(n)
