"""Scoped forecasts never substitute another season or an aggregate district estimate."""
from __future__ import annotations

import json

import pytest

from app.ai import agent, grounded
from app.ai.evidence import EvidenceBundle
from app.ai.tools import metadata
from app.services import meta_service


def _report(tmp_path, monkeypatch, *, serves=True, policy=True):
    targets = []
    for crop in ("maize", "beans"):
        for season in ("a", "b"):
            targets.append({
                "target_id": f"district_{crop}_yield_next_season_{season}", "status": "ok",
                "crop": crop.title(), "season": season.upper(), "metric": "yield",
                "geography_level": "DISTRICT", "unit": "kg/ha", "n_series": 30,
                "n_series_eligible": 30, "point_estimate": 9000, "interval": None,
                "candidate": "drift", "next_period": f"2027{season.upper()}",
                "series_forecasts": {
                    "Bugesera": {"point_estimate": 1234.5, "interval": [1111.0, 1444.0]},
                },
            })
    targets.append({
        "target_id": "national_maize_yield_next_season_b", "status": "ok",
        "point_estimate": 6000, "unit": "kg/ha", "next_period": "2027B", "reasons": [],
    })
    report = {"serves_forecast": serves, "policy_is_default": policy,
              "policy": {"interval_level": 0.9}, "targets": targets}
    path = tmp_path / "forecast.json"
    path.write_text(json.dumps(report))
    monkeypatch.setattr(meta_service, "FORECAST_REPORT", path)
    return report


def test_canonical_period_crop_and_district_select_the_correct_series(tmp_path, monkeypatch, client):
    _report(tmp_path, monkeypatch)
    response = client.get("/api/v1/analytics/forecast-status", params={
        "crop": "Maize", "period_code": "2026B", "season": "A", "district": "Bugesera",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["serves_forecast"] is True
    assert body["selection"]["season"] == "B"
    assert len(body["targets"]) == 1
    target = body["targets"][0]
    assert target["point_estimate"] == 1234.5  # never the 9000 district median or national 6000
    assert target["interval"] == [1111, 1444]
    assert target["interval_level"] == 0.9
    assert target["crop"] == "Maize" and target["district"] == "Bugesera"


def test_uncovered_district_has_no_aggregate_fallback(tmp_path, monkeypatch):
    _report(tmp_path, monkeypatch)
    body = meta_service.forecast_status(crop="Maize", season="B", district="Huye")
    assert body["serves_forecast"] is False
    assert body["targets"][0]["point_estimate"] is None
    assert body["targets"][0]["interval"] is None
    assert "per-district" in " ".join(body["targets"][0]["reasons"])


def test_a_contradictory_province_district_selection_has_no_forecast(tmp_path, monkeypatch):
    _report(tmp_path, monkeypatch)
    result = meta_service.forecast_status(crop="Maize", district="Bugesera", province="Northern")
    assert result["targets"] == []
    assert not result["serves_forecast"]


def test_multiple_district_requests_cannot_deduplicate_each_others_evidence(tmp_path, monkeypatch):
    _report(tmp_path, monkeypatch)
    bundle = EvidenceBundle(query_id="two-districts", intent="forecast_status")
    bundle.add_items(metadata.forecast_status(crop="Maize", season="B", district="Bugesera"))
    bundle.add_items(metadata.forecast_status(crop="Maize", season="B", district="Huye"))
    districts = {item.district for item in bundle.items if item.metric == "forecast_estimate"}
    assert districts == {"Bugesera", "Huye"}


@pytest.mark.parametrize("kwargs", [{"crop": "Cassava"}, {"season": "C"}, {"province": "Eastern"}])
def test_unsupported_scope_is_explicitly_empty(tmp_path, monkeypatch, kwargs):
    _report(tmp_path, monkeypatch)
    body = meta_service.forecast_status(**kwargs)
    assert not body["serves_forecast"]
    assert body["targets"] == []
    assert "selection" in body["note"]


@pytest.mark.parametrize("serves,policy", [(False, True), (True, False)])
def test_report_publication_gate_cannot_be_bypassed(tmp_path, monkeypatch, serves, policy):
    _report(tmp_path, monkeypatch, serves=serves, policy=policy)
    body = meta_service.forecast_status(crop="Maize", district="Bugesera")
    assert not body["serves_forecast"]
    assert all(t["point_estimate"] is None and t["interval"] is None for t in body["targets"])


def test_interval_scope_and_reasons_survive_model_serialization(tmp_path, monkeypatch):
    _report(tmp_path, monkeypatch)
    items = metadata.forecast_status(crop="Maize", season="B", district="Bugesera")
    bundle = EvidenceBundle(query_id="test", intent="forecast_status", items=items)
    payloads = [agent._item_payload(item) for item in items]
    lower = next(item for item in payloads if item["metric"] == "forecast_interval_lower")
    assert lower["value"] == 1111
    assert lower["district"] == "Bugesera" and lower["crop"] == "Maize"
    assert lower["source_id"] == "ML_FORECAST_BACKTEST"
    assert lower["method"] and lower["note"]
    assert {1111, 1444, 90}.issubset(bundle.numeric_allowlist())
    answer = grounded.forecast_status(crop="Maize", district="Bugesera", period_code="2026B")
    assert "1111" in answer.answer and "1444" in answer.answer
    assert "9000" not in answer.answer


@pytest.mark.parametrize("content", ["[]", "null", '{"targets": null}'])
def test_invalid_report_shape_is_an_honest_unavailable_state(tmp_path, monkeypatch, content):
    path = tmp_path / "bad.json"
    path.write_text(content)
    monkeypatch.setattr(meta_service, "FORECAST_REPORT", path)
    assert meta_service.forecast_status()["report_available"] is False
