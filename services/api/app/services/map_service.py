"""District-level map metric service.

Aggregates the filtered analytical frame to one value per district for the
selected choropleth metric, and returns the extra fields the map tooltip needs
(yield, benchmark, gap, input adoption, priority band, period). A district with
no valid observation is returned with ``value = None`` so the map can render it
as "no verified data" instead of a fabricated zero.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services.analytics_service import (
    FACTOR_COLUMNS,
    gapped,
    period_of,
    priority_frame,
)

METRICS = {
    "yield": ("Yield", "kg/ha"),
    "gap": ("Productivity gap", "%"),
    "priority": ("Intervention priority", "score (0-1)"),
    "input_adoption": ("Input adoption", "% of farmers"),
    "irrigation": ("Irrigation adoption", "% of farmers"),
    "erosion": ("Erosion protection", "% of farmers"),
}


def _empty(metric: str, f: AnalyticsFilters) -> dict:
    label, unit = METRICS.get(metric, (metric, None))
    return {
        "metric": metric, "metric_label": label, "unit": unit,
        "period": None, "crop": f.crop, "min_value": None, "max_value": None,
        "districts": [],
    }


def district_metrics(
    f: AnalyticsFilters, metric: str = "gap", weights: dict | None = None
) -> dict:
    if metric not in METRICS:
        raise ValueError(f"unknown metric {metric!r}; expected one of {list(METRICS)}")

    df = apply_filters(repo.training_dataset(), f)
    g = gapped(df, f.benchmark_strategy)
    if g.empty:
        return _empty(metric, f)

    # Priority score needs the full component frame (normalized across districts).
    prio = priority_frame(df, f.benchmark_strategy, weights=weights)
    prio_by_district = (
        prio.groupby("district")["priority_score"].mean().to_dict() if not prio.empty else {}
    )
    band_by_district = (
        prio.groupby("district")["priority_band"].agg(
            lambda s: s.mode().iloc[0] if not s.mode().empty else None
        ).to_dict()
        if not prio.empty else {}
    )

    factors = [c for c in FACTOR_COLUMNS if c in g.columns]
    if factors:
        g["_input_adoption"] = g[factors].mean(axis=1)

    period = period_of(g)

    rows = []
    for district, grp in g.groupby("district", dropna=False):
        yield_med = float(grp["yield_kg_ha"].median()) if grp["yield_kg_ha"].notna().any() else None
        bench_med = float(grp["benchmark_yield_kg_ha"].median()) if grp["benchmark_yield_kg_ha"].notna().any() else None
        gap_med = float(grp["gap_index"].median()) if grp["gap_index"].notna().any() else None
        adoption = float(grp["_input_adoption"].mean()) if "_input_adoption" in grp and grp["_input_adoption"].notna().any() else None
        irrigation = _first(grp, "irrigation_farmers_pct")
        erosion = _first(grp, "erosion_protection_farmers_pct")
        priority = prio_by_district.get(district)

        value = {
            "yield": yield_med,
            "gap": gap_med,
            "priority": priority,
            "input_adoption": adoption,
            "irrigation": irrigation,
            "erosion": erosion,
        }[metric]

        rows.append({
            "district": str(district),
            "district_code": _first(grp, "district_code"),
            "province": _first(grp, "province"),
            "agro_ecological_zone": _first(grp, "agro_ecological_zone"),
            "value": None if value is None or (isinstance(value, float) and np.isnan(value)) else round(float(value), 3),
            "n_observations": int(grp["yield_kg_ha"].notna().sum()),
            "details": {
                "yield_kg_ha": _round(yield_med),
                "benchmark_yield_kg_ha": _round(bench_med),
                "gap_index": _round(gap_med),
                "input_adoption_pct": _round(adoption),
                "priority_band": band_by_district.get(district),
                "priority_score": _round(priority),
                "period": period,
            },
        })

    values = [r["value"] for r in rows if r["value"] is not None]
    label, unit = METRICS[metric]
    return {
        "metric": metric,
        "metric_label": label,
        "unit": unit,
        "period": period,
        "crop": f.crop,
        "min_value": min(values) if values else None,
        "max_value": max(values) if values else None,
        "districts": rows,
    }


def _first(grp: pd.DataFrame, column: str):
    if column not in grp.columns:
        return None
    series = grp[column].dropna()
    if series.empty:
        return None
    val = series.iloc[0]
    return str(val) if isinstance(val, str) else (None if pd.isna(val) else val)


def _round(value: float | None) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(f) else round(f, 3)
