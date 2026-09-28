"""Intervention Priority Scenario Lab: the analytical scenario contract.

These tests pin the properties that stop the planner's scenario from drifting into
a budget model or from quietly mutating the baseline it compares against:

* the baseline is computed from its own parameters and is byte-identical across
  requests that only changed the scenario side;
* the baseline ranking agrees with the planner's own endpoint for the same
  selection, so the lab can never disagree with the page it sits on;
* a weighting change is reported per weight, never as an opaque dict-to-dict row;
* a change to the selection is reported as a change of candidate set, not as a
  re-prioritisation;
* a selection with no candidates is reported as *missing*, never as a ranking of
  zero-scoring districts;
* the response is always labelled ``analytical`` and never claims an outcome.
"""

from __future__ import annotations

import pytest

PERIOD = "2026B"
# Published, but 2026C does not exist at all (the catalogue has 2024A..2026B).
UNPUBLISHED_PERIOD = "2026C"

GAP_FOCUSED = {
    "gap": 0.50,
    "vulnerability": 0.15,
    "affected_scale": 0.15,
    "readiness": 0.15,
    "cost": 0.05,
}
VULNERABILITY_FOCUSED = {
    "gap": 0.20,
    "vulnerability": 0.45,
    "affected_scale": 0.15,
    "readiness": 0.15,
    "cost": 0.05,
}

ANALYTICAL = "analytical"


def _require_data(client) -> None:
    resp = client.get(
        "/api/v1/analytics/intervention-priorities", params={"period_code": PERIOD, "limit": 1}
    )
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _scenario(client, **body) -> dict:
    res = client.post("/api/v1/scenarios/priority", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def _side(period_code: str = PERIOD, **overrides) -> dict:
    return {"period_code": period_code, **overrides}


# --- guardrails ----------------------------------------------------------------


def test_the_result_is_labelled_analytical_and_never_a_prediction(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side(weights=GAP_FOCUSED))
    assert body["scenario_type"] == ANALYTICAL
    assert "analytical" in body["scenario_label"].lower()
    joined = " ".join(body["limitations"]).lower()
    assert "not a budget model" in joined
    assert "not a yield forecast" in joined


def test_an_unpublished_period_is_rejected_rather_than_silently_defaulted(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/priority",
        json={"baseline": _side(UNPUBLISHED_PERIOD), "scenario": _side()},
    )
    assert res.status_code == 422
    assert UNPUBLISHED_PERIOD in res.json()["detail"]


def test_an_unsupported_benchmark_strategy_is_rejected(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/priority",
        json={"baseline": _side(benchmark_strategy="not_a_strategy"), "scenario": _side()},
    )
    assert res.status_code == 422


def test_weights_must_be_non_negative_and_sum_to_one(client):
    _require_data(client)
    too_big = {"gap": 0.9, "vulnerability": 0.9, "affected_scale": 0.1, "readiness": 0.1, "cost": 0.1}
    res = client.post(
        "/api/v1/scenarios/priority",
        json={"baseline": _side(weights=too_big), "scenario": _side()},
    )
    assert res.status_code == 422


# --- baseline integrity --------------------------------------------------------


def test_the_baseline_is_never_overwritten_by_the_scenario(client):
    _require_data(client)
    first = _scenario(client, baseline=_side(), scenario=_side(weights=GAP_FOCUSED))
    second = _scenario(client, baseline=_side(), scenario=_side(weights=VULNERABILITY_FOCUSED))
    assert first["baseline"] == second["baseline"]
    # ...and the scenario side really did differ.
    assert first["scenario"]["rows"][0]["id"] != second["scenario"]["rows"][0]["id"] or (
        first["scenario"]["stats"]["mean_score"] != second["scenario"]["stats"]["mean_score"]
    )


def test_baseline_agrees_with_the_planner_endpoint_for_the_same_selection(client):
    _require_data(client)
    planner = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PERIOD, "limit": 500},
    ).json()
    body = _scenario(client, baseline=_side(), scenario=_side())

    assert body["baseline"]["stats"]["n_candidates"] == len(planner["rows"])
    assert body["baseline"]["rows"][0]["id"] == planner["rows"][0]["id"]
    assert body["baseline"]["rows"][0]["score"] == pytest.approx(
        planner["rows"][0]["score"], abs=1e-6
    )


def test_no_candidate_is_invented(client):
    _require_data(client)
    planner = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PERIOD, "limit": 500},
    ).json()
    allowed = {row["id"] for row in planner["rows"]}
    body = _scenario(client, baseline=_side(), scenario=_side(weights=GAP_FOCUSED))

    for view in (body["baseline"], body["scenario"]):
        assert {row["id"] for row in view["rows"]} <= allowed


# --- weighting changes ---------------------------------------------------------


def test_a_weighting_change_is_reported_per_weight_with_labels(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side(weights=GAP_FOCUSED))

    deltas = {item["key"]: item for item in body["weight_deltas"]}
    assert "wg" in deltas
    assert deltas["wg"]["delta"] == pytest.approx(0.20, abs=1e-6)
    assert deltas["wc"]["delta"] == pytest.approx(-0.05, abs=1e-6)
    # Weighting must never appear as an opaque before/after object.
    assert all(change["parameter"] != "weights" for change in body["changes"])
    # ...and its display name is supplied rather than humanised by the client.
    assert body["weight_labels"]["wg"] == "Productivity gap"
    assert deltas["wg"]["label"] == "Productivity gap"


def test_changing_only_the_weights_moves_candidates_and_keeps_the_candidate_set(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side(weights=GAP_FOCUSED))

    assert body["ranking_movement"]["n_compared"] == body["baseline"]["stats"]["n_candidates"]
    assert body["ranking_movement"]["n_moved"] > 0
    # Nothing entered or left the candidate set, because only the weights changed.
    assert body["ranking_movement"]["entered_group"] == []
    assert body["ranking_movement"]["left_group"] == []


def test_identical_assumptions_produce_no_movement(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side())
    assert body["changes"] == []
    assert body["weight_deltas"] == []
    assert body["ranking_movement"]["n_moved"] == 0


def test_presets_are_offered_engine_keyed_with_display_names(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side())
    presets = body["available_presets"]
    assert "balanced" in presets
    assert set(presets["balanced"]) == set(body["weight_labels"])
    assert body["preset_labels"]["balanced"]


# --- selection changes ---------------------------------------------------------


def test_a_group_change_is_reported_as_a_group_change_not_a_fall(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side(province="Eastern"))

    scenario_ids = {row["id"] for row in body["scenario"]["rows"]}
    baseline_ids = {row["id"] for row in body["baseline"]["rows"]}
    # A narrowing of the group leaves candidates behind; that is not a movement.
    assert len(body["ranking_movement"]["left_group"]) == len(baseline_ids - scenario_ids)
    assert len(body["ranking_movement"]["entered_group"]) == len(scenario_ids - baseline_ids)
    assert body["ranking_movement"]["n_compared"] == len(baseline_ids & scenario_ids)


def test_a_selection_change_is_named_in_the_changed_assumptions(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side(province="Eastern"))
    parameters = {change["parameter"]: change for change in body["changes"]}
    assert parameters["province"]["before"] is None
    assert parameters["province"]["after"] == "Eastern"


# --- honest emptiness ----------------------------------------------------------


def test_a_selection_with_no_candidates_is_missing_not_zero_ranked(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(crop="NotARealCrop"), scenario=_side())

    baseline = body["baseline"]
    assert baseline["missing"] is True
    assert baseline["rows"] == []
    assert baseline["stats"]["n_candidates"] == 0
    assert baseline["reason"]
    assert "rather than as zero" in baseline["reason"]


def test_min_score_filters_candidates_out_of_the_view(client):
    _require_data(client)
    everything = _scenario(client, baseline=_side(), scenario=_side())
    filtered = _scenario(client, baseline=_side(min_score=0.5), scenario=_side())

    assert filtered["baseline"]["stats"]["n_candidates"] < (
        everything["baseline"]["stats"]["n_candidates"]
    )
    assert all(row["score"] >= 0.5 for row in filtered["baseline"]["rows"])


def test_top_n_shortlist_is_exposed_per_side(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(top_n=3), scenario=_side(top_n=7))
    assert body["baseline"]["top_n"] == 3
    assert body["scenario"]["top_n"] == 7
    assert body["scenario"]["stats"]["n_top_n"] == 7
    assert len(body["ranking_movement"]["entered_priority"]) <= 7
    # A differing shortlist size is called out, because an entry can then reflect
    # the threshold rather than the weighting.
    assert any("shortlist size differs" in line for line in body["limitations"])


def test_provenance_names_the_release_and_the_method(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(), scenario=_side(weights=GAP_FOCUSED))
    provenance = body["provenance"]
    assert provenance["source_period"] == f"{PERIOD}-{PERIOD}"
    assert "deterministic" in provenance["method"].lower()
    assert provenance["limitations"]
