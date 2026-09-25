"""Shared helpers for the Cropmatics data pipeline.

All scripts are deterministic and safe to re-run: they read from ``data/raw``
(immutable) and write to ``data/processed`` (regenerable).
"""

from __future__ import annotations

import sys
from pathlib import Path

# --- paths -----------------------------------------------------------------
# common.py -> scripts/data/common.py, so repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
RAW_PACK = RAW_DIR / "cropmatics_real_data_2024_2026"
# Official third-party / ministry add-on packages that are committed as raw
# sources but live outside the primary NISR pack.
RAW_MINAGRI = RAW_DIR / "external" / "minagri"
EXTERNAL_DIR = DATA_DIR / "external"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
DICTS_DIR = DATA_DIR / "dictionaries"
REGISTRY_DIR = DATA_DIR / "source_registry"
FIXTURES_DIR = DATA_DIR / "dev_fixtures"

# --- pipeline identity (recorded in every processed row) -------------------
PIPELINE_VERSION = "0.1.0"

# --- raw source file names -------------------------------------------------
RAW_FILES = {
    "district_crop_productivity": "01_district_crop_productivity_2025B.csv",
    "district_factors": "02_district_productivity_factors_2025B.csv",
    "irrigation_water": "03_irrigation_water_2025B.csv",
    "erosion_control": "04_erosion_control_2025B.csv",
    "crop_postharvest_use": "05_crop_postharvest_use_2025B.csv",
    "national_crop_trends": "06_national_crop_trends_2024_2026.csv",
    "national_input_trends": "07_national_input_practice_trends_2024_2026.csv",
    "cold_chain_context": "08_verified_cold_chain_context_2026.csv",
    "source_registry": "09_source_registry.csv",
}

# --- MINAGRI add-on sources (data/raw/external/minagri/) -------------------
# National-level only. Never joined to districts or facilities.
RAW_EXTERNAL_FILES = {
    "postharvest_infrastructure": "10_national_postharvest_infrastructure_2024_2025.csv",
    "cold_chain_network_summary": "11_cold_chain_network_summary_2026.csv",
    "source_registry_additions": "source_registry_additions.csv",
}

# Source identifiers used for provenance (align with source_registry/).
SOURCE_IDS = {
    "district_crop_productivity": "NISR_SAS_2025B_DISTRICT_CROP",
    "district_factors": "NISR_SAS_2025B_DISTRICT_FACTORS",
    "irrigation_water": "NISR_SAS_2025B_IRRIGATION_WATER",
    "erosion_control": "NISR_SAS_2025B_EROSION",
    "crop_postharvest_use": "NISR_SAS_2025B_POSTHARVEST_USE",
    "national_crop_trends": "NISR_SAS_2024_2026_NATIONAL_TRENDS",
    "national_input_trends": "NISR_SAS_2024_2026_NATIONAL_INPUT_TRENDS",
    "cold_chain_context": "MINAGRI_ACES_COLDCHAIN_2026",
    "postharvest_infrastructure": "MINAGRI_ANNUAL_REPORT_2024_2025_POSTHARVEST_INFRA",
    "cold_chain_network_summary": "MINAGRI_ACES_COLDCHAIN_2026_NETWORK",
}

# Canonical processed output names (docs/DATA_TO_UI_MATRIX.md references these).
PROCESSED_FILES = {
    "district_crop_productivity": "district_crop_productivity.csv",
    "district_factors": "district_productivity_factors.csv",
    "irrigation_water": "irrigation_water.csv",
    "erosion_control": "erosion_control.csv",
    "crop_postharvest_use": "crop_postharvest_use.csv",
    "national_crop_trends": "national_crop_trends.csv",
    "national_input_trends": "national_input_trends.csv",
    "cold_chain_context": "cold_chain_context.csv",
    "postharvest_infrastructure": "national_postharvest_infrastructure.csv",
    "cold_chain_network_summary": "cold_chain_network_summary.csv",
    "training": "training_district_crop.csv",
    "dashboard_overview": "dashboard_overview.csv",
    "data_coverage": "data_coverage.csv",
    "data_sources": "data_sources.csv",
}

# Columns that flag official vs synthetic origin on every processed row.
PROVENANCE_COLUMNS = [
    "source_id",
    "source_period",
    "processing_script",
    "processing_version",
    "is_synthetic",
]


def raw_path(key: str) -> Path:
    """Absolute path to a raw source file by logical key.

    Resolves the primary NISR pack first, then the committed MINAGRI add-on.
    """
    if key in RAW_FILES:
        return RAW_PACK / RAW_FILES[key]
    if key in RAW_EXTERNAL_FILES:
        return RAW_MINAGRI / RAW_EXTERNAL_FILES[key]
    raise KeyError(f"unknown raw source key: {key!r}")


def processed_path(name: str) -> Path:
    """Absolute path to a processed output file."""
    return PROCESSED_DIR / name


def log(msg: str) -> None:
    print(f"[data] {msg}")


def add_provenance(df, source_key: str, script: str):
    """Attach provenance columns to a processed DataFrame (all real data)."""
    df = df.copy()
    df["source_id"] = SOURCE_IDS.get(source_key, "UNKNOWN")
    if "year" in df.columns and "season" in df.columns:
        df["source_period"] = df["year"].astype(str) + "-" + df["season"].astype(str)
    elif "year" in df.columns:
        df["source_period"] = df["year"].astype(str)
    elif "period" in df.columns:
        # National add-on tables carry a free-text reporting period.
        df["source_period"] = df["period"].astype(str)
    else:
        df["source_period"] = ""
    df["processing_script"] = script
    df["processing_version"] = PIPELINE_VERSION
    df["is_synthetic"] = False
    return df
