"""Repository path helpers for the ML package."""

from __future__ import annotations

from pathlib import Path

# ml/src/utils/paths.py -> repo root is parents[3].
ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
RAW_PACK = DATA_DIR / "raw" / "cropmatics_real_data_2024_2026"
ARTIFACTS_DIR = ROOT / "ml" / "artifacts"
REPORTS_DIR = ROOT / "ml" / "reports"
DICTS_DIR = DATA_DIR / "dictionaries"

TRAINING_TABLE = PROCESSED_DIR / "training_district_crop.csv"


def ensure_dirs() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
