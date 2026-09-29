"""Unit-aware observation bounds.

The database expresses what it can (nothing negative). The unit-aware rule - a
share cannot exceed 100 - lives in the loader, because a CHECK constraint cannot
join ``unit``. These tests pin that rule, including the case that motivated it: a
large hectare total is legitimate and must not be rejected.
"""

from __future__ import annotations

from scripts.data.load_postgres import validate_observation_value


def test_a_share_is_bounded_at_100():
    assert validate_observation_value("sold_pct", "percent_production", 100) is None
    assert (
        validate_observation_value("sold_pct", "percent_production", 100.01)
        == "share_above_100:sold_pct"
    )


def test_a_large_physical_area_is_allowed():
    """102,013 ha of agroforestry is real published data, not an error."""
    assert validate_observation_value("agroforestry_area_ha", "hectare", 102013.2) is None


def test_a_negative_value_is_rejected_for_any_unit():
    assert validate_observation_value("sold_pct", "percent_production", -0.01) == "negative_value"
    assert validate_observation_value("agroforestry_area_ha", "hectare", -1) == "negative_value"


def test_zero_is_a_valid_observation():
    assert validate_observation_value("ditches_pct", "percent_area", 0) is None
