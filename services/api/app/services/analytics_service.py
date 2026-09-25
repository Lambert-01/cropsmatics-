"""Analytics service: turns processed tables into API-ready results.

All Pandas computation lives here (never in routers). Every result carries the
benchmark strategy, the period and the provenance so the numbers stay reviewable.
Gap semantics follow ``app.analytics.productivity_gap`` (higher = further below
benchmark). Associations are never presented as causal effects.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.analytics import intervention_priority as ip
from app.analytics.productivity_gap import STRATEGIES, compute_gaps
from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters

# MVP proxies for priority components that official 2025B tables do not carry.
# Documented so the weighting is never a black box (docs/11_INTERVENTION_ENGINE.md).
_PERISHABILITY = {"high": 1.0, "medium": 0.5, "low": 0.2}

HIGH_GAP_PCT = 25.0  # |gap_index| at/above this is flagged "high gap" in the UI

FACTOR_COLUMNS = [
    "improved_seed_farmers_pct",
    "organic_fertilizer_farmers_pct",
    "inorganic_fertilizer_farmers_pct",
    "pesticide_farmers_pct",
    "erosion_protection_farmers_pct",
    "mechanization_farmers_pct",
    "irrigation_farmers_pct",
    "agroforestry_farmers_pct",
]

FACTOR_LABELS = {
    "improved_seed_farmers_pct": "Improved seed use",
    "organic_fertilizer_farmers_pct": "Organic fertilizer use",
    "inorganic_fertilizer_farmers_pct": "Inorganic fertilizer use",
    "pesticide_farmers_pct": "Pesticide use",
    "erosion_protection_farmers_pct": "Erosion protection",
    "mechanization_farmers_pct": "Mechanization",
    "irrigation_farmers_pct": "Irrigation",
    "agroforestry_farmers_pct": "Agroforestry",
    "agricultural_land_000ha": "Agricultural land area",
}

PROXY_NOTES = [
    "vulnerability uses crop perishability as a proxy (no verified post-harvest loss join per district yet)",
    "readiness uses erosion-protection adoption as a proxy for existing practice uptake",
    "cost constraint uses agricultural-land share as an inverse cost proxy",
    "affected scale uses harvested area as a proxy for the number of farmers exposed",
]


def records(df: pd.DataFrame, columns: list[str] | None = None) -> list[dict]:
    """Convert a frame to JSON-safe records (NaN/NaT -> None)."""
    if columns:
        df = df[[c for c in columns if c in df.columns]]
    return df.replace({np.nan: None}).to_dict(orient="records")


def valid_yield(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["yield_kg_ha"].fillna(0) > 0].copy()


def _factor_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in FACTOR_COLUMNS if c in df.columns]


def period_of(df: pd.DataFrame) -> str | None:
    if df.empty or "year" not in df.columns or "season" not in df.columns:
        return None
    years = sorted(df["year"].dropna().unique())
    seasons = sorted({str(s) for s in df["season"].dropna().unique()})
    if not years:
        return None
    if len(years) == 1 and seasons:
        return f"{years[0]}-{'-'.join(seasons)}"
    return ", ".join(f"{y}-{s}" for y in years for s in seasons)


# --- gap / priority frames -------------------------------------------------


def gapped(df: pd.DataFrame, strategy: str) -> pd.DataFrame:
    """Compute gaps on valid rows using the chosen benchmark strategy."""
    return compute_gaps(valid_yield(df), strategy=strategy)


def priority_frame(df: pd.DataFrame, strategy: str = "national_crop_median") -> pd.DataFrame:
    """Attach priority components and a normalized priority score/band per row."""
    g = compute_gaps(valid_yield(df), strategy=strategy)
    if g.empty:
        return g
    g = g.copy()
    perish = g.get("perishability", pd.Series(index=g.index, dtype=object))
    g["vulnerability"] = perish.map(_PERISHABILITY).fillna(0.5)
    g["affected_scale"] = g.get("harvested_area_ha", pd.Series(0.0, index=g.index)).fillna(0.0)
    g["readiness"] = (
        g.get("erosion_protection_farmers_pct", pd.Series(50.0, index=g.index)).fillna(50.0) / 100.0
    )
    land = g.get("agricultural_land_000ha", pd.Series(index=g.index, dtype=float))
    g["cost_constraint"] = 1.0 - (land / land.max()) if land.notna().any() and land.max() else 0.0

    norm = {}
    for metric in ["gap_index", "vulnerability", "affected_scale", "readiness", "cost_constraint"]:
        norm[metric] = ip.normalize(
            {i: float(v) for i, v in g[metric].fillna(0.0).items()}
        )
    scores, bands = [], []
    for idx, _row in g.iterrows():
        r = ip.priority_score(
            gap=norm["gap_index"].get(idx, 0.0),
            vulnerability=norm["vulnerability"].get(idx, 0.0),
            affected_scale=norm["affected_scale"].get(idx, 0.0),
            readiness=norm["readiness"].get(idx, 0.0),
            cost_constraint=norm["cost_constraint"].get(idx, 0.0),
        )
        scores.append(r.score)
        bands.append(r.band)
    g["priority_score"] = scores
    g["priority_band"] = bands
    return g


# --- endpoints support -----------------------------------------------------


def gap_report(strategy: str = "national_crop_median", limit: int = 100) -> dict:
    df = repo.training_dataset()
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy {strategy!r}; expected one of {STRATEGIES}")
    gapped_df = compute_gaps(df, strategy=strategy)
    gapped_df = gapped_df[gapped_df["gap_index"].notna()].sort_values("gap_index", ascending=False)
    rows = gapped_df.head(limit)[
        ["year", "season", "district", "canonical_crop_name", "cultivated_area_ha",
         "harvested_area_ha", "production_mt", "yield_kg_ha", "benchmark_yield_kg_ha",
         "gap_index"]
    ].rename(columns={"canonical_crop_name": "crop"})
    return {
        "strategy": strategy,
        "count": len(rows),
        "rows": rows.where(pd.notna(rows), None).to_dict(orient="records"),
    }


def productivity(f: AnalyticsFilters) -> dict:
    """KPI + district ranking for the Productivity Intelligence page."""
    df = apply_filters(repo.training_dataset(), f)
    g = gapped(df, f.benchmark_strategy)
    if g.empty:
        return {"period": None, "kpis": [], "rows": [], "n_observations": 0}

    valid = g[g["gap_index"].notna()]
    benchmark_median = float(valid["benchmark_yield_kg_ha"].median()) if not valid.empty else None
    gap_median = float(valid["gap_index"].median()) if not valid.empty else None
    above = int((valid["gap_index"] <= 0).sum())
    below = int((valid["gap_index"] > 0).sum())

    rows = (
        valid.groupby("district", dropna=False)
        .agg(
            district_code=("district_code", "first"),
            province=("province", "first"),
            yield_kg_ha=("yield_kg_ha", "median"),
            benchmark_yield_kg_ha=("benchmark_yield_kg_ha", "median"),
            gap_index=("gap_index", "median"),
            harvested_area_ha=("harvested_area_ha", "sum"),
            production_mt=("production_mt", "sum"),
        )
        .reset_index()
        .sort_values("gap_index", ascending=False)
    )
    rows = rows.head(f.limit)

    kpis = [
        {"id": "mean_yield", "label": "Mean observed yield",
         "value": round(float(valid["yield_kg_ha"].mean()), 1), "unit": "kg/ha"},
        {"id": "benchmark_yield", "label": "Median benchmark yield",
         "value": None if benchmark_median is None else round(benchmark_median, 1), "unit": "kg/ha"},
        {"id": "median_gap", "label": "Median productivity gap",
         "value": None if gap_median is None else round(gap_median, 1), "unit": "%"},
        {"id": "districts_above", "label": "Observations at/above benchmark",
         "value": above, "unit": "district-crops"},
        {"id": "districts_below", "label": "Observations below benchmark",
         "value": below, "unit": "district-crops"},
    ]
    return {
        "period": period_of(g),
        "kpis": kpis,
        "rows": records(rows),
        "n_observations": int(len(valid)),
    }


def factor_associations(f: AnalyticsFilters) -> dict:
    df = apply_filters(repo.training_dataset(), f)
    df = valid_yield(df)

    results = []
    for col in _factor_cols(df):
        sub = df[["yield_kg_ha", col]].dropna()
        corr = sub["yield_kg_ha"].corr(sub[col]) if len(sub) >= 3 else None
        n = int(len(sub))
        if corr is None:
            interpretation = "insufficient observations to estimate association"
            direction = None
        elif n < 8:
            interpretation = "small sample; association is indicative only"
            direction = "positive" if corr > 0 else "negative"
        else:
            direction = "positive" if corr > 0 else "negative"
            interpretation = (
                f"{direction} association with yield across {n} observations "
                "(not evidence of causation)"
            )
        results.append({
            "factor": col,
            "label": FACTOR_LABELS.get(col, col),
            "correlation": None if corr is None else round(float(corr), 4),
            "absolute_correlation": None if corr is None else round(abs(float(corr)), 4),
            "n_observations": n,
            "direction": direction,
            "interpretation": interpretation,
        })
    results.sort(
        key=lambda r: (r["absolute_correlation"] is None, -(r["absolute_correlation"] or 0))
    )
    return {
        "crop": f.crop,
        "district": f.district,
        "factors": results[: f.limit],
    }


def heatmap(f: AnalyticsFilters, metric: str = "gap") -> dict:
    """district x crop matrix for a chosen metric."""
    g = gapped(apply_filters(repo.training_dataset(), f), f.benchmark_strategy)
    if g.empty:
        return {"metric": metric, "districts": [], "crops": [], "cells": [],
                "max_value": None, "min_value": None, "unit": None}
    col = "gap_index" if metric == "gap" else "yield_kg_ha"
    unit = "%" if metric == "gap" else "kg/ha"
    piv = g.pivot_table(index="district", columns="canonical_crop_name", values=col, aggfunc="median")
    districts = [str(d) for d in piv.index.tolist()]
    crops = [str(c) for c in piv.columns.tolist()]
    cells = [
        {"district": str(d), "crop": str(c), "value": None if pd.isna(v) else round(float(v), 2)}
        for d, row in piv.iterrows()
        for c, v in row.items()
    ]
    values = [c["value"] for c in cells if c["value"] is not None]
    return {
        "metric": metric,
        "districts": districts,
        "crops": crops,
        "cells": cells[: f.limit] if f.limit else cells,
        "max_value": max(values) if values else None,
        "min_value": min(values) if values else None,
        "unit": unit,
    }


def _district_factor_means(f: AnalyticsFilters, columns: list[str]) -> list[dict]:
    df = apply_filters(repo.factors_dataset(), f, crop_column="district")
    cols = [c for c in columns if c in df.columns]
    if not cols:
        return []
    out = df[["district", "district_code", "province", *cols]].copy()
    out["mean"] = out[cols].mean(axis=1)
    return records(out[["district", "district_code", "province", "mean"]])


def irrigation_summary(f: AnalyticsFilters) -> dict:
    df = apply_filters(repo.irrigation_water(), f, crop_column="district")
    return {"districts": records(df), "period": period_of(df)}


def erosion_summary(f: AnalyticsFilters) -> dict:
    df = apply_filters(repo.erosion_control(), f, crop_column="district")
    return {"districts": records(df), "period": period_of(df)}


def priorities(limit: int = 50, weights: dict | None = None, f: AnalyticsFilters | None = None) -> dict:
    df = repo.training_dataset()
    if f is not None:
        df = apply_filters(df, f)
    gapped_df = _threshold_gap(df)
    gapped_df = gapped_df[gapped_df["yield_kg_ha"].fillna(0) > 0].copy()
    if gapped_df.empty:
        return {"weights": {**ip.DEFAULT_WEIGHTS, **(weights or {})}, "rows": [],
                "proxy_notes": PROXY_NOTES}

    perish = gapped_df.get("perishability", pd.Series(index=gapped_df.index, dtype=object))
    gapped_df["vulnerability"] = perish.map(_PERISHABILITY).fillna(0.5)
    gapped_df["affected_scale"] = gapped_df.get(
        "harvested_area_ha", pd.Series(0, index=gapped_df.index)
    ).fillna(0)
    gapped_df["readiness"] = (
        gapped_df.get("erosion_protection_farmers_pct", pd.Series(50.0, index=gapped_df.index))
        .fillna(50.0) / 100.0
    )
    land = gapped_df.get("agricultural_land_000ha", pd.Series(index=gapped_df.index, dtype=float))
    gapped_df["cost_constraint"] = 1.0 - (land / land.max()) if land.notna().any() and land.max() else 0.0

    candidates = []
    for _, row in gapped_df.iterrows():
        cid = f"{row.get('district_code', row['district'])}::{row['canonical_crop_name']}"
        candidates.append({
            "id": cid,
            "district": row["district"],
            "crop": row["canonical_crop_name"],
            "yield_kg_ha": None if pd.isna(row["yield_kg_ha"]) else round(float(row["yield_kg_ha"]), 1),
            "benchmark_yield_kg_ha": (
                None if pd.isna(row["benchmark_yield_kg_ha"])
                else round(float(row["benchmark_yield_kg_ha"]), 1)
            ),
            "harvested_area_ha": (
                None if pd.isna(row.get("harvested_area_ha")) else round(float(row["harvested_area_ha"]), 1)
            ),
            "gap": float(row["gap_index"]) if pd.notna(row["gap_index"]) else 0.0,
            "vulnerability": float(row["vulnerability"]),
            "affected_scale": float(row["affected_scale"]),
            "readiness": float(row["readiness"]),
            "cost_constraint": float(row["cost_constraint"]),
        })

    ranked = ip.rank(candidates, weights=weights)[:limit]
    rows = [{
        "id": r["id"], "district": r["district"], "crop": r["crop"],
        "score": r["score"], "band": r["band"],
        "yield_kg_ha": r.get("yield_kg_ha"),
        "benchmark_yield_kg_ha": r.get("benchmark_yield_kg_ha"),
        "harvested_area_ha": r.get("harvested_area_ha"),
        "gap": round(r["gap"], 4), "vulnerability": r["vulnerability_component"],
        "affected_scale": r["affected_scale_component"],
        "readiness": r["readiness_component"], "cost_constraint": r["cost_component"],
    } for r in ranked]
    return {
        "weights": {**ip.DEFAULT_WEIGHTS, **(weights or {})},
        "rows": rows,
        "proxy_notes": PROXY_NOTES,
    }


def _threshold_gap(df: pd.DataFrame) -> pd.DataFrame:
    """Compute gaps on all valid rows using a national crop median benchmark."""
    valid = df[df["yield_kg_ha"].fillna(0) > 0].copy()
    return compute_gaps(valid, strategy="national_crop_median")
