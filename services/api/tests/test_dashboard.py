"""Tests for the dashboard, analytics, map, meta and facility endpoints.

These exercise the real processed tables produced by the data pipeline.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.analytics.productivity_gap import compute_gaps
from app.schemas.filters import AnalyticsFilters
from app.services import analytics_service, trend_service
from scripts.data.common import VALID_PERIODS


def _require_data(client) -> None:
    """Skip when the processed tables have not been built in this environment."""
    resp = client.get("/api/v1/dashboard/overview")
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")


def test_dashboard_overview(client):
    _require_data(client)
    resp = client.get("/api/v1/dashboard/overview")
    assert resp.status_code == 200
    body = resp.json()
    assert body["available_periods"]
    assert "2025B" in body["coverage"]
    ids = {k["id"] for k in body["kpis"]}
    # No crop selected: no yield KPI at all (raw crop yields are not comparable).
    assert "avg_yield" not in ids
    assert {"districts", "crops", "median_gap", "high_gap", "total_production"} <= ids
    districts = next(k for k in body["kpis"] if k["id"] == "districts")
    assert districts["value"] == 30
    # No release is selected here, so this is the history scope and the district
    # KPIs describe the *latest published district release* - not whatever table
    # happened to be the default. It used to report the legacy 2025B pack while
    # the UI called the view "All periods".
    assert body["scope"] == "history"
    assert body["snapshot"]["period_code"] == "2026B"
    assert districts["period_code"] == body["snapshot"]["period_code"]


def test_default_overview_names_the_release_it_reports(client):
    """The default view may not present a one-release snapshot as "all periods".

    Whichever release the district panels use, the response has to name it so a
    client can label it. A default of the legacy 2025B table would also be wrong
    on the data's own terms: 2026B is published and carries district rows.
    """
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview").json()
    assert body["scope"] == "history"
    snapshot = body["snapshot"]
    assert snapshot and snapshot["period_code"]
    assert snapshot["coverage_level"] == "district"
    assert snapshot["label"] == "2026 Season B"
    assert snapshot["period_code"] == body["effective_filters"]["period_code"]
    # Every district figure in the headline strip shares that one release.
    for kpi in body["primary_kpis"]:
        assert kpi["period_code"] == snapshot["period_code"]


def test_history_scope_carries_the_published_period_timeline(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview").json()
    timeline = body["period_timeline"]
    assert [p["period_code"] for p in timeline] == body["available_periods"]
    # The timeline is the published period dimension itself (2022A-2026B), not a
    # literal count, so a new release extends it instead of failing the check.
    assert [p["period_code"] for p in timeline] == list(VALID_PERIODS)
    # Each entry names its own coverage, so a district map cannot be drawn from a
    # period that only published national rows.
    assert all(p["coverage_level"] for p in timeline)
    latest = [p for p in timeline if p["is_latest_district"]]
    assert len(latest) == 1
    assert latest[0]["period_code"] == body["snapshot"]["period_code"]


def test_selecting_a_period_is_a_period_scope_not_a_history_snapshot(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?period_code=2024B").json()
    assert body["scope"] == "period"
    # A selected release is the selection itself: there is no separate snapshot.
    assert body["snapshot"] is None
    # The published axis is still served, so a reader can switch release - it is
    # just not presented as a snapshot.
    assert "2024B" in [p["period_code"] for p in body["period_timeline"]]
    assert body["period_code"] == "2024B"
    assert body["effective_filters"]["period_code"] == "2024B"
    for kpi in body["primary_kpis"]:
        assert kpi["period_code"] == "2024B"


def test_overview_primary_kpis_are_at_most_four_and_same_scope(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview").json()
    primary = body["primary_kpis"]
    assert 0 < len(primary) <= 4
    # The headline strip is one analytical snapshot: no cross-period context.
    assert all(kpi["scope"] == "selection" for kpi in primary)
    assert {kpi["period_code"] for kpi in primary} == {body["period_code"]}
    # Everything else is secondary and never a headline card.
    primary_ids = {kpi["id"] for kpi in primary}
    assert not (primary_ids & {kpi["id"] for kpi in body["secondary_kpis"]})


def test_overview_context_kpis_carry_their_own_period(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?period_code=2026B").json()
    context = {k["id"]: k for k in body["kpis"] if k["scope"] == "context"}
    assert context, "single-release context figures must be labelled as such"
    # A 2025B context figure must never masquerade as the selected 2026B period.
    assert context["input_adoption"]["period_code"] == "2025B"
    assert context["postharvest_loss"]["period_code"] == "2025B"
    for kpi in context.values():
        assert kpi["period_code"] != body["period_code"] or kpi["period_code"] is None


def test_overview_yield_is_crop_specific_when_a_crop_is_selected(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?crop=Maize").json()
    ids = {k["id"] for k in body["kpis"]}
    assert "avg_yield" in ids
    yield_kpi = next(k for k in body["kpis"] if k["id"] == "avg_yield")
    assert "Maize" in yield_kpi["label"]
    assert yield_kpi["note"] == "Maize only"
    primary_ids = [k["id"] for k in body["primary_kpis"]]
    assert len(primary_ids) <= 4
    assert "avg_yield" in primary_ids


def test_period_with_district_panel_reports_district_coverage(client):
    """2024B carries real district productivity in the multi-period panel.

    It used to be national-only context when the platform had a single-release
    (2025B) district extract; the panel changed that, and the dashboard must
    follow the data rather than the old limitation.
    """
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?period_code=2024B").json()
    assert body["coverage_level"] == "district"
    assert body["n_observations"] > 0
    assert next(k for k in body["kpis"] if k["id"] == "districts")["value"] == 30
    assert body["provenance"]["source_period"] == "2024B"
    assert body["provenance"]["source_id"].startswith("NISR_SAS_2024")


def test_latest_panel_period_is_served(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?period_code=2026B").json()
    assert body["coverage_level"] == "district"
    assert body["n_observations"] > 0
    assert body["provenance"]["source_id"] == "NISR_SAS_2026B"
    assert "2026B" in body["available_periods"]
    # District input/practice factors are still a single-release table, so the
    # adoption KPI is null here rather than borrowed from another season.
    assert next(k for k in body["kpis"] if k["id"] == "input_adoption")["value"] is None


def test_unknown_period_falls_back_to_national_context_without_inventing(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?year=2019&season=A").json()
    assert body["coverage_level"] is None
    assert body["n_observations"] == 0
    assert {k["id"] for k in body["kpis"]} == {
        "national_production", "national_area", "national_yield", "national_seed"
    }
    # No published rows for that period: every value stays null, never 0.
    for kpi in body["kpis"]:
        if kpi["id"].startswith("national_"):
            assert kpi["value"] is None, kpi


def test_data_coverage(client):
    _require_data(client)
    resp = client.get("/api/v1/meta/data-coverage")
    assert resp.status_code == 200
    cov = resp.json()["coverage"]
    assert cov["district_crop_productivity"]["2025B"] == "district"
    assert cov["district_crop_productivity"]["2024B"] == "national"
    assert cov["national_input_trends"]["2024A"] == "national"


def test_sources_and_models(client):
    assert client.get("/api/v1/meta/sources").status_code == 200
    models = client.get("/api/v1/meta/models").json()["models"]
    # When no model card exists we say so; we never invent metrics.
    assert models
    for m in models:
        if m["status"] == "unavailable":
            assert m["mae"] is None and m["rmse"] is None


def test_crop_filter_requeries(client):
    _require_data(client)
    base = client.get("/api/v1/analytics/productivity").json()
    maize = client.get("/api/v1/analytics/productivity?crop=Maize").json()
    assert base["n_observations"] >= maize["n_observations"] > 0
    assert all(r["district"] for r in maize["rows"])


def test_district_filter(client):
    _require_data(client)
    resp = client.get("/api/v1/analytics/productivity?district=Ngoma")
    assert resp.status_code == 200
    body = resp.json()
    for row in body["rows"]:
        assert row["district"] == "Ngoma"


def test_unknown_filter_is_empty_not_fallback(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/productivity?district=Atlantis").json()
    assert body["rows"] == []
    assert body["n_observations"] == 0


def test_trend_periods(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/trends").json()
    periods = {p["period"] for p in body["points"]}
    assert {"2024B", "2025A", "2025B", "2026A"} <= periods
    assert body["metric_units"]["production_mt"] == "metric tonnes"


def test_input_adoption_trend(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/input-adoption").json()
    assert body["kind"] == "input_adoption"
    # 2024A has no irrigation series -> null, never 0.
    p2024a = next(p for p in body["points"] if p["period"] == "2024A")
    assert p2024a["values"]["irrigation_pct"] is None


def test_map_metric(client):
    _require_data(client)
    body = client.get("/api/v1/maps/district-metrics?metric=gap&crop=Maize").json()
    assert body["metric"] == "gap"
    assert body["crop"] == "Maize"
    assert not body["requires_crop"] or body["districts"]
    assert len(body["districts"]) == 30
    ngoma = next(d for d in body["districts"] if d["district"] == "Ngoma")
    assert ngoma["district_code"]
    assert "gap_index" in ngoma["details"]


def test_map_yield_requires_a_crop(client):
    _require_data(client)
    body = client.get("/api/v1/maps/district-metrics?metric=yield").json()
    # No all-crop yield choropleth: the map is empty and says why.
    assert body["districts"] == []
    assert body["requires_crop"] is True
    assert body["message"]
    assert "crop" in body["message"].lower()
    # With a crop selection the yield layer is populated.
    with_crop = client.get("/api/v1/maps/district-metrics?metric=yield&crop=Maize").json()
    assert len(with_crop["districts"]) > 0
    assert with_crop["crop"] == "Maize"


def test_map_gap_without_crop_never_shows_a_cross_crop_yield(client):
    _require_data(client)
    body = client.get("/api/v1/maps/district-metrics?metric=gap").json()
    # A relative gap is valid across crops, so the layer still renders...
    assert len(body["districts"]) == 30
    assert body["requires_crop"] is False
    # ...but no raw yield is exposed, because averaging crop yields is invalid.
    for district in body["districts"]:
        assert district["details"]["yield_kg_ha"] is None
        assert district["details"]["benchmark_yield_kg_ha"] is None
    assert body["districts"][0]["details"]["gap_index"] is not None


def test_map_period_independent_metric_still_works_without_crop(client):
    _require_data(client)
    body = client.get("/api/v1/maps/district-metrics?metric=priority").json()
    assert len(body["districts"]) == 30
    assert body["requires_crop"] is False


def test_map_unknown_metric_rejected(client):
    _require_data(client)
    assert client.get("/api/v1/maps/district-metrics?metric=nope").status_code == 422


def test_priority_map_accepts_adjusted_weights(client):
    _require_data(client)
    baseline = client.get("/api/v1/maps/district-metrics?metric=priority").json()
    adjusted = client.post(
        "/api/v1/maps/district-metrics",
        json={"gap": 0.8, "vulnerability": 0.05, "affected_scale": 0.05,
              "readiness": 0.05, "cost": 0.05},
    )
    assert adjusted.status_code == 200
    body = adjusted.json()
    assert len(body["districts"]) == len(baseline["districts"]) == 30
    assert any(a["value"] != b["value"] for a, b in zip(body["districts"], baseline["districts"], strict=True))


def test_post_harvest(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/post-harvest").json()
    assert body["crops"]
    assert any(k["id"] == "highest_loss" for k in body["kpis"])


def test_post_harvest_headlines_are_chosen_by_python(client):
    """The page's headline crop is the API's pick, not a client-side search.

    Choosing a maximum is an analytical decision: it decides which crop a page
    leads with. It used to be made in React, which meant the web page and the
    mobile screen could name different crops for the same figure.
    """
    _require_data(client)
    body = client.get("/api/v1/analytics/post-harvest").json()
    headlines = {h["id"]: h for h in body["headlines"]}
    assert set(headlines) == {
        "highest_loss_crop", "highest_storage_crop", "highest_marketed_crop"
    }

    for headline, column in [
        (headlines["highest_loss_crop"], "post_harvest_losses_pct"),
        (headlines["highest_storage_crop"], "stored_pct"),
        (headlines["highest_marketed_crop"], "sold_pct"),
    ]:
        values = [c[column] for c in body["crops"] if c[column] is not None]
        assert values, column
        # The pick is the maximum of the values the client is also given, so the
        # two can never disagree.
        assert headline["value"] == max(values), column
        picked = next(c for c in body["crops"] if c["crop"] == headline["crop"])
        assert picked[column] == headline["value"], column
        assert headline["n_crops_considered"] == len(body["crops"])
        assert headline["unit"], column


def test_post_harvest_headlines_follow_the_crop_filter(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/post-harvest?crop=Maize").json()
    assert len(body["crops"]) == 1
    for headline in body["headlines"]:
        # A one-crop selection still reports a headline, and says it was chosen
        # from one crop rather than presenting it as a national maximum.
        assert headline["crop"] == "Maize"
        assert headline["n_crops_considered"] == 1


def test_null_capacity_preserved(client):
    _require_data(client)
    body = client.get("/api/v1/facilities/context").json()
    assert body["capacity_not_verified"] is True
    assert body["facilities"]
    for f in body["facilities"]:
        assert f["capacity_kg"] is None
        assert f["capacity_status"] == "not_verified"


def test_weights_validation(client):
    _require_data(client)
    ok = client.post(
        "/api/v1/analytics/intervention-priorities",
        json={"weights": {"gap": 0.4, "vulnerability": 0.2, "affected_scale": 0.2,
                          "readiness": 0.15, "cost": 0.05}},
    )
    assert ok.status_code == 200
    assert ok.json()["rows"]

    bad = client.post(
        "/api/v1/analytics/intervention-priorities",
        json={"weights": {"gap": 0.9, "vulnerability": 0.9, "affected_scale": 0.9,
                          "readiness": 0.9, "cost": 0.9}},
    )
    assert bad.status_code == 422


def test_factors_are_not_causal(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/factors?crop=Maize").json()
    assert body["factors"]
    assert all("association" in f["interpretation"] or "sample" in f["interpretation"]
               for f in body["factors"])


def test_heatmap(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/heatmap?metric=gap").json()
    assert body["districts"] and body["crops"]
    assert all("district" in c and "crop" in c and "value" in c for c in body["cells"])


def test_heatmap_ignores_generic_row_limit(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/heatmap?limit=1").json()
    assert len(body["cells"]) == len(body["districts"]) * len(body["crops"])
    assert len(body["cells"]) > 500


def test_factors_require_crop(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/factors").json()
    assert body["crop"] is None
    assert body["factors"] == []
    maize = client.get("/api/v1/analytics/factors?crop=Maize").json()
    assert maize["crop"] == "Maize"
    assert maize["factors"]


@pytest.mark.parametrize("strategy", [
    "national_crop_median",
    "national_crop_season_median",
    "top_quartile_comparable_districts",
    "agro_ecological_peer_group",
])
def test_intervention_respects_selected_benchmark(monkeypatch, strategy):
    frame = pd.DataFrame([
        {"district": name, "district_code": code, "canonical_crop_name": "Maize",
         "year": 2025, "season": season, "agro_ecological_zone": zone,
         "yield_kg_ha": yield_value, "harvested_area_ha": 10.0,
         "erosion_protection_farmers_pct": 50.0, "agricultural_land_000ha": 1.0,
         "perishability": "medium"}
        for name, code, season, zone, yield_value in [
            ("A", "01", "A", "East", 100.0),
            ("B", "02", "A", "East", 200.0),
            ("C", "03", "B", "West", 300.0),
            ("D", "04", "B", "West", 400.0),
        ]
    ])
    monkeypatch.setattr(analytics_service.repo, "training_dataset", lambda: frame)
    # The fixture carries no published period axis, so pin the resolver: this case
    # is "the legacy frame with no period selected", which is what makes the
    # benchmark strategy the only thing under test here.
    monkeypatch.setattr(analytics_service.period_service, "latest_district", lambda: None)
    monkeypatch.setattr(analytics_service.period_service, "latest", lambda: None)
    result = analytics_service.priorities(
        f=AnalyticsFilters(benchmark_strategy=strategy), limit=10
    )
    expected = compute_gaps(frame, strategy=strategy)
    for row in result["rows"]:
        match = expected[expected["district"] == row["district"]].iloc[0]
        assert row["benchmark_yield_kg_ha"] == round(float(match["benchmark_yield_kg_ha"]), 1)


def test_all_crop_yield_uses_production_over_area(monkeypatch):
    frame = pd.DataFrame([
        {"year": 2025, "season": "B", "canonical_crop_name": "Maize",
         "is_aggregate": False, "cultivated_area_ha": 100.0,
         "harvested_area_ha": 100.0, "production_mt": 100.0, "yield_mt_ha": 1.0},
        {"year": 2025, "season": "B", "canonical_crop_name": "Beans",
         "is_aggregate": False, "cultivated_area_ha": 300.0,
         "harvested_area_ha": 300.0, "production_mt": 900.0, "yield_mt_ha": 3.0},
    ])
    monkeypatch.setattr(trend_service.repo, "national_crop_trends", lambda: frame)
    combined = trend_service.crop_trends()["points"][0]["values"]
    maize = trend_service.crop_trends("Maize")["points"][0]["values"]
    assert combined["yield_mt_ha"] == 2.5
    assert maize["yield_mt_ha"] == 1.0
