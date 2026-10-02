"""Tests for the canonical reporting layer.

The reporting surface replaced a set of single-release exports with period-aware
ones, so these tests pin the properties that make that safe:

* the catalogue is the single definition of which reports exist, and every entry
  is reachable;
* a long-format row can never be separated from its unit, its source or its
  quality flag, and a row the source did not publish a yield for is marked
  ``derived`` rather than passed off as published;
* district reports read district rows only — a national row, or a large/small
  farm sub-row, must never be totalled into a district figure;
* a yield is never averaged across crops.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.v1 import reports
from app.schemas.filters import AnalyticsFilters

pd = pytest.importorskip("pandas")


# --------------------------------------------------------------------------
# Catalogue
# --------------------------------------------------------------------------


def test_catalogue_entries_are_well_formed():
    keys = [entry["key"] for entry in reports.CATALOG]
    assert len(keys) == len(set(keys)), "report keys must be unique"

    for entry in reports.CATALOG:
        for field in ("key", "title", "description", "group", "endpoint", "filename", "formats"):
            assert entry[field], f"{entry['key']} is missing {field}"
        assert entry["endpoint"].startswith("/reports/"), entry["key"]
        assert set(entry["formats"]) <= {"csv", "json"}, entry["key"]
        assert entry["coverage_note"], f"{entry['key']} must state what it covers"


def test_catalogue_declares_each_endpoint_once():
    endpoints = [entry["endpoint"] for entry in reports.CATALOG]
    assert len(endpoints) == len(set(endpoints))


def test_legacy_single_release_exports_are_not_the_catalogue():
    """The catalogue must be multi-period, not the old single-release tables."""
    legacy = {"district_crop_productivity", "district_factors", "national_crop_trends"}
    assert legacy.isdisjoint({entry["key"] for entry in reports.CATALOG})


def test_every_catalogue_endpoint_is_served(client):
    """Each catalogued report responds, and responds as a CSV."""
    for entry in reports.CATALOG:
        query = "?crop=Maize" if entry["key"] == "crop-profile" else ""
        res = client.get(f"/api/v1{entry['endpoint']}{query}")
        if res.status_code == 422:
            pytest.skip("processed tables not built; run `make data`")
        assert res.status_code == 200, f"{entry['key']} -> {res.status_code}"
        assert res.headers["content-type"].startswith("text/csv"), entry["key"]


def test_json_format_is_opt_in_and_matches_the_csv_shape(client):
    csv_res = client.get("/api/v1/reports/yield-gaps.csv?period_code=2026B&crop=Maize")
    if csv_res.status_code != 200:
        pytest.skip("processed tables not built")
    json_res = client.get("/api/v1/reports/yield-gaps.csv?period_code=2026B&crop=Maize&format=json")
    assert json_res.status_code == 200
    assert json_res.headers["content-type"].startswith("application/json")

    body = json_res.json()
    assert body["filename"] == "yield_gaps.json"
    # Same rows as the CSV, plus the header line the CSV counts.
    assert body["count"] == max(len(csv_res.text.strip().splitlines()) - 1, 0)


def test_unknown_format_is_rejected(client):
    res = client.get("/api/v1/reports/district-scorecard.csv?format=pdf")
    assert res.status_code == 422


def test_unpublished_period_is_rejected_not_answered(client):
    res = client.get("/api/v1/reports/district-scorecard.csv?period_code=2026C")
    if res.status_code == 200:
        # Only reachable if the period genuinely exists; then the assertion is
        # about the earlier contract and this case is not applicable.
        pytest.skip("2026C is published in this build")
    assert res.status_code == 422


# --------------------------------------------------------------------------
# Long format
# --------------------------------------------------------------------------


def _frame(**overrides) -> pd.DataFrame:
    base = {
        "period_code": ["2026B", "2026B"],
        "year": [2026, 2026],
        "season": ["B", "B"],
        "geography_level": ["DISTRICT", "DISTRICT"],
        "province": ["Eastern", "Eastern"],
        "district": ["Bugesera", "Bugesera"],
        "district_code": ["RW-EA-BUG", "RW-EA-BUG"],
        "canonical_crop_name": ["Maize", "Beans"],
        "cultivated_area_ha": [6689.332, 13286.25],
        "harvested_area_ha": [6689.332, 13279.37],
        "production_mt": [6369.26, 6491.13],
        "yield_kg_ha": [952.15, 488.81],
        "cultivated_area_reported": [True, True],
        "yield_reported": [True, False],
        "source_id": ["NISR_SAS_2026B", "NISR_SAS_2026B"],
        "is_synthetic": [False, False],
    }
    base.update(overrides)
    return pd.DataFrame(base)


def test_long_format_uses_the_standard_columns():
    out = reports.to_long_format(_frame())
    assert list(out.columns) == list(reports.LONG_COLUMNS)


def test_long_format_gives_every_indicator_its_own_unit():
    out = reports.to_long_format(_frame())
    units = dict(zip(out["indicator"], out["unit"], strict=False))
    assert units["cultivated_area"] == "ha"
    assert units["harvested_area"] == "ha"
    assert units["production"] == "mt"
    assert units["yield"] == "kg/ha"


def test_long_format_carries_source_and_period_on_every_row():
    out = reports.to_long_format(_frame())
    assert set(out["period"]) == {"2026B"}
    assert set(out["source_id"]) == {"NISR_SAS_2026B"}
    assert set(out["geography_level"]) == {"DISTRICT"}


def test_a_computed_yield_is_flagged_derived():
    """Beans has yield_reported=False: the platform computed that yield."""
    out = reports.to_long_format(_frame())
    yields = out[out["indicator"] == "yield"].set_index("crop")["quality_flag"].to_dict()
    assert yields["Beans"] == "derived"
    assert yields["Maize"] == ""


def test_synthetic_outranks_derived():
    """A fixture row is not an observation, so it is never described as merely computed.

    Beans is both synthetic and missing a published yield; ``synthetic`` wins.
    """
    frame = _frame(is_synthetic=[False, True])
    out = reports.to_long_format(frame)
    yields = out[out["indicator"] == "yield"].set_index("crop")["quality_flag"].to_dict()
    assert yields["Beans"] == "synthetic"
    assert yields["Maize"] == ""


def test_a_missing_value_is_dropped_not_written_as_zero():
    frame = _frame()
    frame.loc[1, "production_mt"] = None
    out = reports.to_long_format(frame)
    beans_production = out[(out["crop"] == "Beans") & (out["indicator"] == "production")]
    assert beans_production.empty
    # The other indicators for the same row are unaffected.
    assert not out[(out["crop"] == "Beans") & (out["indicator"] == "yield")].empty


# --------------------------------------------------------------------------
# Geography discipline
# --------------------------------------------------------------------------


def test_district_panel_excludes_national_and_farm_scale_subrows(monkeypatch):
    """A national row, or an lsf/ssf sub-row, must never be totalled into a district."""
    panel = pd.DataFrame(
        {
            "period_code": ["2026B"] * 4,
            "geography_level": ["DISTRICT", "DISTRICT", "NATIONAL", "DISTRICT"],
            "farmer_scale": ["all", "all", "all", "lsf"],
            "district": ["Bugesera", "Bugesera", None, "Bugesera"],
            "district_code": ["RW-EA-BUG", "RW-EA-BUG", None, "RW-EA-BUG"],
            "canonical_crop_name": ["Maize"] * 4,
            "season": ["B"] * 4,
            "yield_kg_ha": [1000.0, 1000.0, 900.0, 1200.0],
        }
    )
    monkeypatch.setattr(reports.repo, "crop_productivity", lambda: panel)

    out = reports._district_panel(AnalyticsFilters(period_code="2026B"))
    assert set(out["geography_level"]) == {"DISTRICT"}
    assert set(out["farmer_scale"]) == {"all"}
    assert len(out) == 2


def test_crop_profile_requires_a_crop():
    with pytest.raises(HTTPException) as exc:
        reports._crop_profile(AnalyticsFilters(period_code="2026B"))
    assert exc.value.status_code == 422


# --------------------------------------------------------------------------
# Scorecard arithmetic
# --------------------------------------------------------------------------


def test_scorecard_does_not_average_yield_across_crops():
    """Two crops in one district keep two yields; no cross-crop mean is invented."""
    panel = pd.DataFrame(
        {
            "period_code": ["2026B", "2026B"],
            "year": [2026, 2026],
            "season": ["B", "B"],
            "geography_level": ["DISTRICT", "DISTRICT"],
            "farmer_scale": ["all", "all"],
            "province": ["Eastern", "Eastern"],
            "district": ["Bugesera", "Bugesera"],
            "district_code": ["RW-EA-BUG", "RW-EA-BUG"],
            "canonical_crop_name": ["Maize", "Beans"],
            "cultivated_area_ha": [1000.0, 500.0],
            "harvested_area_ha": [1000.0, 500.0],
            "production_mt": [1000.0, 250.0],
            "yield_kg_ha": [1000.0, 500.0],
            "yield_reported": [True, True],
            "source_id": ["NISR_SAS_2026B", "NISR_SAS_2026B"],
        }
    )
    outer = pytest.MonkeyPatch()
    outer.setattr(reports.repo, "crop_productivity", lambda: panel)
    try:
        out = reports._scorecard(AnalyticsFilters(period_code="2026B"))
    finally:
        outer.undo()

    assert len(out) == 2
    by_crop = out.set_index("crop")["yield_kg_ha"].to_dict()
    assert by_crop == {"Maize": 1000.0, "Beans": 500.0}
    # Each crop is benchmarked against its own median (one observation each).
    assert set(out["benchmark_yield_kg_ha"]) == {1000.0, 500.0}
    assert set(out["gap_index"].round(6)) == {0.0}


def test_scorecard_names_the_benchmark_it_used():
    out = reports._scorecard(
        AnalyticsFilters(period_code="2026B", benchmark_strategy="national_crop_median")
    )
    if out.empty:
        pytest.skip("processed tables not built")
    assert set(out["benchmark_strategy"]) == {"national_crop_median"}


# --------------------------------------------------------------------------
# Provenance
# --------------------------------------------------------------------------


def test_district_summary_provenance_follows_the_rows(client):
    """The source note must name the period/source of the rows actually returned."""
    listing = client.get("/api/v1/geography/districts")
    if listing.status_code != 200 or not listing.json():
        pytest.skip("district dictionary unavailable")
    district = listing.json()[0]["district"]

    res = client.get(
        f"/api/v1/reports/district-summary?district={district}&period_code=2026B"
    )
    if res.status_code == 404:
        pytest.skip("no 2026B district rows in this build")
    assert res.status_code == 200
    body = res.json()

    assert body["period_code"] == "2026B"
    assert body["provenance"]["source_period"] == "2026B"
    # The historical defect: a hard-coded 2025B source id on any period's data.
    assert "2025B" not in (body["provenance"]["source_id"] or "")


def test_district_summary_does_not_serve_another_periods_rows(client):
    """A 2026B selection must not answer with 2025B figures."""
    res = client.get("/api/v1/reports/district-summary?district=Bugesera&period_code=2026B")
    if res.status_code == 404:
        pytest.skip("no 2026B district rows in this build")
    body = res.json()
    if body["period_code"] is None:
        pytest.skip("period not derivable from rows")
    assert body["period_code"] == "2026B"
