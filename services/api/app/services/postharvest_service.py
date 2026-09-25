"""Post-harvest use/loss service.

All shares are the official national crop-level values. Classification bands are
documented heuristic thresholds on the reported loss share, not calibrated risk
probabilities.
"""

from __future__ import annotations

import numpy as np

from app.repositories import dataset_repository as repo

# Heuristic bands on the *reported* post-harvest loss share (%). Documented so
# the classification is transparent and never presented as a model probability.
LOSS_BANDS = [(1.0, "HIGH"), (0.5, "MODERATE")]

SHARE_COLUMNS = [
    "sold_pct",
    "own_consumption_pct",
    "stored_pct",
    "post_harvest_losses_pct",
    "seeds_pct",
    "fodder_pct",
    "other_usage_pct",
]


def _band(loss: float | None) -> str | None:
    if loss is None or (isinstance(loss, float) and np.isnan(loss)):
        return None
    for threshold, band in LOSS_BANDS:
        if loss >= threshold:
            return band
    return "LOW"


def _val(value) -> float | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def summary() -> dict:
    df = repo.postharvest_use().replace({np.nan: None})

    crops = []
    for _, row in df.iterrows():
        crops.append({
            "crop": str(row["crop"]),
            "sold_pct": _val(row.get("sold_pct")),
            "own_consumption_pct": _val(row.get("own_consumption_pct")),
            "stored_pct": _val(row.get("stored_pct")),
            "post_harvest_losses_pct": _val(row.get("post_harvest_losses_pct")),
            "seeds_pct": _val(row.get("seeds_pct")),
            "fodder_pct": _val(row.get("fodder_pct")),
            "other_usage_pct": _val(row.get("other_usage_pct")),
            "shares_sum_ok": bool(row.get("shares_sum_ok")) if row.get("shares_sum_ok") is not None else None,
            "risk_band": _band(row.get("post_harvest_losses_pct")),
        })

    def _extreme(key: str, highest: bool = True) -> dict | None:
        frame = df.dropna(subset=[key])
        if frame.empty:
            return None
        idx = frame[key].idxmax() if highest else frame[key].idxmin()
        return {"crop": str(frame.loc[idx, "crop"]), "value": _val(frame.loc[idx, key])}

    loss_series = df["post_harvest_losses_pct"].dropna()
    kpis = [
        {"id": "highest_loss", "label": "Highest observed loss share",
         "value": None if _extreme("post_harvest_losses_pct") is None else _extreme("post_harvest_losses_pct")["value"],
         "unit": "% of production", "period": "2025-B",
         "note": None if _extreme("post_harvest_losses_pct") is None else _extreme("post_harvest_losses_pct")["crop"]},
        {"id": "median_loss", "label": "Median loss share",
         "value": None if loss_series.empty else round(float(loss_series.median()), 3),
         "unit": "% of production", "period": "2025-B"},
        {"id": "highest_storage", "label": "Highest storage share",
         "value": None if _extreme("stored_pct") is None else _extreme("stored_pct")["value"],
         "unit": "% stored", "period": "2025-B",
         "note": None if _extreme("stored_pct") is None else _extreme("stored_pct")["crop"]},
        {"id": "highest_marketed", "label": "Highest marketed share",
         "value": None if _extreme("sold_pct") is None else _extreme("sold_pct")["value"],
         "unit": "% sold", "period": "2025-B",
         "note": None if _extreme("sold_pct") is None else _extreme("sold_pct")["crop"]},
    ]

    return {
        "kpis": kpis,
        "crops": crops,
        "provenance": {
            "source_id": "NISR_SAS_2025B_POSTHARVEST_USE",
            "source_period": "2025-B",
            "method": "official national crop-level use shares; band thresholds documented in postharvest_service",
            "limitations": [
                "national crop-level values, not district values",
                "bands are heuristic thresholds, not calibrated risk probabilities",
                "shares are rounded and may not sum to exactly 100",
            ],
        },
    }
