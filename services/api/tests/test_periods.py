"""Tests for the period dimension and period-aware endpoints.

The published periods are a property of the data, not of the code: these tests
assert that the API derives the eight periods NISR has released (2024A-2026B),
that an unpublished season (2026C) is rejected rather than silently answered, and
that a period filter changes which rows are returned while keeping the existing
defaults intact.
"""

from __future__ import annotations

import pytest

EXPECTED_PERIODS = [
    "2024A", "2024B", "2024C",
    "2025A", "2025B", "2025C",
    "2026A", "2026B",
]


def _require_periods(client) -> dict:
    res = client.get("/api/v1/meta/periods")
    if res.status_code != 200:
        pytest.skip("period catalogue unavailable")
    body = res.json()
    if not body["periods"]:
        pytest.skip("processed tables not built; run `make data`")
    return body


# --- the catalogue ----------------------------------------------------------


def test_published_periods_are_exactly_the_released_ones(client):
    body = _require_periods(client)
    codes = [p["period_code"] for p in body["periods"]]
    assert codes == EXPECTED_PERIODS
    assert body["count"] == 8
    assert body["latest"] == "2026B"
    assert body["latest_district"] == "2026B"
    # 2026 Season C has not been published - it must never be advertised.
    assert "2026C" not in codes


def test_each_period_is_labelled_and_flagged(client):
    body = _require_periods(client)
    for index, period in enumerate(body["periods"]):
        year, season = period["period_code"][:4], period["period_code"][4]
        assert period["year"] == int(year)
        assert period["season"] == season
        assert period["label"] == f"{year} Season {season}"
        assert period["is_latest"] is (period["period_code"] == body["latest"])
        assert period["is_latest_district"] is (
            period["period_code"] == body["latest_district"]
        )
        assert index == EXPECTED_PERIODS.index(period["period_code"])


def test_periods_report_real_coverage_and_datasets(client):
    body = _require_periods(client)
    for period in body["periods"]:
        assert period["coverage_level"] == "district"
        assert period["n_districts"] == 30
        assert period["n_crops"] > 0
        datasets = {d["dataset"] for d in period["datasets"]}
        assert "crop_productivity" in datasets, period["period_code"]

    # Season C releases tabulate fewer crops than the A/B releases.
    by_code = {p["period_code"]: p for p in body["periods"]}
    assert by_code["2024C"]["n_crops"] < by_code["2024A"]["n_crops"]


# --- period validation ------------------------------------------------------


@pytest.mark.parametrize(
    "endpoint",
    [
        "/api/v1/productivity",
        "/api/v1/analytics/productivity",
        "/api/v1/analytics/heatmap",
        "/api/v1/dashboard/overview",
    ],
)
def test_unpublished_period_is_rejected_not_answered(client, endpoint):
    _require_periods(client)
    res = client.get(endpoint, params={"period_code": "2026C"})
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert "2026C" in detail
    assert "2024A" in detail  # the message lists what exists


@pytest.mark.parametrize("bad", ["2025X", "25B", "2025", "recent"])
def test_malformed_period_is_rejected(client, bad):
    _require_periods(client)
    assert client.get("/api/v1/productivity", params={"period_code": bad}).status_code == 422


# --- period-aware productivity ---------------------------------------------


def test_panel_endpoint_defaults_to_the_latest_district_period(client):
    body = _require_periods(client)
    res = client.get("/api/v1/productivity", params={"limit": 1})
    assert res.status_code == 200
    payload = res.json()
    assert payload["period_code"] == body["latest_district"]
    assert payload["defaulted_to_latest"] is True
    assert payload["available_periods"] == EXPECTED_PERIODS
    assert payload["provenance"]["source_period"] == body["latest_district"]
    assert payload["provenance"]["source_id"].startswith("NISR_SAS_")


def test_panel_endpoint_filters_by_period_crop_and_district(client):
    _require_periods(client)
    res = client.get(
        "/api/v1/productivity",
        params={"period_code": "2024C", "crop": "Groundnut", "limit": 1000},
    )
    assert res.status_code == 200
    rows = res.json()["rows"]
    assert rows, "Season C publishes Groundnut"
    assert {row["period_code"] for row in rows} == {"2024C"}
    assert {row["canonical_crop_name"] for row in rows} == {"Groundnut"}
    assert len({row["district"] for row in rows}) == 30

    one = client.get(
        "/api/v1/productivity",
        params={"period_code": "2024C", "district": "Bugesera", "limit": 1000},
    ).json()
    assert {row["district"] for row in one["rows"]} == {"Bugesera"}


def test_national_rows_are_opt_in_only(client):
    _require_periods(client)
    district = client.get(
        "/api/v1/productivity", params={"period_code": "2025B", "crop": "Maize"}
    ).json()
    assert {row["geography_level"] for row in district["rows"]} == {"DISTRICT"}

    national = client.get(
        "/api/v1/productivity",
        params={"period_code": "2025B", "crop": "Maize", "geography_level": "NATIONAL"},
    ).json()
    assert national["rows"]
    assert {row["geography_level"] for row in national["rows"]} == {"NATIONAL"}
    assert all(row["district"] is None for row in national["rows"])


def test_2025b_panel_matches_the_legacy_dataset_endpoint(client):
    """The same season must not report two different numbers."""
    _require_periods(client)
    panel = client.get(
        "/api/v1/productivity", params={"period_code": "2025B", "crop": "Maize"}
    ).json()
    legacy = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"crop": "Maize", "season": "B", "limit": 1000},
    ).json()

    assert panel["rows"] and legacy["rows"]
    new_by_district = {row["district"]: row["yield_kg_ha"] for row in panel["rows"]}
    old_by_district = {row["district"]: row["yield_kg_ha"] for row in legacy["rows"]}
    assert set(new_by_district) == set(old_by_district)
    for district, value in old_by_district.items():
        if value is None:
            assert new_by_district[district] is None
        else:
            assert new_by_district[district] == pytest.approx(value, abs=1e-6)


def test_trend_spans_the_published_periods(client):
    _require_periods(client)
    res = client.get("/api/v1/productivity/trend", params={"crop": "Maize"})
    assert res.status_code == 200
    body = res.json()
    assert body["geography_scope"] == "national"

    codes = [point["period_code"] for point in body["points"]]
    assert codes == [code for code in EXPECTED_PERIODS if code in codes], "chronological"
    # Maize is not tabulated in the Season C releases, so it has no Season C point.
    assert all(code not in {"2024C", "2025C"} for code in codes)
    assert "2026B" in codes
    assert set(codes) <= set(body["available_periods"])
    assert body["provenance"]["source_period"] == "2024A-2026B"


def test_trend_for_a_district_is_the_district_series(client):
    _require_periods(client)
    body = client.get(
        "/api/v1/productivity/trend",
        params={"crop": "Maize", "district": "Bugesera", "season": "B"},
    ).json()
    assert body["geography_scope"] == "district"
    assert body["district"] == "Bugesera"
    codes = [point["period_code"] for point in body["points"]]
    assert codes == ["2024B", "2025B", "2026B"]
    for point in body["points"]:
        assert point["values"]["yield_kg_ha"] is not None


def test_trend_rejects_a_crop_with_no_published_rows(client):
    _require_periods(client)
    res = client.get("/api/v1/productivity/trend", params={"crop": "Unobtainium"})
    assert res.status_code == 404


# --- period filters on the existing analytics -------------------------------


def test_analytics_default_is_unchanged_without_a_period(client):
    _require_periods(client)
    plain = client.get("/api/v1/analytics/productivity", params={"limit": 5}).json()
    explicit = client.get(
        "/api/v1/analytics/productivity", params={"period_code": "2025B", "limit": 5}
    ).json()
    # The legacy district analytics still default to the 2025 Season B table.
    assert plain["n_observations"] == explicit["n_observations"]
    assert plain["provenance"]["source_period"] == "2025-B"
    assert explicit["provenance"]["source_period"] == "2025B"


def test_analytics_serves_the_other_published_periods(client):
    _require_periods(client)
    body = client.get(
        "/api/v1/analytics/productivity", params={"period_code": "2024A", "limit": 5}
    ).json()
    assert body["n_observations"] > 0
    assert body["provenance"]["source_period"] == "2024A"
    assert body["provenance"]["source_id"].startswith("NISR_SAS_2024")
    assert any(row["district"] for row in body["rows"])


def test_heatmap_honours_the_period_filter(client):
    _require_periods(client)
    body = client.get(
        "/api/v1/analytics/heatmap", params={"period_code": "2026B", "metric": "yield"}
    ).json()
    assert body["cells"]
    assert body["districts"]
    assert body["provenance"]["source_period"] == "2026B"


def test_factor_analysis_says_when_a_period_has_no_factor_data(client):
    _require_periods(client)
    current = client.get("/api/v1/analytics/factors", params={"crop": "Maize"}).json()
    assert current["factors"]
    assert current["note"] is None

    other = client.get(
        "/api/v1/analytics/factors", params={"crop": "Maize", "period_code": "2024A"}
    ).json()
    # Explained, never presented as "no association measured": the district
    # factor table is a single release, so every factor reports no observations.
    assert other["note"] and "2024A" in other["note"]
    assert other["factors"], "the factor list still describes what would be measured"
    assert all(factor["n_observations"] == 0 for factor in other["factors"])
    assert all(factor["correlation"] is None for factor in other["factors"])


def test_irrigation_and_erosion_explain_single_release_periods(client):
    _require_periods(client)
    for endpoint in ("/api/v1/analytics/irrigation", "/api/v1/analytics/erosion"):
        ok = client.get(endpoint, params={"period_code": "2025B"}).json()
        assert ok["districts"]
        assert ok["note"] is None

        other = client.get(endpoint, params={"period_code": "2024A"}).json()
        assert other["districts"] == []
        assert other["note"] and "2024A" in other["note"]


# --- dataset explorer -------------------------------------------------------


def test_dataset_explorer_exposes_the_multi_period_panel(client):
    _require_periods(client)
    listing = client.get("/api/v1/meta/dataset").json()["datasets"]
    keys = {d["key"] for d in listing}
    assert {"crop_productivity", "district_crop_productivity"} <= keys

    body = client.get(
        "/api/v1/meta/dataset/crop_productivity",
        params={"period_code": "2025B", "crop": "Maize", "limit": 5},
    ).json()
    assert body["rows"]
    assert {row["period_code"] for row in body["rows"]} == {"2025B"}
    assert {row["canonical_crop_name"] for row in body["rows"]} == {"Maize"}

    # A period filter is only accepted where a period dimension exists: asking a
    # single-release crop table for one is refused rather than silently ignored.
    rejected = client.get(
        "/api/v1/meta/dataset/crop_postharvest_use", params={"period_code": "2025B"}
    )
    assert rejected.status_code == 400
    assert "not supported" in rejected.json()["detail"]
