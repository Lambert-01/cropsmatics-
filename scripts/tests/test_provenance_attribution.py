"""Source-table attribution for normalized observations.

Everything here is about *not* inventing precision. A description that names one
table yields that table; one that names several, or none, yields the release-level
row plus the honest reference list - never a single table it did not come from.
"""

from __future__ import annotations

from app.data.catalogue import (
    dataset_table_id,
    observation_source_attribution,
    parse_table_references,
    source_table_id,
)


def test_a_single_table_reference_is_read():
    assert parse_table_references("NISR SAS 2025 Season B - Table 14") == ["Table 14"]


def test_a_table_range_is_expanded():
    assert parse_table_references("NISR SAS 2025 Season B - Tables 30-31") == [
        "Table 30",
        "Table 31",
    ]


def test_a_description_without_a_reference_yields_nothing():
    """An honest empty list, not a guessed table."""
    assert parse_table_references("NISR SAS 2025 Season B - uploaded table workbook") == []
    assert parse_table_references(None) == []
    assert parse_table_references("") == []


def test_a_word_range_is_understood():
    assert parse_table_references("See Table 8 to 9") == ["Table 8", "Table 9"]


def test_a_pathological_range_does_not_explode():
    """A bad number in source text must not expand into thousands of rows."""
    assert parse_table_references("Table 5-9999") == ["Table 5"]


def test_one_named_table_attributes_the_observation_to_that_worksheet():
    table_id, references = observation_source_attribution(
        "NISR_SAS_2025B_POSTHARVEST_USE", "NISR SAS 2025 Season B - Table 14"
    )
    assert table_id == source_table_id("NISR_SAS_2025B_POSTHARVEST_USE", "Table 14")
    assert references == ["Table 14"]


def test_several_tables_attribute_the_observation_to_the_release():
    """A multi-table extract must not claim a single worksheet."""
    table_id, references = observation_source_attribution(
        "NISR_SAS_2025B_IRRIGATION_WATER", "NISR SAS 2025 Season B - Tables 30-31"
    )
    assert table_id == dataset_table_id("NISR_SAS_2025B_IRRIGATION_WATER")
    assert references == ["Table 30", "Table 31"]


def test_no_table_reference_attributes_the_observation_to_the_release():
    table_id, references = observation_source_attribution(
        "NISR_SAS_2025B_DISTRICT_FACTORS",
        "NISR SAS 2025 Season B - uploaded official table workbook",
    )
    assert table_id == dataset_table_id("NISR_SAS_2025B_DISTRICT_FACTORS")
    assert references == []
