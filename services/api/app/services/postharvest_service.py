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


def summary(crop: str | None = None) -> dict:
    """National crop-level post-harvest use/loss summary.

    Crop filtering is supported because the source table is crop-level.
    Year/season are NOT filterable: the published table is a single
    2025-B period. District filtering is deliberately NOT fabricated: the
    dataset is national crop-level and has no district dimension at all.
    """
    df = repo.postharvest_use().replace({np.nan: None})

    if crop:
        mask = df["crop"].astype(str).str.lower() == crop.strip().lower()
        if not mask.any():
            raise KeyError(f"unknown crop: {crop}")
        df = df[mask]

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
        if df.empty:
            return None
        frame = df.dropna(subset=[key])
        if frame.empty:
            return None
        idx = frame[key].idxmax() if highest else frame[key].idxmin()
        return {"crop": str(frame.loc[idx, "crop"]), "value": _val(frame.loc[idx, key])}

    loss_series = df["post_harvest_losses_pct"].dropna()
    stored_series = df["stored_pct"].dropna()
    sold_series = df["sold_pct"].dropna()

    # Chosen once, here, and reused. Picking the maximum is an analytical
    # selection - it decides which crop the page leads with - so it belongs to
    # this layer, not to a client. Two clients picking their own maximum can also
    # disagree on nulls and ties; one selection cannot.
    loss_ext = _extreme("post_harvest_losses_pct")
    stored_ext = _extreme("stored_pct")
    sold_ext = _extreme("sold_pct")
    n_considered = int(len(df))

    kpis = [
        {"id": "highest_loss", "label": "Highest observed loss share",
         "value": None if loss_ext is None else loss_ext["value"],
         "unit": "% of production", "period": "2025-B",
         "note": None if loss_ext is None else loss_ext["crop"]},
        {"id": "median_loss", "label": "Median loss share",
         "value": None if loss_series.empty else round(float(loss_series.median()), 3),
         "unit": "% of production", "period": "2025-B"},
        {"id": "highest_storage", "label": "Highest storage share",
         "value": None if stored_ext is None else stored_ext["value"],
         "unit": "% stored", "period": "2025-B",
         "note": None if stored_ext is None else stored_ext["crop"]},
        {"id": "highest_marketed", "label": "Highest marketed share",
         "value": None if sold_ext is None else sold_ext["value"],
         "unit": "% sold", "period": "2025-B",
         "note": None if sold_ext is None else sold_ext["crop"]},
        # Unweighted means across the reported crops. Deliberately NOT tonnage
        # weighted: the two tables use different crop vocabularies, so weighting
        # them would silently invent a match.
        {"id": "mean_stored_share", "label": "Mean stored share",
         "value": None if stored_series.empty else round(float(stored_series.mean()), 3),
         "unit": "% stored", "period": "2025-B",
         "source_id": "NISR_SAS_2025B_POSTHARVEST_USE",
         "note": f"unweighted mean across {len(stored_series)} crops"},
        {"id": "mean_sold_share", "label": "Mean sold share",
         "value": None if sold_series.empty else round(float(sold_series.mean()), 3),
         "unit": "% sold", "period": "2025-B",
         "source_id": "NISR_SAS_2025B_POSTHARVEST_USE",
         "note": f"unweighted mean across {len(sold_series)} crops"},
    ]

    headlines = [
        {
            "id": "highest_loss_crop",
            "label": "Highest loss crop",
            "unit": "% of production lost",
            "crop": None if loss_ext is None else loss_ext["crop"],
            "value": None if loss_ext is None else loss_ext["value"],
            "n_crops_considered": n_considered,
        },
        {
            "id": "highest_storage_crop",
            "label": "Highest storage crop",
            "unit": "% stored",
            "crop": None if stored_ext is None else stored_ext["crop"],
            "value": None if stored_ext is None else stored_ext["value"],
            "n_crops_considered": n_considered,
        },
        {
            "id": "highest_marketed_crop",
            "label": "Highest marketed crop",
            "unit": "% sold",
            "crop": None if sold_ext is None else sold_ext["crop"],
            "value": None if sold_ext is None else sold_ext["value"],
            "n_crops_considered": n_considered,
        },
    ]

    return {
        "kpis": kpis,
        "crops": crops,
        "headlines": headlines,
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
