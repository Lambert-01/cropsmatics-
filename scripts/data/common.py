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
RAW_PACK = RAW_DIR / "derived_source_extracts_2024_2026"
# Legacy alias: the original 2025B compatibility extracts. Kept one release
# cycle so parity tests can compare new multi-period outputs against the
# already-live values.
RAW_LEGACY_DIR = RAW_PACK
# Official third-party / ministry add-on packages that are committed as raw
# sources but live outside the primary NISR pack.
RAW_MINAGRI = RAW_DIR / "external" / "minagri"

# --- canonical NISR / market raw layout (multi-season, 2024A-2026B) ---------
RAW_NISR_DIR = RAW_DIR / "nisr"
RAW_SAS_DIR = RAW_NISR_DIR / "sas"
RAW_SAS_MICRODATA_DIR = RAW_NISR_DIR / "sas_microdata"
RAW_MARKETS_DIR = RAW_DIR / "markets"

# Extracted SAS table CSVs live under a release folder, e.g.
#   data/raw/nisr/sas/2024/annual/tables/Table 10.csv
#   data/raw/nisr/sas/2026/season_a/tables/Table 11.csv
SAS_RELEASES: dict[str, Path] = {
    "SAS_2022_ANNUAL": RAW_SAS_DIR / "2022" / "annual" / "tables",
    "SAS_2023_ANNUAL": RAW_SAS_DIR / "2023" / "annual" / "tables",
    "SAS_2024_ANNUAL": RAW_SAS_DIR / "2024" / "annual" / "tables",
    "SAS_2025_ANNUAL": RAW_SAS_DIR / "2025" / "annual" / "tables",
    "SAS_2026A": RAW_SAS_DIR / "2026" / "season_a" / "tables",
    "SAS_2026B": RAW_SAS_DIR / "2026" / "season_b" / "tables",
}
SAS_MANIFEST = RAW_SAS_DIR / "manifest.csv"


def release_folder_key(release: str) -> str:
    """Manifest ``folder`` key for a release, derived from its extraction path.

    ``SAS_RELEASES`` is the single source of truth: a release extracted to
    ``.../2026/season_a/tables`` has the key ``2026_season_a``. Nothing derives a
    folder name from a hardcoded year list, so adding 2027 is one entry above.
    """
    return SAS_RELEASES[release].parent.relative_to(RAW_SAS_DIR).as_posix().replace("/", "_")


# Market provider raw directories (files land here via download/manual export).
RAW_MARKET_DIRS: dict[str, Path] = {
    "nisr_sas": RAW_MARKETS_DIR / "nisr_sas",
    "esoko": RAW_MARKETS_DIR / "esoko",
    "fewsnet": RAW_MARKETS_DIR / "fewsnet",
    "wfp": RAW_MARKETS_DIR / "wfp",
}

EXTERNAL_DIR = DATA_DIR / "external"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
DICTS_DIR = DATA_DIR / "dictionaries"
REGISTRY_DIR = DATA_DIR / "source_registry"

# --- pipeline identity (recorded in every processed row) -------------------
PIPELINE_VERSION = "0.2.0"

# --- published-consistency policy: yield vs production/harvested area --------
# NISR publishes yield independently of production and harvested area, so the
# two do not always reconcile. This single policy is shared by the validator
# (which counts and reports) and the database loader (which flags each row), so
# the two can never disagree about which rows are inconsistent.
#
# The threshold is scale-aware because the releases are not equally precise:
# the 2023 workbook publishes whole numbers, so an implied yield legitimately
# differs from the printed yield by a fraction of a percent. Policy therefore:
#   * within max(ABS, REL x published yield)  -> rounding, reported as info;
#   * beyond it                               -> material source
#     inconsistency, reported as a warning, flagged `review` on the row, and
#     excluded from forecast training unless a sensitivity run says otherwise.
# Official figures are never overwritten in either case.
YIELD_CONSISTENCY_ABS_TOLERANCE_KG_HA = 1.0
YIELD_CONSISTENCY_REL_TOLERANCE = 0.01


def yield_discrepancy_tolerance(published_yield_kg_ha: float) -> float:
    """Allowed |implied - published| yield gap before a row is material."""
    return max(
        YIELD_CONSISTENCY_ABS_TOLERANCE_KG_HA,
        YIELD_CONSISTENCY_REL_TOLERANCE * abs(published_yield_kg_ha),
    )


def is_material_yield_discrepancy(
    production_mt: float | None,
    harvested_area_ha: float | None,
    published_yield_kg_ha: float | None,
) -> bool:
    """True when published yield and production/area disagree beyond tolerance."""
    if production_mt is None or harvested_area_ha is None or published_yield_kg_ha is None:
        return False
    if harvested_area_ha <= 0:
        return False
    implied = production_mt * 1000.0 / harvested_area_ha
    return abs(implied - published_yield_kg_ha) > yield_discrepancy_tolerance(published_yield_kg_ha)


# --- canonical period dimension --------------------------------------------
# Exactly the periods NISR has published as of October 2026: the 2022, 2023,
# 2024 and 2025 annual releases cover Seasons A/B/C; 2026 covers Seasons A and
# B only. 2026C is NOT listed because NISR has not published it - inventing it
# would fabricate a period that does not exist. 2022/2023 were added when the
# owner supplied the corresponding annual workbooks (verified: all three
# seasons of district-level productivity tables are present in each).
VALID_PERIODS: tuple[str, ...] = (
    "2022A",
    "2022B",
    "2022C",
    "2023A",
    "2023B",
    "2023C",
    "2024A",
    "2024B",
    "2024C",
    "2025A",
    "2025B",
    "2025C",
    "2026A",
    "2026B",
)


def normalize_period(year: int | str, season: str) -> str:
    """Return the canonical ``YYYYS`` period code, rejecting unpublished periods."""
    code = f"{int(year)}{str(season).strip().upper()}"
    if code not in VALID_PERIODS:
        raise ValueError(f"unsupported/unpublished period: {code}")
    return code


def split_period(period_code: str) -> tuple[int, str]:
    """Inverse of :func:`normalize_period` (``'2025B'`` -> ``(2025, 'B')``)."""
    if period_code not in VALID_PERIODS:
        raise ValueError(f"unsupported/unpublished period: {period_code!r}")
    return int(period_code[:4]), period_code[4]


# Source identifiers for the multi-season SAS releases (provenance + registry).
SAS_SOURCE_IDS: dict[str, str] = {
    "SAS_2022_ANNUAL": "NISR_SAS_2022_ANNUAL",
    "SAS_2023_ANNUAL": "NISR_SAS_2023_ANNUAL",
    "SAS_2024_ANNUAL": "NISR_SAS_2024_ANNUAL",
    "SAS_2025_ANNUAL": "NISR_SAS_2025_ANNUAL",
    "SAS_2026A": "NISR_SAS_2026A",
    "SAS_2026B": "NISR_SAS_2026B",
}

# Workbook file names as published by NISR (recorded in the source registry).
SAS_WORKBOOKS: dict[str, str] = {
    "SAS_2022_ANNUAL": "SAS 2022_Tables_0.xlsx",
    "SAS_2023_ANNUAL": "SAS 2023_Annual Tables (3).xlsx",
    "SAS_2024_ANNUAL": "SAS 2024_Annual Tables.xlsx",
    "SAS_2025_ANNUAL": "SAS 2025_Annual Tables.xlsx",
    "SAS_2026A": "Tables_2026 Season A.xlsx",
    "SAS_2026B": "Tables_2026 Season B.xlsx",
}

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
    # --- multi-season canonical outputs (2024A-2026B) ---
    "crop_productivity": "crop_productivity.csv",
    "agricultural_practices": "agricultural_practice_observation.csv",
    "fertilizer_source": "fertilizer_source.csv",
    "crop_postharvest_use_multi": "crop_postharvest_use_multi_period.csv",
    "market_prices": "market_price_observation.csv",
    "sources": "sources.csv",
    "sas_interim_long": "../interim/sas_productivity_long.csv",
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


def normalize_database_url(url: str) -> str:
    """Coerce a dashboard-pasted ``postgresql://`` URL to the psycopg 3 driver.

    Neon/Render dashboards copy connection strings with the bare
    ``postgresql://`` scheme, which SQLAlchemy maps to psycopg2 - a driver the
    project does not ship. Engines built from such a URL fail with
    ``ModuleNotFoundError: psycopg2``. Rewriting the scheme keeps operator input
    working. Already-driver-qualified URLs pass through unchanged.
    """
    cleaned = (url or "").strip()
    for prefix in ("postgres://", "postgresql://", "postgresql+psycopg2://"):
        if cleaned.startswith(prefix):
            return "postgresql+psycopg://" + cleaned[len(prefix) :]
    return cleaned


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
