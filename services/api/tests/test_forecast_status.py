"""Forecast publication status: the gate is reported, never bypassed.

The backtest report is gitignored (it is a build artefact), so these tests
construct their own reports against a temporary path. The properties asserted
are the ones a client depends on:

* a deployment with no report answers honestly instead of 500ing;
* a suppressed target keeps the reasons it was suppressed for;
* only a run whose report declares ``serves_forecast`` with a passing target
  ever reports a servable forecast;
* the endpoint always answers 200 — "no forecast, here is the evidence verdict"
  is a complete result, not an error.
"""

from __future__ import annotations

import json

from app.services import meta_service

REPORT = {"path": "/api/v1/analytics/forecast-status"}


def _stage(tmp_path, monkeypatch, payload):
    path = tmp_path / "backtest.json"
    if payload is not None:
        if isinstance(payload, str):
            path.write_text(payload)
        else:
            path.write_text(json.dumps(payload))
    monkeypatch.setattr(meta_service, "FORECAST_REPORT", path)


def _base_report(**overrides) -> dict:
    report = {
        "generated": "2026-10-12",
        "policy": {"min_history": 3, "min_folds": 3},
        "policy_is_default": True,
        "serves_forecast": False,
        "method_note": "rolling-origin expanding-window backtest",
        "targets": [
            {
                "target_id": "district_maize_yield_next_season_b",
                "status": "insufficient_evidence",
                "reasons": [
                    "only 0/30 series support 3 expanding-window folds",
                    "candidate drift does not beat the naive baseline naive_last",
                ],
                "n_series": 30,
                "n_series_eligible": 0,
                "decision_note": "gates failed",
                "skill_vs_naive": -1.464,
                "metrics": {"naive_last": {"n": 60, "interval_coverage": 0.93}},
            }
        ],
    }
    report.update(overrides)
    return report


def test_missing_report_is_an_honest_unavailable_state(tmp_path, monkeypatch, client):
    _stage(tmp_path, monkeypatch, None)

    response = client.get(REPORT["path"])
    assert response.status_code == 200
    body = response.json()
    assert body["report_available"] is False
    assert body["serves_forecast"] is False
    assert body["targets"] == []
    # The absence must be explainable, not silent.
    assert "no forecast" in body["note"].lower()


def test_corrupt_report_is_reported_not_raised(tmp_path, monkeypatch, client):
    _stage(tmp_path, monkeypatch, "{not json")

    response = client.get(REPORT["path"])
    assert response.status_code == 200
    body = response.json()
    assert body["report_available"] is False
    assert body["serves_forecast"] is False


def test_suppressed_target_keeps_the_reasons_it_failed(tmp_path, monkeypatch, client):
    _stage(tmp_path, monkeypatch, _base_report())

    body = client.get(REPORT["path"]).json()
    assert body["report_available"] is True
    assert body["serves_forecast"] is False
    assert body["generated"] == "2026-10-12"
    assert body["policy_is_default"] is True
    assert body["method_note"]

    target = body["targets"][0]
    assert target["target_id"] == "district_maize_yield_next_season_b"
    assert target["status"] == "insufficient_evidence"
    assert len(target["reasons"]) == 2
    assert target["n_series"] == 30
    assert target["n_series_eligible"] == 0
    # No point estimate is smuggled out for a suppressed target.
    assert target["point_estimate"] is None
    # The verdict is stated as an evidence verdict, not an outage.
    assert "evidence" in body["note"].lower()


def test_publishable_target_carries_its_point_estimate(tmp_path, monkeypatch, client):
    passing = {
        "target_id": "national_maize_yield_next_season_b",
        "status": "ok",
        "reasons": [],
        "n_series": 1,
        "n_series_eligible": 1,
        "decision_note": "all gates passed",
        "skill_vs_naive": 0.12,
        "candidate": "drift",
        "next_period": "2027B",
        "point_estimate": 4875.5,
        "unit": "kg/ha",
        "interval": [4600.0, 5150.0],
        "metrics": {"drift": {"n": 3, "interval_coverage": 0.87}},
    }
    _stage(tmp_path, monkeypatch, _base_report(serves_forecast=True, targets=[passing]))

    body = client.get(REPORT["path"]).json()
    assert body["serves_forecast"] is True
    target = body["targets"][0]
    assert target["status"] == "ok"
    assert target["point_estimate"] == 4875.5
    assert target["next_period"] == "2027B"
    assert target["interval"] == [4600.0, 5150.0]
    assert target["interval_coverage"] == 0.87


def test_the_policy_flag_is_reported_verbatim(tmp_path, monkeypatch, client):
    """A non-default policy run is a sensitivity analysis, not a decision.

    The endpoint reads the gate's own record; it does not re-judge it. The
    pipeline already guarantees a sensitivity run sets ``serves_forecast``
    false, so the flag a client trusts and the policy it was judged under must
    arrive together.
    """
    _stage(tmp_path, monkeypatch, _base_report(policy_is_default=False))

    body = client.get(REPORT["path"]).json()
    assert body["policy_is_default"] is False
    assert body["serves_forecast"] is False


def test_provenance_names_the_gate_and_its_limits(tmp_path, monkeypatch, client):
    _stage(tmp_path, monkeypatch, _base_report())

    body = client.get(REPORT["path"]).json()
    provenance = body["provenance"]
    assert provenance["source_id"] == "ML_FORECAST_BACKTEST"
    limitations = " ".join(provenance["limitations"])
    assert "publication gate" in limitations
    assert "not forecasts" in limitations
