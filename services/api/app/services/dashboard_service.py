"""Dashboard overview service.

Returns only metrics the real data support. Derived aggregates (average yield,
totals, gap medians, adoption means) are all computed here so the frontend never
recomputes an official statistic.
"""

from __future__ import annotations

import pandas as pd

from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import meta_service
from app.services.analytics_service import FACTOR_COLUMNS, HIGH_GAP_PCT, gapped, period_of


def _period_key(f: AnalyticsFilters) -> str | None:
    if f.year and f.season:
        return f"{f.year}{f.season}"
    if f.year:
        return str(f.year)
    return None


def available_periods() -> list[str]:
    df = repo.training_dataset()
    if {"year", "season"}.issubset(df.columns):
        pairs = df[["year", "season"]].dropna().drop_duplicates().sort_values(["year", "season"])
        return [f"{int(y)}{s}" for y, s in pairs.itertuples(index=False)]
    return []


def overview(f: AnalyticsFilters) -> dict:
    df = apply_filters(repo.training_dataset(), f)
    g = gapped(df, f.benchmark_strategy)
    valid = g[g["yield_kg_ha"].fillna(0) > 0]
    period = period_of(g if not g.empty else df)

    factor_cols = [c for c in FACTOR_COLUMNS if c in valid.columns]
    adoption = float(valid[factor_cols].mean(axis=1).mean()) if factor_cols and not valid.empty else None

    gap_series = valid["gap_index"].dropna() if "gap_index" in valid else pd.Series(dtype=float)
    median_gap = float(gap_series.median()) if not gap_series.empty else None
    high_gap = int((gap_series >= HIGH_GAP_PCT).sum()) if not gap_series.empty else 0

    try:
        post = repo.postharvest_use()
        median_loss = float(post["post_harvest_losses_pct"].median())
    except Exception:
        median_loss = None

    try:
        cold = repo.cold_chain_context()
        storage_districts = int(cold["district"].nunique())
    except Exception:
        storage_districts = 0

    kpis = [
        {"id": "avg_yield", "label": "Average yield",
         "value": None if valid.empty else round(float(valid["yield_kg_ha"].mean()), 1),
         "unit": "kg/ha", "period": period, "source_id": "NISR_SAS_2025B_DISTRICT_CROP"},
        {"id": "median_gap", "label": "Median productivity gap",
         "value": None if median_gap is None else round(median_gap, 1),
         "unit": "%", "period": period, "source_id": "NISR_SAS_2025B_DISTRICT_CROP",
         "note": f"{f.benchmark_strategy} benchmark"},
        {"id": "high_gap", "label": "High productivity-gap observations",
         "value": high_gap, "unit": "district-crops", "period": period,
         "source_id": "NISR_SAS_2025B_DISTRICT_CROP",
         "note": f"gap index >= {HIGH_GAP_PCT:.0f}% below benchmark"},
        {"id": "crops", "label": "Crops analysed",
         "value": int(valid["canonical_crop_name"].nunique()) if not valid.empty else 0,
         "unit": "crops", "period": period, "source_id": "NISR_SAS_2025B_DISTRICT_CROP"},
        {"id": "districts", "label": "Districts covered",
         "value": int(valid["district"].nunique()) if not valid.empty else 0,
         "unit": "districts", "period": period, "source_id": "NISR_SAS_2025B_DISTRICT_CROP"},
        {"id": "input_adoption", "label": "Average input adoption",
         "value": None if adoption is None else round(adoption, 1),
         "unit": "% of farmers", "period": period, "source_id": "NISR_SAS_2025B_DISTRICT_FACTORS"},
        {"id": "postharvest_loss", "label": "Median post-harvest loss share",
         "value": None if median_loss is None else round(median_loss, 2),
         "unit": "% of production", "period": "2025-B",
         "source_id": "NISR_SAS_2025B_POSTHARVEST_USE",
         "note": "national crop-level values"},
        {"id": "total_production", "label": "Total production in selection",
         "value": None if valid.empty else round(float(valid["production_mt"].sum()), 1),
         "unit": "metric tonnes", "period": period, "source_id": "NISR_SAS_2025B_DISTRICT_CROP"},
        {"id": "storage_districts", "label": "Cold-chain program districts",
         "value": storage_districts, "unit": "districts", "period": "2026",
         "source_id": "MINAGRI_ACES_COLDCHAIN_2026",
         "note": "capacity not verified"},
    ]

    coverage = meta_service.coverage()
    key = _period_key(f)
    cov_map = coverage["coverage"].get("district_crop_productivity", {})
    selected_level = cov_map.get(key) if key else None
    if key is None and cov_map:
        # default period = latest district-covered period
        selected_level = "district" if "district" in cov_map.values() else None

    return {
        "filters": {
            "year": f.year, "season": f.season, "crop": f.crop,
            "province": f.province, "district": f.district,
            "benchmark_strategy": f.benchmark_strategy,
        },
        "period": period,
        "available_periods": available_periods(),
        "coverage": cov_map,
        "coverage_level": selected_level,
        "n_observations": int(len(valid)),
        "kpis": kpis,
        "provenance": {
            "source_id": "NISR_SAS_2025B_DISTRICT_CROP",
            "source_period": period,
            "benchmark_strategy": f.benchmark_strategy,
            "method": "aggregation of processed district x crop table; PGI = 100*(benchmark-observed)/benchmark",
            "limitations": [
                "observational district aggregates, not plot-level evidence",
                "associations are not causation",
                "district data only exist for 2025 Season B",
            ],
        },
    }

