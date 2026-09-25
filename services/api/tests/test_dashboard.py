"""Tests for the dashboard, analytics, map, meta and facility endpoints.

These exercise the real processed tables produced by the data pipeline.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.analytics.productivity_gap import compute_gaps
from app.schemas.filters import AnalyticsFilters
from app.services import analytics_service, trend_service


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
    assert {"avg_yield", "districts", "crops", "median_gap", "high_gap"} <= ids
    districts = next(k for k in body["kpis"] if k["id"] == "districts")
    assert districts["value"] == 30


def test_national_only_period_has_national_kpis_and_no_district_data(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?year=2024&season=B").json()
    assert body["coverage_level"] == "national"
    assert body["n_observations"] == 0
    assert {k["id"] for k in body["kpis"]} == {
        "national_production", "national_area", "national_yield", "national_seed"
    }
    assert all(k["period"] == "2024B" for k in body["kpis"])
    assert next(k for k in body["kpis"] if k["id"] == "national_production")["value"] > 0


def test_national_input_only_period_preserves_missing_crop_metrics(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview?year=2026&season=B").json()
    assert body["coverage_level"] == "national"
    assert next(k for k in body["kpis"] if k["id"] == "national_production")["value"] is None
    assert next(k for k in body["kpis"] if k["id"] == "national_seed")["value"] is not None


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
    body = client.get("/api/v1/maps/district-metrics?metric=gap").json()
    assert body["metric"] == "gap"
    assert len(body["districts"]) == 30
    ngoma = next(d for d in body["districts"] if d["district"] == "Ngoma")
    assert ngoma["district_code"]
    assert "gap_index" in ngoma["details"]


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
