"""Dataset explorer service.

Exposes the processed tables (and reference dictionaries) as readable, paginated
records so judges and researchers can see exactly what the platform uses. Only
whitelisted datasets are reachable — no arbitrary file access, no arbitrary
expressions: every filter is an exact-match equality on a whitelisted column,
and sorting is restricted to existing columns with a safe direction flag.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import HTTPException, status

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
    "postharvest_infrastructure": (
        "National Post-Harvest Infrastructure (MINAGRI)",
        "postharvest_infrastructure",
        "MINAGRI_ANNUAL_REPORT_2024_2025_POSTHARVEST_INFRA",
    ),
    "cold_chain_network_summary": (
        "Cold-Chain Network Summary 2026 (MINAGRI-ACES)",
        "cold_chain_network_summary",
        "MINAGRI_ACES_COLDCHAIN_2026_NETWORK",
    ),
    "districts": ("District Dictionary", "districts", "REFERENCE_DICTIONARY"),
    "crops": ("Crop Dictionary", "crops", "REFERENCE_DICTIONARY"),
}

# Whitelisted exact-match filter columns per dataset family. Any query param
# outside these names is rejected with a 400 rather than silently ignored.
FILTERABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "district_crop_productivity": ("district", "province", "canonical_crop_name", "year", "season"),
    "district_factors": ("district", "province", "year", "season"),
    "irrigation_water": ("district", "province", "year", "season"),
    "erosion_control": ("district", "province", "year", "season"),
    "crop_postharvest_use": ("crop",),
    "national_crop_trends": ("crop", "year", "season"),
    "national_input_trends": ("year", "season"),
    "cold_chain_context": ("district",),
    "postharvest_infrastructure": (),
    "cold_chain_network_summary": (),
    "districts": ("province",),
    "crops": (),
}

# Common aliases accepted from the generic analytics filter vocabulary.
_COLUMN_ALIASES = {"crop": "canonical_crop_name"}


def _resolve_column(df: pd.DataFrame, requested: str) -> str | None:
    """Map a requested filter name onto a real column, alias-aware."""
    name = _COLUMN_ALIASES.get(requested, requested)
    if name in df.columns:
        return name
    # Exact-match fallback for tables using the bare `crop` column.
    if requested in df.columns:
        return requested
    return None


def list_datasets() -> list[dict]:
    return [
        {"key": key, "label": label, "source_id": source_id}
        for key, (label, _, source_id) in DATASETS.items()
    ]


def fetch(
    key: str,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
    filters: dict[str, str] | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
) -> dict:
    if key not in DATASETS:
        raise KeyError(key)
    label, loader_name, source_id = DATASETS[key]
    df: pd.DataFrame = getattr(repo, loader_name)()

    allowed = FILTERABLE_COLUMNS.get(key, ())

    # --- whitelisted exact-match filters -------------------------------------
    for raw_name, raw_value in (filters or {}).items():
        if not raw_value:
            continue
        if raw_name not in allowed and _COLUMN_ALIASES.get(raw_name, raw_name) not in allowed:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"filter '{raw_name}' is not supported for dataset '{key}'",
            )
        column = _resolve_column(df, raw_name)
        if column is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"filter '{raw_name}' is not supported for dataset '{key}'",
            )
        df = df[df[column].astype(str).str.lower() == str(raw_value).strip().lower()]

    # --- free-text search over all columns -----------------------------------
    if search:
        needle = search.lower()
        mask = df.astype(str).apply(
            lambda col: col.str.lower().str.contains(needle, na=False)
        ).any(axis=1)
        df = df[mask]

    # --- sorting (whitelisted to real columns; direction whitelisted) --------
    if sort_by:
        if sort_by not in df.columns:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"cannot sort by '{sort_by}': not a column of '{key}'",
            )
        ascending = sort_dir != "desc"
        df = df.sort_values(by=sort_by, ascending=ascending, na_position="last")

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
        "sort": {"by": sort_by, "direction": sort_dir} if sort_by else None,
        "filters": {k: v for k, v in (filters or {}).items() if v},
    }


def records_for_export(key: str) -> pd.DataFrame:
    if key not in DATASETS:
        raise KeyError(key)
    _, loader_name, _ = DATASETS[key]
    return getattr(repo, loader_name)()
