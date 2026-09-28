"""Component availability: a missing input is excluded, never invented.

The priority score needs five components. Three come from the productivity rows of
the selected period; readiness (erosion-protection adoption) and cost constraint
(agricultural-land share) exist only in the 2025 Season B district practice/land
survey. Before this contract, those two fell back to a neutral constant outside
2025B while the response's proxy notes described them as measured erosion and land
values - a number on screen that the selected period never produced.

These tests pin the replacement policy on every surface that scores a candidate:

* outside 2025B the two single-release components are reported as unavailable and
  their weight is redistributed over the components that do have data, in the
  ranking, the scenario and every sensitivity draw alike;
* an unavailable component is returned as ``null``, never as 0 or 0.5;
* the response names what was excluded and why, so a reader never has to infer it;
* 2025 Season B itself is unchanged - every component measured, default weights;
* a selection with no rows reports ``undetermined`` rather than claiming that a
  component is unavailable.
"""

from __future__ import annotations

import pytest

PERIOD_WITHOUT_FACTORS = "2026B"
PERIOD_WITH_FACTORS = "2025B"


def _require_data(client) -> None:
    resp = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PERIOD_WITHOUT_FACTORS, "limit": 1},
    )
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _priorities(client, period_code: str, **params) -> dict:
    res = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": period_code, "limit": 200, **params},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _statuses(body: dict) -> dict[str, str]:
    return {entry["component"]: entry["status"] for entry in body["component_availability"]}


# --- the ranking ---------------------------------------------------------------


def test_missing_components_are_reported_not_constant_filled(client):
    _require_data(client)
    body = _priorities(client, PERIOD_WITHOUT_FACTORS)
    assert body["rows"]
    assert set(body["components_unavailable"]) == {"readiness", "cost_constraint"}
    for row in body["rows"]:
        # The value the UI would have printed as "Readiness 0.50" is now absent.
        assert row["readiness"] is None
        assert row["cost_constraint"] is None
        assert row["vulnerability"] is not None
        assert row["affected_scale"] is not None
    assert any("redistributed" in note for note in body["provenance"]["limitations"])


def test_the_proxy_notes_describe_the_period_they_belong_to(client):
    _require_data(client)
    without = " ".join(_priorities(client, PERIOD_WITHOUT_FACTORS)["proxy_notes"]).lower()
    assert "unavailable" in without
    native = " ".join(_priorities(client, PERIOD_WITH_FACTORS)["proxy_notes"]).lower()
    assert "measured" in native
    assert "unavailable" not in native


def test_the_excluded_weight_is_redistributed_over_the_measured_components(client):
    _require_data(client)
    weights = _priorities(client, PERIOD_WITHOUT_FACTORS)["weights"]
    assert weights["wr"] == 0.0
    assert weights["wc"] == 0.0
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-6)
    # Every remaining component gains weight; the total is preserved, not dropped.
    assert weights["wg"] >= 0.30
    assert weights["wv"] >= 0.20
    assert weights["wf"] >= 0.20


def test_availability_is_reported_per_component(client):
    _require_data(client)
    statuses = _statuses(_priorities(client, PERIOD_WITHOUT_FACTORS))
    assert statuses == {
        "gap_index": "measured",
        "vulnerability": "proxy",
        "affected_scale": "proxy",
        "readiness": "unavailable",
        "cost_constraint": "unavailable",
    }


def test_2025b_still_uses_every_measured_component(client):
    _require_data(client)
    body = _priorities(client, PERIOD_WITH_FACTORS)
    assert body["components_unavailable"] == []
    statuses = _statuses(body)
    assert statuses["readiness"] == "measured"
    assert statuses["cost_constraint"] == "measured"
    sources = {
        entry["component"]: entry["source_period"] for entry in body["component_availability"]
    }
    assert sources["readiness"] == PERIOD_WITH_FACTORS
    assert body["weights"]["wr"] > 0
    assert body["weights"]["wc"] > 0
    assert all(row["readiness"] is not None for row in body["rows"])
    assert all(row["cost_constraint"] is not None for row in body["rows"])


def test_no_rows_is_undetermined_not_unavailable(client):
    _require_data(client)
    body = _priorities(client, PERIOD_WITHOUT_FACTORS, crop="NotARealCrop")
    assert body["rows"] == []
    # Nothing was inspected, so claiming "unavailable" would itself be invented.
    assert body["components_unavailable"] == []
    assert set(_statuses(body).values()) == {"undetermined"}


# --- the scenario ---------------------------------------------------------------


def test_each_scenario_side_reports_its_own_exclusions(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/priority",
        json={
            "baseline": {"period_code": PERIOD_WITH_FACTORS},
            "scenario": {"period_code": PERIOD_WITHOUT_FACTORS},
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["baseline"]["components_unavailable"] == []
    assert set(body["scenario"]["components_unavailable"]) == {"readiness", "cost_constraint"}
    assert set(body["components_unavailable"]) == {"readiness", "cost_constraint"}
    assert body["baseline"]["weights"]["wr"] > 0
    assert body["scenario"]["weights"]["wr"] == 0.0
    assert isinstance(body["scenario"]["component_availability"], list)


# --- the sweep ------------------------------------------------------------------


def test_the_sweep_never_tests_a_weight_on_an_unavailable_component(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/sensitivity",
        json={"period_code": PERIOD_WITHOUT_FACTORS, "n_random": 40},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body["components_unavailable"]) == {"readiness", "cost_constraint"}
    assert body["weights"]["wr"] == 0.0
    assert body["weights"]["wc"] == 0.0
    for preset in body["presets"].values():
        assert preset["wr"] == 0.0
        assert preset["wc"] == 0.0
        assert sum(preset.values()) == pytest.approx(1.0, abs=1e-6)
    assert any("redistributed" in note for note in body["limitations"])


def test_the_sweep_and_the_planner_agree_on_what_was_excluded(client):
    _require_data(client)
    planner = _priorities(client, PERIOD_WITHOUT_FACTORS)
    res = client.post(
        "/api/v1/scenarios/sensitivity",
        json={"period_code": PERIOD_WITHOUT_FACTORS, "n_random": 10},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["components_unavailable"] == planner["components_unavailable"]
    # The planner rounds the reported weights to 6 dp; both describe one policy.
    assert body["weights"] == pytest.approx(planner["weights"], abs=1e-6)
    assert body["component_availability"] == planner["component_availability"]


def test_the_sweep_keeps_the_measured_components_for_2025b(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/sensitivity",
        json={"period_code": PERIOD_WITH_FACTORS, "n_random": 10},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["components_unavailable"] == []
    assert body["presets"]["readiness_focused"]["wr"] > 0


