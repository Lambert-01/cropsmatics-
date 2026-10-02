"""Yield Intelligence: same-season change, gap distribution, and the degenerate
median gap.

Three properties are pinned here, all of which protect the page from showing a
number that looks meaningful but is not:

* ``median(gap_index)`` is *identically 0* whenever the benchmark is itself a
  distribution median, because the gap is a monotone transform of yield. It must
  therefore never be a headline figure, and it must be flagged when degenerate.
* The informative gap figures are the typical shortfall among districts below
  benchmark, and the share of districts below benchmark.
* A same-season comparison compares one season with the same season one year
  earlier (2025B vs 2026B) and says so; it is never an A -> B -> C step.
"""

from __future__ import annotations

import pytest

MEDIAN_BENCHMARKS = [
    "national_crop_median",
    "national_crop_season_median",
    "agro_ecological_peer_group",
]


def _require_data(client) -> None:
    resp = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _productivity(client, **params) -> dict:
    res = client.get("/api/v1/analytics/productivity", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def _kpi(body: dict, kpi_id: str) -> dict:
    return next(k for k in body["kpis"] if k["id"] == kpi_id)


# --- the four headline KPIs ---------------------------------------------------


def test_yield_intelligence_headlines_are_the_four_crop_specific_metrics(client):
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2026B")
    ids = [kpi["id"] for kpi in body["primary_kpis"]]
    assert ids == ["mean_yield", "benchmark_yield", "gap_shortfall", "yoy_yield"]
    assert len(ids) <= 4
    # All four describe the same period and the same crop.
    assert {kpi["period_code"] for kpi in body["primary_kpis"]} == {"2026B"}
    # A headline answers "what crop is this?" without needing surrounding text.
    for kpi in body["primary_kpis"]:
        if kpi["id"] in {"mean_yield", "benchmark_yield"}:
            assert "Maize" in kpi["label"]


def test_no_crop_means_no_yield_headline(client):
    _require_data(client)
    body = _productivity(client, period_code="2026B")
    primary_ids = [kpi["id"] for kpi in body["primary_kpis"]]
    assert "mean_yield" not in primary_ids
    assert "yoy_yield" not in {kpi["id"] for kpi in body["kpis"]}
    assert body["yoy"] is None


# --- the degenerate median gap ------------------------------------------------


@pytest.mark.parametrize("strategy", MEDIAN_BENCHMARKS)
def test_median_gap_is_flagged_when_it_is_a_structural_zero(client, strategy):
    """A median benchmark makes median(gap) identically 0 - not \"no gaps\"."""
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2026B", benchmark_strategy=strategy)
    median_gap = _kpi(body, "median_gap")
    assert median_gap["value"] == pytest.approx(0.0, abs=1e-6)
    assert "by construction" in median_gap["note"]
    # ...and the informative figures are present and non-degenerate.
    assert body["gap_summary"]["median_is_degenerate"] is True
    assert body["gap_summary"]["districts_below"] > 0
    assert _kpi(body, "gap_shortfall")["value"] > 0


def test_median_gap_is_not_flagged_for_a_non_median_benchmark(client):
    _require_data(client)
    body = _productivity(
        client,
        crop="Maize",
        period_code="2026B",
        benchmark_strategy="top_quartile_comparable_districts",
    )
    median_gap = _kpi(body, "median_gap")
    assert body["gap_summary"]["median_is_degenerate"] is False
    assert "by construction" not in median_gap["note"]
    assert median_gap["value"] != pytest.approx(0.0, abs=1e-6)


def test_gap_shortfall_is_the_median_shortfall_of_districts_below_benchmark(client):
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2026B")
    below = [row["gap_index"] for row in body["rows"] if row["gap_index"] and row["gap_index"] > 0]
    assert below, "the fixture should have districts below benchmark"
    shortfall = _kpi(body, "gap_shortfall")["value"]
    assert shortfall == pytest.approx(sorted(below)[len(below) // 2], abs=0.05)
    assert _kpi(body, "below_benchmark_share")["value"] == pytest.approx(
        100.0 * len(below) / len(body["rows"]), abs=0.1
    )


# --- the gap distribution ----------------------------------------------------


def test_gap_bands_count_every_district_and_publish_their_cut_points(client):
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2026B")
    bands = body["gap_bands"]
    assert [band["id"] for band in bands] == [
        "above_benchmark",
        "near_benchmark",
        "moderate_gap",
        "high_gap",
    ]
    assert sum(band["count"] for band in bands) == len(body["rows"])
    assert sum(band["share_pct"] for band in bands) == pytest.approx(100.0, abs=0.2)
    # The high band starts at the documented high-gap threshold, not an invented one.
    high = next(band for band in bands if band["id"] == "high_gap")
    assert high["min_pct"] == 25.0
    assert high["max_pct"] is None


# --- same-season year-on-year -------------------------------------------------


def test_same_season_change_matches_the_two_period_means(client):
    _require_data(client)
    current = _productivity(client, crop="Maize", period_code="2026B")
    previous = _productivity(client, crop="Maize", period_code="2025B")
    yoy = current["yoy"]

    assert yoy["available"] is True
    assert yoy["period_code"] == "2026B"
    assert yoy["previous_period_code"] == "2025B"
    assert yoy["previous_period_label"] == "2025 Season B"

    current_mean = _kpi(current, "mean_yield")["value"]
    previous_mean = _kpi(previous, "mean_yield")["value"]
    assert yoy["current_yield_kg_ha"] == pytest.approx(current_mean, abs=0.1)
    assert yoy["previous_yield_kg_ha"] == pytest.approx(previous_mean, abs=0.1)
    expected = round(100.0 * (current_mean - previous_mean) / previous_mean, 1)
    assert yoy["change_pct"] == pytest.approx(expected, abs=0.2)


def test_same_season_change_is_labelled_with_the_comparison_period(client):
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2026B")
    kpi = _kpi(body, "yoy_yield")
    assert kpi["unit"] == "%"
    assert kpi["note"] == "Maize vs 2025 Season B (2025B)"
    assert "same-season" in body["yoy"]["note"]


def test_same_season_change_explains_when_the_previous_release_is_absent(client):
    """2024A would compare against 2023 Season A, which was never published."""
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2024A")
    yoy = body["yoy"]
    assert yoy["available"] is False
    assert yoy["change_pct"] is None
    assert "2023 Season A" in yoy["reason"]
    # Reported as unavailable, never as a zero change.
    assert _kpi(body, "yoy_yield")["value"] is None
    assert _kpi(body, "yoy_yield")["note"] == yoy["reason"]


def test_same_season_change_explains_when_the_crop_was_not_tabulated(client):
    """Maize is not tabulated in the Season C releases."""
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2025C")
    assert body["rows"] == []
    assert body["kpis"] == []
    yoy = body["yoy"]
    assert yoy["available"] is False
    assert yoy["previous_period_code"] == "2024C"
    assert "2024 Season C" in yoy["reason"]


def test_same_season_change_honours_the_district_filter(client):
    _require_data(client)
    scoped = _productivity(client, crop="Maize", period_code="2026B", district="Nyagatare")
    national = _productivity(client, crop="Maize", period_code="2026B")
    assert scoped["yoy"]["district"] == "Nyagatare"
    assert scoped["yoy"]["current_yield_kg_ha"] != national["yoy"]["current_yield_kg_ha"]


def test_consecutive_seasons_are_not_presented_as_a_series(client):
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2026B")
    joined = " ".join(body["provenance"]["limitations"])
    assert "same season one year earlier" in joined
    assert "not a time series" in joined


# --- the dashboard must not headline the degenerate figure either -------------


def test_dashboard_headlines_the_typical_gap_not_the_median(client):
    _require_data(client)
    body = client.get(
        "/api/v1/dashboard/overview", params={"crop": "Maize", "period_code": "2026B"}
    ).json()
    primary_ids = [kpi["id"] for kpi in body["primary_kpis"]]
    assert "median_gap" not in primary_ids
    assert "gap_shortfall" in primary_ids
    median_gap = next(k for k in body["kpis"] if k["id"] == "median_gap")
    assert "by construction" in median_gap["note"]
