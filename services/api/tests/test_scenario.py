"""Yield Scenario Lab: the analytical (descriptive) scenario contract.

The scenario endpoint re-runs published analytics under different assumptions.
These tests pin the properties that stop it from drifting into a prediction or
from quietly mutating the thing it is comparing against:

* a crop is mandatory, because a cross-crop district yield ranking is meaningless;
* the baseline is computed from its own parameters and is identical across
  requests that only changed the scenario side;
* a period the crop was not tabulated for is reported as *missing*, never as a
  rank full of zeroes;
* a change to the district group is reported as a change of group, not as
  performance movement;
* the mode that would need a validated model stays off while none is registered;
* the response is always labelled ``analytical`` and never claims a prediction.
"""

from __future__ import annotations

import pytest

BASE_PERIOD = "2026B"
PREVIOUS_PERIOD = "2025B"
# Published, but Season C does not tabulate Maize at district level.
UNPUBLISHED_FOR_MAIZE = "2024C"

ANALYTICAL = "analytical"


def _require_data(client) -> None:
    resp = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _scenario(client, **body) -> dict:
    payload = {"crop": "Maize", **body}
    res = client.post("/api/v1/scenarios/yield", json=payload)
    assert res.status_code == 200, res.text
    return res.json()


def _side(period_code: str, **overrides) -> dict:
    return {"period_code": period_code, **overrides}


# --- guardrails ----------------------------------------------------------------


def test_a_crop_is_required_so_cross_crop_yield_ranking_is_blocked(client):
    """Maize, beans and potato kg/ha are not on the same scale."""
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/yield",
        json={"baseline": _side(BASE_PERIOD), "scenario": _side(PREVIOUS_PERIOD)},
    )
    assert res.status_code == 422


def test_unpublished_period_is_rejected_rather_than_silently_defaulted(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/yield",
        json={"crop": "Maize", "baseline": _side("2026C"), "scenario": _side(BASE_PERIOD)},
    )
    assert res.status_code == 422
    assert "2026C" in res.text


def test_unknown_crop_is_a_404_not_an_empty_comparison(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/yield",
        json={"crop": "Unobtainium", "baseline": _side(BASE_PERIOD), "scenario": _side(PREVIOUS_PERIOD)},
    )
    assert res.status_code == 404


def test_ranking_criterion_and_benchmark_strategy_are_validated(client):
    _require_data(client)
    bad_criterion = client.post(
        "/api/v1/scenarios/yield",
        json={
            "crop": "Maize",
            "baseline": _side(BASE_PERIOD, ranking_criterion="whatever"),
            "scenario": _side(BASE_PERIOD),
        },
    )
    assert bad_criterion.status_code == 422

    bad_strategy = client.post(
        "/api/v1/scenarios/yield",
        json={
            "crop": "Maize",
            "baseline": _side(BASE_PERIOD, benchmark_strategy="wishful_thinking"),
            "scenario": _side(BASE_PERIOD),
        },
    )
    assert bad_strategy.status_code == 422


def test_a_scenario_is_never_labelled_a_prediction(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(PREVIOUS_PERIOD))
    assert body["scenario_type"] == ANALYTICAL
    # The only permitted label; there is no code path that returns a forecast.
    assert "predict" not in body["scenario_type"].lower()
    assert body["scenario_label"].lower().startswith("analytical")
    assert "forecast" in body["provenance"]["method"].lower()
    assert any("not a forecast" in item for item in body["limitations"])


# --- the baseline is not overwritten ------------------------------------------


def test_baseline_is_identical_across_requests_that_only_changed_the_scenario(client):
    """The scenario must never leak into the baseline it is compared against."""
    _require_data(client)
    first = _scenario(
        client,
        baseline=_side(BASE_PERIOD),
        scenario=_side(PREVIOUS_PERIOD),
    )
    second = _scenario(
        client,
        baseline=_side(BASE_PERIOD),
        # A materially different scenario: different period, benchmark, threshold.
        scenario=_side(
            PREVIOUS_PERIOD,
            benchmark_strategy="top_quartile_comparable_districts",
            gap_threshold_pct=5.0,
            ranking_criterion="yield_kg_ha",
        ),
    )
    assert first["baseline"] == second["baseline"]
    assert first["scenario"] != second["scenario"]
    assert first["baseline"]["benchmark_strategy"] == "national_crop_median"
    assert second["baseline"]["benchmark_strategy"] == "national_crop_median"


def test_repeating_the_same_scenario_is_deterministic(client):
    _require_data(client)
    body = dict(baseline=_side(BASE_PERIOD), scenario=_side(PREVIOUS_PERIOD))
    assert _scenario(client, **body) == _scenario(client, **body)


def test_an_unchanged_scenario_reports_no_changed_parameters(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(BASE_PERIOD))
    assert body["changes"] == []
    assert body["ranking_movement"]["n_moved"] == 0


def test_changed_assumptions_are_listed_explicitly(client):
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD),
        scenario=_side(
            PREVIOUS_PERIOD,
            benchmark_strategy="national_crop_season_median",
            gap_threshold_pct=10.0,
        ),
    )
    changed = {c["parameter"] for c in body["changes"]}
    assert {"period_code", "benchmark_strategy", "gap_threshold_pct"} <= changed
    for change in body["changes"]:
        assert change["before"] != change["after"]


# --- rank movement ------------------------------------------------------------


def test_rank_movement_is_internally_consistent(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(PREVIOUS_PERIOD))
    movement = body["ranking_movement"]
    assert movement["n_compared"] > 0

    for row in movement["districts"]:
        before, after = row["rank_before"], row["rank_after"]
        if before is None or after is None:
            continue
        assert row["movement"] == before - after, row
        if row["movement"] > 0:
            assert row["direction"] == "up"
        elif row["movement"] < 0:
            assert row["direction"] == "down"
        else:
            assert row["direction"] == "unchanged"


def test_a_changed_district_group_is_reported_as_a_group_change_not_a_fall(client):
    """Restricting to one province must not read as districts deteriorating."""
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD),
        scenario=_side(BASE_PERIOD, province="Eastern"),
    )
    movement = body["ranking_movement"]
    assert movement["left_group"], "districts outside Eastern should leave the group"
    assert movement["n_compared"] < body["baseline"]["stats"]["n_districts"]

    for row in movement["districts"]:
        if row["district"] in movement["left_group"]:
            assert row["rank_after"] is None
            assert row["direction"] == "dropped"

    # Every scenario district is an Eastern one.
    assert {row["province"] for row in body["scenario"]["rows"]} == {"Eastern"}


def test_priority_band_movement_is_only_assessed_for_districts_in_both_views(client):
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD, gap_threshold_pct=5.0),
        scenario=_side(BASE_PERIOD, gap_threshold_pct=5.0, province="Eastern"),
    )
    movement = body["ranking_movement"]
    outside = set(movement["entered_priority"]) | set(movement["left_priority"])
    assert not (outside & set(movement["left_group"]))


# --- missing data never becomes zero -----------------------------------------


def test_a_period_the_crop_was_not_tabulated_for_is_missing_not_zeroed(client):
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD),
        scenario=_side(UNPUBLISHED_FOR_MAIZE),
    )
    side = body["scenario"]
    assert side["missing"] is True
    assert side["rows"] == []
    assert side["stats"]["n_districts"] == 0
    assert side["stats"]["mean_yield_kg_ha"] is None
    assert side["reason"]
    assert "zero" in side["reason"]

    # And the comparison says so rather than reporting a wall of movement.
    assert body["ranking_movement"]["n_compared"] == 0
    assert any("no published rows" in item for item in body["limitations"])


def test_the_available_side_of_a_missing_comparison_is_still_reported(client):
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD),
        scenario=_side(UNPUBLISHED_FOR_MAIZE),
    )
    assert body["baseline"]["missing"] is False
    assert body["baseline"]["stats"]["n_districts"] > 0
    for row in body["baseline"]["rows"]:
        assert row["yield_kg_ha"] is not None


# --- thresholds and criteria --------------------------------------------------


def test_gap_threshold_drives_the_high_priority_flag(client):
    _require_data(client)
    strict = _scenario(
        client,
        baseline=_side(BASE_PERIOD, gap_threshold_pct=200.0),
        scenario=_side(BASE_PERIOD, gap_threshold_pct=200.0),
    )
    assert strict["scenario"]["stats"]["n_below_threshold"] == 0

    loose = _scenario(
        client,
        baseline=_side(BASE_PERIOD, gap_threshold_pct=0.0),
        scenario=_side(BASE_PERIOD, gap_threshold_pct=0.0),
    )
    # Everything below benchmark is at or above a 0% threshold.
    assert (
        loose["scenario"]["stats"]["n_below_threshold"]
        == loose["scenario"]["stats"]["n_below_benchmark"]
    )


def test_every_ranking_criterion_can_rank_the_districts(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(BASE_PERIOD))
    criteria = [item["id"] for item in body["available_ranking_criteria"]]
    assert criteria == ["gap_index", "yield_kg_ha", "production_mt", "harvested_area_ha"]

    for criterion in criteria:
        out = _scenario(
            client,
            baseline=_side(BASE_PERIOD, ranking_criterion=criterion),
            scenario=_side(BASE_PERIOD, ranking_criterion=criterion),
        )
        rows = out["baseline"]["rows"]
        assert rows, criterion
        assert out["baseline"]["ranking_criterion"] == criterion
        assert all(row["rank"] is not None for row in rows), criterion


def test_switching_benchmark_strategy_is_disclosed_as_a_different_question(client):
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD, benchmark_strategy="national_crop_median"),
        scenario=_side(BASE_PERIOD, benchmark_strategy="agro_ecological_peer_group"),
    )
    assert body["scenario"]["benchmark_strategy"] == "agro_ecological_peer_group"
    assert any("different questions" in item for item in body["limitations"])


# --- the benchmark is measured over the whole crop, not the chosen group -------


def test_narrowing_the_group_does_not_move_the_benchmark(client):
    """The reference level is set by the whole crop, not by the group chosen.

    If the benchmark were recomputed inside the group, selecting a
    high-performing province would mechanically shrink every district's gap and
    the scenario would be measuring a different question than the one asked.
    """
    _require_data(client)
    everything = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(BASE_PERIOD))
    eastern = _scenario(
        client,
        baseline=_side(BASE_PERIOD, province="Eastern"),
        scenario=_side(BASE_PERIOD, province="Eastern"),
    )

    all_rows = {row["district"]: row for row in everything["baseline"]["rows"]}
    east_rows = eastern["baseline"]["rows"]
    assert east_rows, "Eastern province should have published Maize districts"

    for row in east_rows:
        reference = all_rows[row["district"]]
        assert row["benchmark_yield_kg_ha"] == reference["benchmark_yield_kg_ha"]
        # Same benchmark means the same gap. Only the *ranking* is group-relative.
        assert row["gap_index"] == reference["gap_index"]
        assert row["below_benchmark"] == reference["below_benchmark"]


def test_the_benchmark_covers_every_published_district_not_the_group(client):
    _require_data(client)
    everything = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(BASE_PERIOD))
    eastern = _scenario(
        client,
        baseline=_side(BASE_PERIOD, province="Eastern"),
        scenario=_side(BASE_PERIOD, province="Eastern"),
    )

    full = everything["baseline"]["stats"]["n_benchmark_districts"]
    grouped = eastern["baseline"]["stats"]

    assert full > 0
    # The benchmark still sees every district, while only the group is displayed.
    assert grouped["n_benchmark_districts"] == full
    assert grouped["n_districts"] < full
    assert grouped["benchmark_scope"]
    assert everything["baseline"]["stats"]["benchmark_scope"] == grouped["benchmark_scope"]


def test_the_disclosure_says_the_benchmark_did_not_move(client):
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD),
        scenario=_side(BASE_PERIOD, province="Eastern"),
    )
    assert any("measured over every published district" in item for item in body["limitations"])
    # The old, incorrect claim must be gone.
    assert not any("within the selected district group" in item for item in body["limitations"])


def test_a_group_with_no_published_rows_is_no_observations_not_zero_yield(client):
    _require_data(client)
    body = _scenario(
        client,
        baseline=_side(BASE_PERIOD, district="Nowhere"),
        scenario=_side(BASE_PERIOD, district="Nowhere"),
    )
    side = body["baseline"]
    assert side["missing"] is True
    assert side["rows"] == []
    assert "zero" in side["reason"]
    # The crop exists for the period, so the benchmark still covers every district.
    assert side["stats"]["n_benchmark_districts"] > 0


# --- model scenario (Mode B) --------------------------------------------------


# The registry is a directory of JSON model cards, not a database table. These
# two tests therefore build their own cards in a temporary directory and point
# ``meta_service.MODELS_DIR`` at it: ``ml/reports`` is gitignored (the real card
# is a training artefact), so a test that reads whatever happens to be on the
# developer's disk passes locally and fails on a clean CI checkout.
_SPATIAL_CARD = {
    "name": "yield_baseline",
    "version": "test",
    "target": "yield_kg_ha",
    "best_model": "ridge",
    "metrics": {"ridge": {"mae": 1316.2, "rmse": 2174.1, "r2": 0.801}},
    "validation_split": "district holdout (every 5th district)",
    "validation_kind": "district_holdout",
    "serves_forecast": False,
}


def _with_model_cards(client, monkeypatch, tmp_path, cards):
    """Serve the scenario endpoint from ``cards`` instead of the checkout."""
    import json
    from pathlib import Path

    from app.services import meta_service

    for index, card in enumerate(cards):
        (Path(tmp_path) / f"card_{index}.json").write_text(json.dumps(card))
    monkeypatch.setattr(meta_service, "MODELS_DIR", Path(tmp_path))


def test_model_scenario_stays_off_for_a_spatially_validated_model(
    client, tmp_path, monkeypatch
):
    """A registered district-holdout yield model must NOT enable mode B.

    Its metrics are real (the registry now reports them), but a district holdout
    measures generalization across districts, not a future season, so it is not
    evidence for a forward-looking scenario.
    """
    _require_data(client)
    _with_model_cards(client, monkeypatch, tmp_path, [_SPATIAL_CARD])
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(PREVIOUS_PERIOD))
    mode_b = body["model_scenario"]
    assert mode_b["available"] is False
    assert mode_b["reason"]
    # The reason states the actual requirement ...
    assert "chronological" in mode_b["reason"]
    # ... and names the insufficient card, so a user is not told no model exists.
    assert "districts" in mode_b["reason"]
    # The warning is present either way, so a future enabled card cannot imply
    # a guaranteed intervention outcome.
    assert "not a" in mode_b["warning"]


def test_model_scenario_stays_off_when_no_model_card_exists_at_all(client, tmp_path, monkeypatch):
    """A clean checkout (CI) has no ``ml/reports/*.json`` at all.

    Mode B must still stay off, and the reason must say that no qualifying model
    is registered rather than naming a card that does not exist.
    """
    _require_data(client)
    _with_model_cards(client, monkeypatch, tmp_path, [])
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(PREVIOUS_PERIOD))
    mode_b = body["model_scenario"]
    assert mode_b["available"] is False
    assert "chronological" in mode_b["reason"]
    assert "districts" not in mode_b["reason"]
    assert "not a" in mode_b["warning"]


# --- evidence -----------------------------------------------------------------


def test_the_response_carries_source_period_and_limitations(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(PREVIOUS_PERIOD))
    prov = body["provenance"]
    assert prov["source_id"]
    assert prov["source_period"] == f"{BASE_PERIOD}-{PREVIOUS_PERIOD}"
    assert prov["benchmark_strategy"] == "national_crop_median"
    assert body["limitations"]
    assert prov["limitations"] == body["limitations"]
    assert body["available_periods"]


def test_rows_expose_the_published_values_behind_each_rank(client):
    _require_data(client)
    body = _scenario(client, baseline=_side(BASE_PERIOD), scenario=_side(BASE_PERIOD))
    for row in body["baseline"]["rows"]:
        assert row["yield_kg_ha"] is not None
        assert row["benchmark_yield_kg_ha"] is not None
        assert row["gap_index"] is not None
        assert row["district"]
