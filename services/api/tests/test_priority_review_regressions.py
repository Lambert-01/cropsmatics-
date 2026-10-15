"""User-visible regressions found by comparing ranking, map, and scenarios."""

from __future__ import annotations

import pytest

from app.analytics import intervention_priority as ip
from ml.src.models import intervention_priority as offline

SCOPE = {"period_code": "2026B", "crop": "Maize"}
DISTRICT = "Bugesera"
VULNERABILITY_ONLY = {
    "gap": 0, "vulnerability": 1, "affected_scale": 0, "readiness": 0, "cost": 0,
}


def _get(client, path, **params):
    response = client.get(f"/api/v1/{path}", params={**SCOPE, **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_selected_map_keeps_the_ranking_benchmark_and_score(client):
    ranking = _get(client, "analytics/intervention-priorities", district=DISTRICT)
    row = ranking["rows"][0]
    selected = _get(client, "maps/district-metrics", district=DISTRICT, metric="priority")
    district = selected["districts"][0]
    assert district["value"] == row["score"]
    assert district["details"]["priority_band"] == row["band"]
    assert district["details"]["benchmark_yield_kg_ha"] == pytest.approx(
        row["benchmark_yield_kg_ha"], abs=0.05
    )
    full = _get(client, "maps/district-metrics", metric="priority")
    assert next(d["value"] for d in full["districts"] if d["district"] == DISTRICT) == row["score"]


@pytest.mark.parametrize("province", [None, "Eastern"])
def test_scenario_displays_only_the_selected_district_with_stable_scores(client, province):
    selected = {"district": DISTRICT, **({"province": province} if province else {})}
    side = {**SCOPE, **selected}
    response = client.post("/api/v1/scenarios/priority", json={"baseline": side, "scenario": side})
    assert response.status_code == 200, response.text
    expected = _get(client, "analytics/intervention-priorities", **selected)["rows"][0]
    for name in ("baseline", "scenario"):
        view = response.json()[name]
        assert len(view["rows"]) == view["stats"]["n_candidates"] == 1
        assert view["rows"][0]["id"] == expected["id"]
        assert view["rows"][0]["score"] == expected["score"]
        assert view["reference_population"]["n_reference"] == expected["reference_n"]


def test_sensitivity_narrows_the_display_after_scoring_the_reference_population(client):
    response = client.post("/api/v1/scenarios/sensitivity", json={
        **SCOPE, "district": DISTRICT, "n_random": 0,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["rows"]) == body["districts_analysed"] == 1
    expected = _get(client, "analytics/intervention-priorities", district=DISTRICT)["rows"][0]
    assert body["rows"][0]["id"] == expected["id"]
    assert body["rows"][0]["baseline_score"] == expected["score"]


def test_scenario_threshold_does_not_overwrite_baseline(client):
    baseline = {**SCOPE, "shortfall_threshold_pct": 0}
    response = client.post("/api/v1/scenarios/priority", json={
        "baseline": baseline, "scenario": {**SCOPE, "shortfall_threshold_pct": 30},
    })
    assert response.status_code == 200, response.text
    body = response.json()
    control = client.post("/api/v1/scenarios/priority", json={"baseline": baseline, "scenario": baseline})
    assert control.status_code == 200, control.text
    assert body["baseline"] == control.json()["baseline"]
    assert body["baseline"]["shortfall_threshold_pct"] == 0
    assert body["scenario"]["shortfall_threshold_pct"] == 30
    assert body["baseline"]["n_eligible"] > body["scenario"]["n_eligible"]
    assert any(c["parameter"] == "shortfall_threshold_pct" for c in body["changes"])


def test_different_scenario_purposes_are_rejected_instead_of_overwritten(client):
    response = client.post("/api/v1/scenarios/priority", json={
        "baseline": {**SCOPE, "purpose": "productivity_support"},
        "scenario": {**SCOPE, "purpose": "harvest_coordination"},
    })
    assert response.status_code == 422
    assert "must match" in response.json()["detail"]


def test_harvest_default_weights_match_get_post_map_and_scenario(client):
    purpose = "harvest_coordination"
    ranking = _get(client, "analytics/intervention-priorities", purpose=purpose)
    assert ranking["weights"]["wg"] == 0
    assert ranking["weights"]["wf"] == 1
    weighted = client.post("/api/v1/analytics/intervention-priorities", params=SCOPE, json={"purpose": purpose})
    assert weighted.status_code == 200, weighted.text
    assert weighted.json()["rows"] == ranking["rows"]
    side = {**SCOPE, "purpose": purpose}
    scenario = client.post("/api/v1/scenarios/priority", json={"baseline": side, "scenario": side})
    assert scenario.status_code == 200, scenario.text
    assert scenario.json()["baseline"]["weights"] == ranking["weights"]
    mapped = _get(client, "maps/district-metrics", metric="priority", purpose=purpose)
    values = {d["district"]: d["value"] for d in mapped["districts"]}
    assert mapped["purpose"] == purpose
    for row in ranking["rows"]:
        assert values[row["district"]] == row["score"]


@pytest.mark.parametrize("path,body,params", [
    ("analytics/intervention-priorities", {"weights": VULNERABILITY_ONLY}, SCOPE),
    ("maps/district-metrics", VULNERABILITY_ONLY, SCOPE),
    ("scenarios/priority", {"baseline": {**SCOPE, "weights": VULNERABILITY_ONLY}, "scenario": SCOPE}, {}),
])
def test_unusable_weighting_returns_a_clear_error_not_low_scores(client, path, body, params):
    response = client.post(f"/api/v1/{path}", params=params, json=body)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "PRIORITY_UNSCORABLE"
    assert response.json()["retryable"] is False


def test_default_ranking_provenance_names_the_resolved_period(client):
    response = client.get("/api/v1/analytics/intervention-priorities", params={"crop": "Maize"})
    assert response.status_code == 200, response.text
    latest = client.get("/api/v1/meta/periods").json()["latest_district"]
    assert response.json()["provenance"]["source_period"] == latest


@pytest.mark.parametrize("engine", [ip, offline], ids=["api", "offline"])
def test_single_candidate_is_unscorable_and_threshold_reason_is_correct(engine):
    with pytest.raises(engine.UnscorableWeights, match="no usable"):
        engine.rank([{"id": "only", "gap": 25, "affected_scale": 100}])
    ok, reason = engine.eligibility(gap_pct=3, threshold_pct=10)
    assert not ok
    assert "3.0% below" in reason
    assert "threshold" in reason


def test_api_and_offline_engine_agree_for_both_purposes():
    candidates = [
        {"id": "a", "gap": -20, "harvested_area_ha": 100, "affected_scale": 100, "vulnerability": 0.5},
        {"id": "b", "gap": 15, "harvested_area_ha": 50, "affected_scale": 50, "vulnerability": 0.5},
        {"id": "c", "gap": 35, "harvested_area_ha": 25, "affected_scale": 25, "vulnerability": 0.5},
    ]
    for purpose in ip.PURPOSES:
        served = ip.rank(candidates, purpose=purpose)
        mirrored = offline.rank(candidates, purpose=purpose)
        assert [(r["id"], r["score"], r["band"], r["weights"]) for r in served] == [
            (r["id"], r["score"], r["band"], r["weights"]) for r in mirrored
        ]
