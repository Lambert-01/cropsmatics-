"""Read-only access to processed analytical tables and reference dictionaries.

The API intentionally reads the same files the data pipeline produces, so the
public analytical endpoints work without a database during early development.
Every loader is cached with ``lru_cache`` so CSVs are parsed once per process.
Call :func:`clear_cache` after re-running the pipeline if the process is long
lived. Database-backed repositories are added alongside as the schema fills.
"""

from __future__ import annotations

from functools import lru_cache

import pandas as pd

from app.core.config import REPO_ROOT, get_settings

DICT_DIR = REPO_ROOT / "data" / "dictionaries"
REGISTRY_DIR = REPO_ROOT / "data" / "source_registry"


class DatasetUnavailable(RuntimeError):
    """Raised when a requested dataset has not been built yet."""


@lru_cache
def _read_csv(path_str: str) -> pd.DataFrame:
    return pd.read_csv(path_str)


def _load(filename: str) -> pd.DataFrame:
    """Load a processed table, raising a helpful error when it is missing."""
    path = get_settings().processed_dir / filename
    if not path.exists():
        raise DatasetUnavailable(f"{filename} not found. Run `make data` to build it.")
    return _read_csv(str(path)).copy()


# --- primary analytical tables --------------------------------------------


def training_dataset() -> pd.DataFrame:
    """Primary analytical table (productivity x factors), if built."""
    return _load("training_district_crop.csv")


def productivity_dataset() -> pd.DataFrame:
    """Cleaned district x crop productivity table (real 2025B district rows)."""
    return _load("district_crop_productivity.csv")


def factors_dataset() -> pd.DataFrame:
    """Cleaned district input/practice factor table."""
    return _load("district_productivity_factors.csv")


def irrigation_water() -> pd.DataFrame:
    return _load("irrigation_water.csv")


def erosion_control() -> pd.DataFrame:
    return _load("erosion_control.csv")


def postharvest_use() -> pd.DataFrame:
    """Crop-level sold/stored/consumed/loss share table."""
    return _load("crop_postharvest_use.csv")


def national_crop_trends() -> pd.DataFrame:
    return _load("national_crop_trends.csv")


def national_input_trends() -> pd.DataFrame:
    return _load("national_input_trends.csv")


def cold_chain_context() -> pd.DataFrame:
    """Verified cold-chain program context; capacity intentionally null."""
    return _load("cold_chain_context.csv")


def postharvest_infrastructure() -> pd.DataFrame:
    """NATIONAL MINAGRI post-harvest infrastructure totals (add-on table 10).

    National level only - never joined to districts or facility markers.
    """
    return _load("national_postharvest_infrastructure.csv")


def cold_chain_network_summary() -> pd.DataFrame:
    """2026 MINAGRI-ACES cold-chain program summary (add-on table 11).

    Program-level context; facility capacity and coordinates are not published.
    """
    return _load("cold_chain_network_summary.csv")


def dashboard_overview() -> pd.DataFrame:
    return _load("dashboard_overview.csv")


def data_coverage() -> pd.DataFrame:
    return _load("data_coverage.csv")


def data_sources() -> pd.DataFrame:
    return _load("data_sources.csv")


def data_manifest() -> dict:
    """The processed-data manifest (pipeline version, hashes, row counts)."""
    import json

    path = get_settings().processed_dir / "manifest.json"
    if not path.exists():
        raise DatasetUnavailable("manifest.json not found. Run `make data` to build it.")
    return json.loads(path.read_text())


# --- reference dictionaries ------------------------------------------------


def districts() -> pd.DataFrame:
    return _read_csv(str(DICT_DIR / "districts.csv")).copy()


def crops() -> pd.DataFrame:
    return _read_csv(str(DICT_DIR / "crops.csv")).copy()


def curated_sources() -> pd.DataFrame:
    """The curated source registry (owner/type/access/url)."""
    return _read_csv(str(REGISTRY_DIR / "data_sources.csv")).copy()


def clear_cache() -> None:
    """Drop cached tables (e.g. after the pipeline is re-run in-process)."""
    _read_csv.cache_clear()
