"""Tests for the dashboard, analytics, map, meta and facility endpoints.

These exercise the real processed tables produced by the data pipeline.
"""

from __future__ import annotations

import pytest


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
