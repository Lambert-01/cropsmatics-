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


def test_unknown_benchmark_strategy_is_rejected_before_analytics(client):
    response = client.get(
        "/api/v1/analytics/productivity",
        params={"crop": "Maize", "benchmark_strategy": "made_up_baseline"},
    )
    assert response.status_code == 422


def test_selected_benchmark_changes_gap_output_and_is_disclosed(client):
    _require_data(client)
    median = _productivity(
        client,
        crop="Maize",
        period_code="2026B",
        benchmark_strategy="national_crop_median",
    )
    top_quartile = _productivity(
        client,
        crop="Maize",
        period_code="2026B",
        benchmark_strategy="top_quartile_comparable_districts",
    )
    assert median["provenance"]["benchmark_strategy"] == "national_crop_median"
    assert top_quartile["provenance"]["benchmark_strategy"] == (
        "top_quartile_comparable_districts"
    )
    median_row = next(row for row in median["rows"] if row["district"] == "Bugesera")
    top_row = next(row for row in top_quartile["rows"] if row["district"] == "Bugesera")
    assert top_row["benchmark_yield_kg_ha"] != pytest.approx(
        median_row["benchmark_yield_kg_ha"], abs=0.01
    )
    assert top_row["gap_index"] != pytest.approx(median_row["gap_index"], abs=0.01)


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
    """2022A would compare against 2021 Season A, which was never published."""
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2022A")
    yoy = body["yoy"]
    assert yoy["available"] is False
    assert yoy["change_pct"] is None
    assert "2021 Season A" in yoy["reason"]
    # Reported as unavailable, never as a zero change.
    assert _kpi(body, "yoy_yield")["value"] is None
    assert _kpi(body, "yoy_yield")["note"] == yoy["reason"]


def test_same_season_change_uses_2023_now_that_it_is_ingested(client):
    """2024A previously had no comparable prior season; 2023A now exists.

    This is the point of the 2022/2023 expansion: a same-season change that used
    to be reported as unavailable is now computed from a real published release.
    """
    _require_data(client)
    body = _productivity(client, crop="Maize", period_code="2024A")
    yoy = body["yoy"]
    assert yoy["previous_period_code"] == "2023A"
    assert yoy["available"] is (yoy["change_pct"] is not None)
    assert "2023 Season A" not in (yoy["reason"] or "")


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


def test_frontend_year_and_season_query_keeps_the_previous_year_comparison(client):
    """The web client always sends period_code together with year+season.

    The previous-period probe must pin a single authoritative period selector;
    keeping the stale year=2026 alongside a 2025B probe used to intersect the
    two and drop every valid previous-year observation.
    """
    _require_data(client)
    plain = _productivity(client, crop="Maize", period_code="2026B")
    triple = _productivity(
        client, crop="Maize", period_code="2026B", year=2026, season="B"
    )
    assert plain["yoy"]["available"] is True
    assert triple["yoy"]["available"] is True
    assert triple["yoy"]["previous_period_code"] == "2025B"
    assert triple["yoy"]["previous_yield_kg_ha"] == plain["yoy"]["previous_yield_kg_ha"]
    assert triple["yoy"]["change_pct"] == plain["yoy"]["change_pct"]


def test_frontend_style_query_with_a_district_still_finds_last_year(client):
    _require_data(client)
    plain = _productivity(
        client, crop="Maize", period_code="2026B", district="Bugesera"
    )
    triple = _productivity(
        client,
        crop="Maize",
        period_code="2026B",
        year=2026,
        season="B",
        district="Bugesera",
    )
    assert triple["yoy"]["available"] is plain["yoy"]["available"]
    if plain["yoy"]["available"]:
        assert triple["yoy"]["previous_yield_kg_ha"] == plain["yoy"]["previous_yield_kg_ha"]


# --- district inspection must not redefine the benchmark ----------------------


def test_inspecting_one_district_does_not_change_its_benchmark_or_gap(client):
    """The confirmed maize/2026B defect: selecting Bugesera used to replace the
    national benchmark with Bugesera's own yield and zero its gap."""
    _require_data(client)
    all_rows = _productivity(client, crop="Maize", period_code="2026B")["rows"]
    bugesera = next(r for r in all_rows if r["district"] == "Bugesera")
    assert bugesera["gap_index"] and bugesera["gap_index"] > 0, (
        "Bugesera should sit below the maize benchmark in this fixture"
    )

    scoped = _productivity(
        client, crop="Maize", period_code="2026B", district="Bugesera"
    )
    assert [r["district"] for r in scoped["rows"]] == ["Bugesera"]
    row = scoped["rows"][0]
    # Benchmark and gap must be the reference-population values, not zeros.
    assert row["benchmark_yield_kg_ha"] == pytest.approx(
        bugesera["benchmark_yield_kg_ha"], abs=1e-6
    )
    assert row["gap_index"] == pytest.approx(bugesera["gap_index"], abs=1e-6)
    assert row["gap_index"] != pytest.approx(0.0, abs=1e-9)

    observed = _kpi(scoped, "mean_yield")["value"]
    benchmark = _kpi(scoped, "benchmark_yield")["value"]
    assert observed == pytest.approx(round(bugesera["yield_kg_ha"], 1), abs=0.05)
    assert benchmark == pytest.approx(
        round(bugesera["benchmark_yield_kg_ha"], 1), abs=0.05
    )
    assert benchmark != pytest.approx(observed, abs=0.05)
    # The typical gap must be this district's real gap, not "nothing is below".
    shortfall = _kpi(scoped, "gap_shortfall")["value"]
    assert shortfall == pytest.approx(round(bugesera["gap_index"], 1), abs=0.05)


def test_the_benchmark_kpi_is_stable_across_district_selections(client):
    _require_data(client)
    base = _kpi(
        _productivity(client, crop="Maize", period_code="2026B"), "benchmark_yield"
    )["value"]
    assert base is not None
    for district in ("Bugesera", "Nyagatare"):
        scoped = _productivity(
            client, crop="Maize", period_code="2026B", district=district
        )
        assert _kpi(scoped, "benchmark_yield")["value"] == pytest.approx(base, abs=0.05)


def test_peer_benchmark_headline_matches_the_displayed_row(client):
    """A peer-group headline must describe the row the user is inspecting.

    The peer benchmark is computed over the full comparison population, but a
    district-scoped response displays that district's attached benchmark. The
    KPI and row therefore need to agree even when peer groups have different
    medians.
    """
    _require_data(client)
    body = _productivity(
        client,
        crop="Maize",
        period_code="2026B",
        district="Bugesera",
        benchmark_strategy="agro_ecological_peer_group",
    )
    assert len(body["rows"]) == 1
    row = body["rows"][0]
    headline = _kpi(body, "benchmark_yield")["value"]
    assert headline == pytest.approx(row["benchmark_yield_kg_ha"], abs=0.05)
    assert "agro_ecological_peer_group" in _kpi(body, "benchmark_yield")["note"]


def test_the_reference_block_names_the_benchmark_population(client):
    _require_data(client)
    body = _productivity(
        client, crop="Maize", period_code="2026B", district="Bugesera"
    )
    reference = body["reference"]
    assert reference is not None
    assert reference["scope"] == "national"
    assert reference["benchmark_strategy"] == "national_crop_median"
    assert reference["n_districts"] > 1
    assert reference["n_observations"] >= reference["n_districts"]
    assert "benchmark" in reference["note"]
    # The benchmark KPI must state the reference sample size.
    assert "comparable districts" in _kpi(body, "benchmark_yield")["note"]


def test_map_and_productivity_agree_on_the_same_districts_benchmark(client):
    _require_data(client)
    scoped = _productivity(
        client, crop="Maize", period_code="2026B", district="Bugesera"
    )
    row = scoped["rows"][0]
    metrics = client.get(
        "/api/v1/maps/district-metrics",
        params={
            "metric": "gap",
            "crop": "Maize",
            "period_code": "2026B",
            "district": "Bugesera",
        },
    )
    assert metrics.status_code == 200, metrics.text
    tile = next(
        d for d in metrics.json()["districts"] if d["district"] == "Bugesera"
    )
    assert tile["details"]["benchmark_yield_kg_ha"] == pytest.approx(
        row["benchmark_yield_kg_ha"], abs=0.05
    )
    assert tile["details"]["gap_index"] == pytest.approx(row["gap_index"], abs=0.05)
    assert tile["value"] == pytest.approx(row["gap_index"], abs=0.05)


def test_heatmap_gap_values_do_not_change_when_a_district_is_selected(client):
    _require_data(client)
    full = client.get(
        "/api/v1/analytics/heatmap",
        params={"crop": "Maize", "period_code": "2026B", "metric": "gap"},
    )
    assert full.status_code == 200, full.text
    cell = next(
        c for c in full.json()["cells"] if c["district"] == "Bugesera"
    )
    scoped = client.get(
        "/api/v1/analytics/heatmap",
        params={
            "crop": "Maize",
            "period_code": "2026B",
            "metric": "gap",
            "district": "Bugesera",
        },
    )
    assert scoped.status_code == 200, scoped.text
    scoped_cell = next(
        c for c in scoped.json()["cells"] if c["district"] == "Bugesera"
    )
    assert scoped_cell["value"] == pytest.approx(cell["value"], abs=1e-6)
    assert scoped_cell["value"] != 0


def test_dashboard_district_inspection_keeps_the_reference_benchmark(client):
    _require_data(client)
    prod = _productivity(client, crop="Maize", period_code="2026B")
    row = next(r for r in prod["rows"] if r["district"] == "Bugesera")
    assert row["gap_index"] and row["gap_index"] > 0
    overview = client.get(
        "/api/v1/dashboard/overview",
        params={"crop": "Maize", "period_code": "2026B", "district": "Bugesera"},
    )
    assert overview.status_code == 200, overview.text
    median_gap = next(
        k for k in overview.json()["kpis"] if k["id"] == "median_gap"
    )
    assert median_gap["value"] == pytest.approx(row["gap_index"], abs=0.15)
    assert median_gap["value"] != pytest.approx(0.0, abs=1e-6)


def test_scorecard_export_keeps_the_reference_benchmark_for_one_district(client):
    _require_data(client)
    full = client.get(
        "/api/v1/reports/district-scorecard.csv", params={"crop": "Maize", "period_code": "2026B"}
    )
    assert full.status_code == 200, full.text
    import csv
    import io

    rows = list(csv.DictReader(io.StringIO(full.text)))
    bugesera = next(r for r in rows if r["district"] == "Bugesera")
    scoped = client.get(
        "/api/v1/reports/district-scorecard.csv",
        params={"crop": "Maize", "period_code": "2026B", "district": "Bugesera"},
    )
    assert scoped.status_code == 200, scoped.text
    scoped_rows = list(csv.DictReader(io.StringIO(scoped.text)))
    assert [r["district"] for r in scoped_rows] == ["Bugesera"]
    assert float(scoped_rows[0]["gap_index"]) == pytest.approx(
        float(bugesera["gap_index"]), abs=1e-6
    )
    assert float(scoped_rows[0]["benchmark_yield_kg_ha"]) == pytest.approx(
        float(bugesera["benchmark_yield_kg_ha"]), abs=1e-6
    )
    assert float(scoped_rows[0]["gap_index"]) != 0


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
