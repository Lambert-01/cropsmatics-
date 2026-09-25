"""Analytics service: turns processed tables into API-ready results."""

from __future__ import annotations

import pandas as pd

from app.analytics import intervention_priority as ip
from app.analytics.productivity_gap import STRATEGIES, compute_gaps
from app.repositories import dataset_repository as repo

# MVP proxies for priority components that official 2025B tables do not carry.
# Documented so the weighting is never a black box (docs/11_INTERVENTION_ENGINE.md).
_PERISHABILITY = {"high": 1.0, "medium": 0.5, "low": 0.2}

PROXY_NOTES = [
    "vulnerability uses crop perishability as a proxy (no verified post-harvest loss join per district yet)",
    "readiness uses erosion-protection adoption as a proxy for existing practice uptake",
    "cost_constraint uses agricultural-land share as an inverse cost proxy",
]


def _threshold_gap(df: pd.DataFrame) -> pd.DataFrame:
    """Compute gaps on all valid rows using a national crop median benchmark."""
    valid = df[df["yield_kg_ha"].fillna(0) > 0].copy()
    return compute_gaps(valid, strategy="national_crop_median")


def gap_report(strategy: str = "national_crop_median", limit: int = 100) -> dict:
    df = repo.training_dataset()
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy {strategy!r}; expected one of {STRATEGIES}")
    gapped = compute_gaps(df, strategy=strategy)
    gapped = gapped[gapped["gap_index"].notna()].sort_values("gap_index", ascending=False)
    rows = gapped.head(limit)[
        ["year", "season", "district", "canonical_crop_name", "cultivated_area_ha",
         "harvested_area_ha", "production_mt", "yield_kg_ha", "benchmark_yield_kg_ha",
         "gap_index"]
    ].rename(columns={"canonical_crop_name": "crop"})
    return {
        "strategy": strategy,
        "count": len(rows),
        "rows": rows.where(pd.notna(rows), None).to_dict(orient="records"),
    }


def factor_associations(crop: str | None = None, limit: int = 20) -> dict:
    df = repo.training_dataset()
    if crop:
        df = df[df["canonical_crop_name"] == crop]
    df = df[df["yield_kg_ha"].fillna(0) > 0]

    factor_cols = [
        c for c in df.columns
        if c.endswith("_farmers_pct") or c == "agricultural_land_000ha"
    ]
    results = []
    for col in factor_cols:
        sub = df[["yield_kg_ha", col]].dropna()
        corr = sub["yield_kg_ha"].corr(sub[col]) if len(sub) >= 3 else None
        results.append({
            "factor": col,
            "correlation_with_yield": None if corr is None else round(float(corr), 4),
            "n_observations": int(len(sub)),
            "note": "association only; not evidence of causation",
        })
    results.sort(key=lambda r: (r["correlation_with_yield"] is None,
                                -abs(r["correlation_with_yield"] or 0)))
    return {"crop": crop, "factors": results[:limit]}


def priorities(limit: int = 50, weights: dict | None = None) -> dict:
    df = repo.training_dataset()
    gapped = _threshold_gap(df)
    gapped = gapped[gapped["yield_kg_ha"].fillna(0) > 0].copy()

    perish = gapped.get("perishability", pd.Series(index=gapped.index, dtype=object))
    gapped["vulnerability"] = perish.map(_PERISHABILITY).fillna(0.5)
    gapped["affected_scale"] = gapped.get("harvested_area_ha", pd.Series(0, index=gapped.index)).fillna(0)
    gapped["readiness"] = (
        gapped.get("erosion_protection_farmers_pct", pd.Series(50.0, index=gapped.index)).fillna(50.0) / 100.0
    )
    land = gapped.get("agricultural_land_000ha", pd.Series(index=gapped.index, dtype=float))
    gapped["cost_constraint"] = 1.0 - (land / land.max()) if land.notna().any() and land.max() else 0.0

    candidates = []
    for _, row in gapped.iterrows():
        cid = f"{row.get('district_code', row['district'])}::{row['canonical_crop_name']}"
        candidates.append({
            "id": cid,
            "district": row["district"],
            "crop": row["canonical_crop_name"],
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
        "gap": round(r["gap"], 4), "vulnerability": r["vulnerability_component"],
        "affected_scale": r["affected_scale_component"],
        "readiness": r["readiness_component"], "cost_constraint": r["cost_component"],
    } for r in ranked]
    return {"weights": ip.DEFAULT_WEIGHTS, "rows": rows, "proxy_notes": PROXY_NOTES}
