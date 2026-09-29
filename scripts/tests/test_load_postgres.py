"""Rules the canonical loader must never break.

These assert behaviour, not values: missing means NULL and never zero, a
published anomaly is flagged rather than corrected, and the same input always
produces the same keys. A loader that quietly changes any of those turns a data
defect into a published figure.
"""

from __future__ import annotations

from collections import Counter

import pandas as pd
import pytest

from scripts.data.load_postgres import (
    as_bool,
    as_float,
    clean,
    content_version,
    dictionaries,
    observation_rows,
    panel_rows,
    parse_source_titles,
    period_rows,
    source_table_id,
)
from scripts.tests.conftest import require

# --- missing is not zero ----------------------------------------------------


def test_missing_values_become_none_and_never_zero():
    for blank in (float("nan"), None, pd.NA):
        assert clean(blank) is None
        assert as_float(blank) is None


def test_a_real_zero_survives_parsing():
    """Zero is a legitimate observation and must not be treated as missing."""
    assert clean(0) == 0
    assert as_float(0) == 0.0
    assert as_float("0") == 0.0


def test_booleans_parse_from_the_published_representations():
    assert as_bool(True) is True
    assert as_bool("False") is False
    assert as_bool("true") is True
    assert as_bool(None) is None


def test_unparseable_numbers_become_none_rather_than_raising():
    assert as_float("n/a") is None
    assert as_float("-") is None


# --- determinism ------------------------------------------------------------


def test_content_version_is_stable_and_input_sensitive():
    manifest = {"pipeline_version": "0.2.0", "git_sha": "abc123", "row_counts": {"a": 1}}
    assert content_version(manifest) == content_version(dict(manifest))

    changed = {**manifest, "row_counts": {"a": 2}}
    assert content_version(changed) != content_version(manifest)


def test_source_table_ids_are_deterministic_and_distinct():
    first = source_table_id("NISR_SAS_2025_ANNUAL", "Table 13")
    assert first == source_table_id("NISR_SAS_2025_ANNUAL", "Table 13")
    assert first != source_table_id("NISR_SAS_2025_ANNUAL", "Table 14")
    assert first != source_table_id("NISR_SAS_2024_ANNUAL", "Table 13")
    assert source_table_id("NISR_SAS_2025_ANNUAL", None) == "NISR_SAS_2025_ANNUAL::unnamed"


def test_source_titles_are_stored_verbatim():
    raw = "Table 10: 2024 Season A_Cultivated area (Ha)|Table 13: 2024 Season A_Harvested area (Ha)"
    titles = parse_source_titles(raw)
    assert set(titles) == {"Table 10", "Table 13"}
    # The original string is preserved, not re-formatted or "corrected".
    assert titles["Table 10"] == "Table 10: 2024 Season A_Cultivated area (Ha)"
    assert parse_source_titles(None) == {}
    assert parse_source_titles("") == {}


# --- period catalogue -------------------------------------------------------


def test_period_rows_are_derived_and_never_invent_a_period(processed_dir):
    rows = period_rows()
    codes = {row["period_id"] for row in rows}
    # 2026C is not listed because NISR has not published it.
    assert "2026C" not in codes
    assert {"2024A", "2025B", "2026B"}.issubset(codes)
    for row in rows:
        assert row["label"] == f"{row['year']} Season {row['season']}"
        assert row["sort_key"] == f"{row['year']}:{row['season']}"


# --- panel normalization ----------------------------------------------------


def _panel_row(**overrides) -> dict:
    row = {
        "period_code": "2026B",
        "year": 2026,
        "season": "B",
        "geography_level": "DISTRICT",
        "geography_code": "RW-EA-BUG",
        "district": "Bugesera",
        "district_code": "RW-EA-BUG",
        "province": "Eastern",
        "farmer_scale": "all",
        "row_scope": "district",
        "crop_code": "CROP-MAI",
        "canonical_crop_name": "Maize",
        "cultivated_area_ha": 100.0,
        "harvested_area_ha": 90.0,
        "production_mt": 200.0,
        "yield_kg_ha": 2222.0,
        "harvest_ratio": 0.9,
        "cultivated_area_reported": True,
        "yield_reported": True,
        "source_id": "NISR_SAS_2026B",
        "source_sheets": "Table 10",
        "source_titles_raw": "Table 10: 2026 Season B_Cultivated area",
        "is_synthetic": False,
    }
    row.update(overrides)
    return row


def _load(rows_list):
    frame = pd.DataFrame(rows_list)
    return panel_rows(frame, "0.2.0-test", {"CROP-MAI": "Maize"}, {"RW-EA-BUG"})


def test_valid_panel_row_is_accepted():
    rows, stats = _load([_panel_row()])
    assert stats.rejected_rows == 0
    assert len(rows) == 1
    assert rows[0]["geography_level"] == "district"
    assert rows[0]["season"] == "B"
    assert rows[0]["quality_flag"] == "ok"


def test_an_unpublished_period_is_rejected_not_stored():
    rows, stats = _load([_panel_row(period_code="2026C")])
    assert rows == []
    assert stats.rejected_rows == 1
    assert any("invalid_period" in reason for reason in stats.reject_reasons)


def test_a_negative_area_is_rejected_rather_than_clamped():
    rows, stats = _load([_panel_row(harvested_area_ha=-5.0)])
    assert rows == []
    assert stats.rejected_rows == 1
    assert any("negative_metric" in reason for reason in stats.reject_reasons)


def test_harvested_above_cultivated_is_flagged_and_the_value_is_unchanged():
    """A published inconsistency is recorded, never silently corrected."""
    rows, stats = _load([_panel_row(cultivated_area_ha=10.0, harvested_area_ha=12.0)])
    assert stats.rejected_rows == 0
    assert rows[0]["quality_flag"] == "review"
    assert "exceeds cultivated_area_ha" in rows[0]["quality_note"]
    assert rows[0]["harvested_area_ha"] == 12.0
    assert rows[0]["cultivated_area_ha"] == 10.0


def test_an_unknown_crop_code_is_flagged_not_dropped():
    rows, _ = _load([_panel_row(crop_code="CROP-NEW")])
    assert len(rows) == 1
    assert rows[0]["quality_flag"] == "unknown"


def test_a_missing_metric_stays_null():
    rows, _ = _load([_panel_row(cultivated_area_ha=None)])
    assert rows[0]["cultivated_area_ha"] is None


def test_source_table_is_attributed_only_when_a_row_has_one_table():
    single, _ = _load([_panel_row(source_sheets="Table 10")])
    assert single[0]["source_table_id"] == source_table_id("NISR_SAS_2026B", "Table 10")

    # Cultivated/harvested/production came from different tables; claiming one
    # would be inventing a precision the source does not support.
    multi, _ = _load([_panel_row(source_sheets="Table 10|Table 13|Table 16")])
    assert multi[0]["source_table_id"] is None
    assert multi[0]["metadata_json"]["source_sheets"] == ["Table 10", "Table 13", "Table 16"]


def test_national_rows_carry_no_district_code():
    rows, _ = _load(
        [
            _panel_row(
                geography_level="NATIONAL",
                geography_code="RW",
                district=None,
                district_code=None,
            )
        ]
    )
    assert rows[0]["geography_level"] == "national"
    assert rows[0]["district_code"] is None


def test_an_unknown_geography_level_is_rejected():
    rows, stats = _load([_panel_row(geography_level="SECTOR")])
    assert rows == []
    assert stats.rejected_rows == 1


# --- observations -----------------------------------------------------------


REQUIRED_FILES = (
    "district_productivity_factors.csv",
    "irrigation_water.csv",
    "erosion_control.csv",
    "crop_postharvest_use.csv",
    "national_input_trends.csv",
)


def _require_indicator_sources(processed_dir):
    for name in REQUIRED_FILES:
        require(processed_dir / name)


def test_observations_never_emit_a_row_for_a_missing_measurement(processed_dir):
    """Cells that were not measured produce no observation, not a zero."""
    _require_indicator_sources(processed_dir)
    _, crop_by_name, district_codes = dictionaries()
    rows, stats = observation_rows("0.2.0-test", crop_by_name, district_codes)

    assert stats.accepted_rows == len(rows)
    assert stats.source_rows >= stats.accepted_rows
    assert all(row["value"] is not None for row in rows)
    # Every written observation resolves to a catalogue indicator and a real unit.
    from app.data.catalogue import INDICATORS_BY_CODE, UNITS_BY_CODE

    assert all(row["indicator_code"] in INDICATORS_BY_CODE for row in rows)
    assert all(row["unit_code"] in UNITS_BY_CODE for row in rows)


def test_the_real_dictionary_resolves_every_source_file(processed_dir):
    """A published crop name the dictionary cannot resolve is a load failure.

    This is the assertion that matters: with the real dictionary the whole
    catalogue loads with nothing rejected, so a future crop-name mismatch fails
    here instead of silently shrinking the dataset.
    """
    _require_indicator_sources(processed_dir)
    _, crop_by_name, district_codes = dictionaries()
    _, stats = observation_rows("0.2.0-test", crop_by_name, district_codes)
    assert stats.rejected_rows == 0, stats.reject_reasons
    assert stats.accepted_rows > 0


def test_an_unresolvable_crop_is_rejected_rather_than_mis_keyed(processed_dir):
    require(processed_dir / "crop_postharvest_use.csv")
    # An empty name map stands in for a dictionary that has not caught up with a
    # newly published crop. The row must be rejected, never written with a null
    # or guessed crop code.
    rows, stats = observation_rows("0.2.0-test", {}, set())
    assert stats.rejected_rows > 0
    assert stats.reject_reasons["unknown_crop"] == stats.rejected_rows

    # Only crop-dimension rows were rejected, and none of the survivors is a
    # crop-dimension observation that lost its crop code.
    from app.data.catalogue import INDICATORS_BY_CODE

    for row in rows:
        definition = INDICATORS_BY_CODE[row["indicator_code"]]
        if definition.has_crop_dimension:
            assert row["crop_code"], "a crop-dimension row was written without a crop code"


def test_observations_are_keyed_uniquely(processed_dir):
    """The canonical key must match the database's unique constraint exactly.

    NISR publishes use-of-production per crop variety, so two rows can share a
    canonical crop. Without `crop_variant` in the key, three distinct published
    observations of Banana collapse into one and the loader overwrites them.
    """
    _require_indicator_sources(processed_dir)
    _, crop_by_name, district_codes = dictionaries()
    rows, _ = observation_rows("0.2.0-test", crop_by_name, district_codes)
    keys = [
        (
            row["period_id"],
            row["geography_level"],
            row["geography_code"],
            row["crop_code"],
            row["crop_variant"],
            row["farmer_scale"],
            row["indicator_code"],
        )
        for row in rows
    ]
    duplicates = [key for key, count in Counter(keys).items() if count > 1]
    assert not duplicates, f"duplicate canonical observation keys: {duplicates[:5]}"


def test_crop_varieties_are_preserved_not_collapsed(processed_dir):
    require(processed_dir / "crop_postharvest_use.csv")
    _, crop_by_name, district_codes = dictionaries()
    rows, _ = observation_rows("0.2.0-test", crop_by_name, district_codes)

    banana_sold = {
        row["crop_variant"]
        for row in rows
        if row["crop_code"] == "CROP-BAN" and row["indicator_code"] == "sold_pct"
    }
    # The three published banana varieties must survive as three rows.
    assert banana_sold == {"Cooking banana", "Dessert banana", "Banana for beer"}

    # A file whose crop column already holds the canonical name records no variant.
    assert any(row["crop_variant"] == "" for row in rows)


def test_district_observations_never_masquerade_as_national(processed_dir):
    _require_indicator_sources(processed_dir)
    _, crop_by_name, district_codes = dictionaries()
    rows, _ = observation_rows("0.2.0-test", crop_by_name, district_codes)
    district_rows = [row for row in rows if row["geography_level"] == "district"]
    assert district_rows, "expected district practice observations"
    for row in district_rows:
        assert row["district_code"], "a district observation must name its district"
        assert row["geography_code"] == row["district_code"]


def test_crop_dimension_indicators_carry_a_crop_code(processed_dir):
    _require_indicator_sources(processed_dir)
    _, crop_by_name, district_codes = dictionaries()
    rows, _ = observation_rows("0.2.0-test", crop_by_name, district_codes)

    from app.data.catalogue import INDICATORS_BY_CODE

    for row in rows:
        definition = INDICATORS_BY_CODE[row["indicator_code"]]
        if definition.has_crop_dimension:
            assert row["crop_code"], f"{row['indicator_code']} lost its crop code"
        else:
            assert row["crop_code"] is None, f"{row['indicator_code']} gained a crop code"


@pytest.mark.parametrize("filename", ["crop_postharvest_use.csv", "national_input_trends.csv"])
def test_other_indicator_files_load_or_are_absent(filename, processed_dir):
    path = processed_dir / filename
    if not path.exists():
        pytest.skip(f"{filename} not built")
    _, crop_by_name, district_codes = dictionaries()
    rows, stats = observation_rows("0.2.0-test", crop_by_name, district_codes)
    assert stats.rejected_rows == 0
    assert rows
