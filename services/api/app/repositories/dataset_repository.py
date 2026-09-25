"""Read-only access to processed analytical tables and reference dictionaries.

The API intentionally reads the same files the data pipeline produces, so the
public analytical endpoints work without a database during early development.
Database-backed repositories will be added alongside as the schema fills.
"""

from __future__ import annotations

from functools import lru_cache

import pandas as pd

from app.core.config import REPO_ROOT, get_settings

DICT_DIR = REPO_ROOT / "data" / "dictionaries"


class DatasetUnavailable(RuntimeError):
    """Raised when a requested dataset has not been built yet."""


@lru_cache
def _read_csv(path_str: str) -> pd.DataFrame:
    return pd.read_csv(path_str)


def training_dataset() -> pd.DataFrame:
    """Primary analytical table (productivity x factors), if built."""
    settings = get_settings()
    path = settings.processed_dir / "training_district_crop.csv"
    if not path.exists():
        raise DatasetUnavailable(
            "training_district_crop.csv not found. Run `make data` to build it."
        )
    return _read_csv(str(path))


def productivity_dataset() -> pd.DataFrame:
    settings = get_settings()
    path = settings.processed_dir / "district_crop_productivity_2025B.csv"
    if not path.exists():
        raise DatasetUnavailable(
            "district_crop_productivity_2025B.csv not found. Run `make data`."
        )
    return _read_csv(str(path))


def districts() -> pd.DataFrame:
    return _read_csv(str(DICT_DIR / "districts.csv"))


def crops() -> pd.DataFrame:
    return _read_csv(str(DICT_DIR / "crops.csv"))
