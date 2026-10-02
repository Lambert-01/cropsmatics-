"""Multi-season (2024A-2026B) SAS ingestion tests.

These tests assert the data *contract* rather than re-deriving values: the
period dimension is exactly what NISR has published, the workbook/sheet mapping
is unique and complete, every raw byte is catalogued, the canonical panel has
usable keys, and the 2025B rows of the new pipeline are bit-for-bit identical to
the values the platform already serves.
"""

from __future__ import annotations

import hashlib

import pandas as pd
import pytest

from scripts.data import sas_table_map as tmap
from scripts.data.common import (
    PROCESSED_FILES,
    SAS_MANIFEST,
    SAS_RELEASES,
    VALID_PERIODS,
    normalize_period,
    split_period,
)
from scripts.tests.conftest import require

PRODUCTIVITY_METRICS = {"cultivated_area", "harvested_area", "yield", "production"}
CROP_PRODUCTIVITY = PROCESSED_FILES["crop_productivity"]


# --- period dimension -------------------------------------------------------


def test_period_dimension_is_exactly_the_published_releases():
    assert tuple(VALID_PERIODS) == (
        "2024A", "2024B", "2024C",
        "2025A", "2025B", "2025C",
        "2026A", "2026B",
    )
    # 2026C has not been published - inventing it would fabricate a period.
    assert "2026C" not in VALID_PERIODS


def test_normalize_period_accepts_published_and_rejects_unpublished():
    assert normalize_period(2025, "b") == "2025B"
    assert normalize_period("2026", "A") == "2026A"
    assert split_period("2024C") == (2024, "C")

    for bad in (("2026", "C"), (2027, "A"), (2023, "B"), (2025, "D")):
        with pytest.raises(ValueError):
            normalize_period(*bad)


# --- workbook/sheet mapping contract ---------------------------------------


def test_table_mapping_contract_is_valid():
    assert tmap.check_mapping() == []


def test_every_period_has_all_four_productivity_metrics():
    for period in VALID_PERIODS:
        metrics = {s.metric for s in tmap.PRODUCTIVITY_TABLES if s.period_code == period}
        assert metrics == PRODUCTIVITY_METRICS, f"{period} -> {sorted(metrics)}"


def test_no_sheet_is_mapped_twice():
    keys = [(s.release, s.sheet) for s in tmap.ALL_TABLES]
    assert len(keys) == len(set(keys))


def test_title_anomalies_are_documented_not_silent():
    """A sheet whose printed title names the wrong season needs a written reason."""
    for release, sheet in (
        ("SAS_2024_ANNUAL", "Table 63"),
        ("SAS_2025_ANNUAL", "Table 66"),
    ):
        spec = tmap.get_spec(release, sheet)
        assert spec is not None
        assert spec.period_override_reason, f"{release}/{sheet} override undocumented"
        assert spec.period_code.endswith("C")


# --- raw source catalogue ---------------------------------------------------


def test_source_catalog_hashes_every_raw_file(interim_dir):
    catalog = pd.read_csv(require(interim_dir / "source_catalog.csv"))
    assert len(catalog) > 200, "expected the SAS extraction plus the legacy pack"
    assert not catalog["relative_path"].duplicated().any()
    assert (catalog["bytes"] > 0).all()
    assert catalog["sha256"].str.len().eq(64).all()

    families = set(catalog["dataset_family"])
    assert {"SAS", "LEGACY_PACK", "MINAGRI_ADDON"} <= families

    # Every extracted SAS table CSV is catalogued with the period(s) it covers.
    root = interim_dir.parents[1]
    catalogued = set(catalog["relative_path"])
    sas = catalog[catalog["dataset_family"] == "SAS"]
    for folder in SAS_RELEASES.values():
        for table in folder.glob("*.csv"):
            assert table.resolve().relative_to(root).as_posix() in catalogued, table.name
    assert SAS_MANIFEST.resolve().relative_to(root).as_posix() in catalogued
    assert set(sas["period_hint"]) >= {
        "2024A/2024B/2024C",
        "2025A/2025B/2025C",
        "2026A",
        "2026B",
    }


def test_sas_table_catalog_maps_the_extraction(interim_dir):
    tables = pd.read_csv(require(interim_dir / "sas_table_catalog.csv"))
    assert len(tables) == 227, "227 extracted sheets across the four releases"
    assert tables["sheet"].notna().all()

    mapped = tables[tables["mapped"]]
    assert len(mapped) == len(tmap.ALL_TABLES)
    assert set(mapped["period_code"]) == set(VALID_PERIODS)
    # Unmapped sheets stay visible instead of being dropped.
    assert (~tables["mapped"]).any()
    assert tables.loc[~tables["mapped"], "period_code"].isna().all()


def test_manifest_row_counts_agree_with_the_extracted_csv(interim_dir):
    tables = pd.read_csv(require(interim_dir / "sas_table_catalog.csv"))
    sample = tables[tables["mapped"]].head(5)
    for row in sample.itertuples():
        path = require(interim_dir.parent.parent / row.relative_path)
        assert path.exists()
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == row.sha256
        with path.open("rb") as fh:
            assert sum(1 for _ in fh) == int(row.rows)


# --- canonical panel --------------------------------------------------------


def test_panel_covers_every_period_with_unique_keys(processed_dir):
    df = pd.read_csv(require(processed_dir / CROP_PRODUCTIVITY))
    assert set(df["period_code"]) == set(VALID_PERIODS)
    assert (df["year"].astype(str) + df["season"]) .equals(df["period_code"])
    assert not df[
        ["period_code", "geography_level", "geography_code", "crop_code", "farmer_scale"]
    ].duplicated().any()
    assert set(df["geography_level"]) <= {"DISTRICT", "NATIONAL"}


def test_panel_never_invents_a_district_or_a_zero(processed_dir, dicts_dir):
    df = pd.read_csv(require(processed_dir / CROP_PRODUCTIVITY))
    known_districts = set(pd.read_csv(dicts_dir / "districts.csv")["district"])
    district_rows = df[df["geography_level"] == "DISTRICT"]

    assert district_rows["district"].notna().all()
    assert set(district_rows["district"]) <= known_districts
    assert district_rows["district_code"].notna().all()
    for col in ("cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_kg_ha"):
        assert (district_rows[col].dropna() >= 0).all()

    # Aggregate rows are national and carry no district.
    national = df[df["geography_level"] == "NATIONAL"]
    assert national["district"].isna().all()
    assert set(national["geography_code"]) == {"RW"}

    # Season C tables are published for a narrower crop list; a crop NISR did
    # not tabulate must have no row rather than a fabricated zero.
    assert "Maize" not in set(df.loc[df["period_code"] == "2024C", "crop_name_raw"])


def test_panel_has_source_lineage_per_row(processed_dir):
    df = pd.read_csv(require(processed_dir / CROP_PRODUCTIVITY))
    assert df["source_id"].notna().all()
    assert (df["source_id"].str.len() > 0).all()
    assert df["source_sheets"].notna().all()
    assert df["metric_source_map"].notna().all()


# --- backward compatibility -------------------------------------------------


def test_2025b_new_pipeline_matches_the_legacy_pack(processed_dir):
    """The rows the platform already serves must not change value."""
    legacy = pd.read_csv(require(processed_dir / PROCESSED_FILES["district_crop_productivity"]))
    panel = pd.read_csv(require(processed_dir / CROP_PRODUCTIVITY))
    new = panel[(panel["period_code"] == "2025B") & (panel["geography_level"] == "DISTRICT")]

    joined = legacy.merge(
        new,
        left_on=["district", "crop"],
        right_on=["district", "crop_name_raw"],
        suffixes=("_legacy", "_panel"),
        how="outer",
        indicator=True,
    )
    assert len(joined) == len(legacy) == 510
    assert set(joined["_merge"]) == {"both"}

    for metric in (
        "cultivated_area_ha",
        "harvested_area_ha",
        "production_mt",
        "yield_kg_ha",
    ):
        old = pd.to_numeric(joined[f"{metric}_legacy"], errors="coerce")
        new_value = pd.to_numeric(joined[f"{metric}_panel"], errors="coerce")
        assert old.isna().equals(new_value.isna()), f"{metric}: null pattern differs"
        both = old.notna() & new_value.notna()
        assert (old[both] - new_value[both]).abs().max() <= 1e-6, metric


def test_crop_dictionary_covers_every_published_crop(processed_dir, dicts_dir):
    df = pd.read_csv(require(processed_dir / CROP_PRODUCTIVITY))
    known_crops = set(pd.read_csv(dicts_dir / "crops.csv")["crop_name"])
    assert set(df["crop_name_raw"].dropna()) <= known_crops
    assert df["crop_code"].notna().all()
