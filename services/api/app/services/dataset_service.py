"""Dataset explorer service.

Exposes the processed tables (and reference dictionaries) as readable, paginated
records so judges and researchers can see exactly what the platform uses. Only
whitelisted datasets are reachable — no arbitrary file access.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo

# key -> (label, loader, source_id)
DATASETS: dict[str, tuple[str, str, str]] = {
    "district_crop_productivity": (
        "District Crop Productivity",
        "productivity_dataset",
        "NISR_SAS_2025B_DISTRICT_CROP",
    ),
    "district_factors": (
        "District Factors (inputs & practices)",
        "factors_dataset",
        "NISR_SAS_2025B_DISTRICT_FACTORS",
    ),
    "irrigation_water": ("Irrigation & Water", "irrigation_water", "NISR_SAS_2025B_IRRIGATION_WATER"),
    "erosion_control": ("Erosion Control", "erosion_control", "NISR_SAS_2025B_EROSION"),
    "crop_postharvest_use": (
        "Post-Harvest Use & Loss",
        "postharvest_use",
        "NISR_SAS_2025B_POSTHARVEST_USE",
    ),
    "national_crop_trends": (
        "National Crop Trends",
        "national_crop_trends",
        "NISR_SAS_2024_2026_NATIONAL_TRENDS",
    ),
    "national_input_trends": (
        "National Input Trends",
        "national_input_trends",
        "NISR_SAS_2024_2026_NATIONAL_INPUT_TRENDS",
    ),
    "cold_chain_context": (
        "Verified Cold-Chain Context",
        "cold_chain_context",
        "MINAGRI_ACES_COLDCHAIN_2026",
    ),
    "districts": ("District Dictionary", "districts", "REFERENCE_DICTIONARY"),
    "crops": ("Crop Dictionary", "crops", "REFERENCE_DICTIONARY"),
}


def list_datasets() -> list[dict]:
    return [
        {"key": key, "label": label, "source_id": source_id}
        for key, (label, _, source_id) in DATASETS.items()
    ]


def fetch(key: str, limit: int = 100, offset: int = 0, search: str | None = None) -> dict:
    if key not in DATASETS:
        raise KeyError(key)
    label, loader_name, source_id = DATASETS[key]
    df: pd.DataFrame = getattr(repo, loader_name)()

    if search:
        needle = search.lower()
        mask = df.astype(str).apply(
            lambda col: col.str.lower().str.contains(needle, na=False)
        ).any(axis=1)
        df = df[mask]

    total = int(len(df))
    window = df.iloc[offset : offset + limit].replace({np.nan: None})
    return {
        "key": key,
        "label": label,
        "source_id": source_id,
        "columns": [str(c) for c in window.columns],
        "rows": window.to_dict(orient="records"),
        "count": total,
        "offset": offset,
        "limit": limit,
    }


def records_for_export(key: str) -> pd.DataFrame:
    if key not in DATASETS:
        raise KeyError(key)
    _, loader_name, _ = DATASETS[key]
    return getattr(repo, loader_name)()
