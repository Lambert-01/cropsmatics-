"""Intervention Sensitivity Lab: the ranking-robustness contract.

The sweep re-ranks the planner's candidates under many plausible weightings. These
tests pin the properties that stop a robustness share from being read as a
probability, and that stop the sweep from being irreproducible:

* the same seed produces the same numbers, so a result can be reviewed;
* the reported share is labelled a robustness share and explicitly not a probability;
* the weighting actually used is a non-negative simplex;
* the sweep contains exactly the number of weightings it claims;
* the baseline rank agrees with the planner's endpoint;
* a selection with no candidates is an empty, honest table - not a stable ranking.
"""

from __future__ import annotations

import pytest

PERIOD = "2026B"
UNPUBLISHED_PERIOD = "2026C"


def _require_data(client) -> None:
    resp = client.get(
        "/api/v1/analytics/intervention-priorities", params={"period_code": PERIOD, "limit": 1}
    )
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _sweep(client, **body) -> dict:
    res = client.post("/api/v1/scenarios/sensitivity", json={"period_code": PERIOD, **body})
    assert res.status_code == 200, res.text
    return res.json()


# --- guardrails ----------------------------------------------------------------


def test_the_share_is_labelled_a_robustness_share_and_not_a_probability(client):
    _require_data(client)
    body = _sweep(client)
    disclaimer = body["disclaimer"].lower()
    assert "not a probability" in disclaimer
    assert "robustness" in disclaimer
    joined = " ".join(body["limitations"]).lower()
    assert "not a probability" in joined
    assert "not a confidence level" in joined
    assert "does not express uncertainty in the data" in joined


def test_an_unpublished_period_is_rejected(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/sensitivity", json={"period_code": UNPUBLISHED_PERIOD}
    )
    assert res.status_code == 422
    assert UNPUBLISHED_PERIOD in res.json()["detail"]


def test_a_sweep_that_tests_nothing_is_refused(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/sensitivity",
        json={"period_code": PERIOD, "n_random": 0, "include_presets": False},
    )
    assert res.status_code == 422
    assert "at least one weighting" in res.json()["detail"]


def test_n_random_beyond_the_cap_is_rejected(client):
    _require_data(client)
    res = client.post(
        "/api/v1/scenarios/sensitivity", json={"period_code": PERIOD, "n_random": 5000}
    )
    assert res.status_code == 422


# --- reproducibility -----------------------------------------------------------


def test_the_sweep_is_deterministic_for_a_seed(client):
    _require_data(client)
    first = _sweep(client, n_random=50, seed=7)
    second = _sweep(client, n_random=50, seed=7)
    assert first == second


def test_a_different_seed_tests_different_weightings(client):
    _require_data(client)
    first = _sweep(client, n_random=200, seed=1)
    second = _sweep(client, n_random=200, seed=999)
    assert first["seed"] != second["seed"]
    # Same test count, different draws: the inclusion counts must not coincide.
    assert first["n_scenarios_tested"] == second["n_scenarios_tested"]
    assert [row["top_n_inclusions"] for row in first["rows"]] != [
        row["top_n_inclusions"] for row in second["rows"]
    ]


def test_the_sweep_contains_exactly_what_it_claims(client):
    _require_data(client)
    body = _sweep(client, n_random=40)
    assert body["n_random_draws"] == 40
    assert body["presets_included"]
    assert body["n_scenarios_tested"] == 40 + len(body["presets_included"])
    assert set(body["presets_included"]) <= set(body["presets"])


def test_presets_only_sweep_tests_exactly_the_presets(client):
    _require_data(client)
    body = _sweep(client, n_random=0, include_presets=True)
    assert body["presets_included"]
    assert body["n_scenarios_tested"] == len(body["presets_included"])
    assert body["n_random_draws"] == 0


# --- the reported numbers ------------------------------------------------------


def test_every_testing_weighting_is_a_non_negative_simplex(client):
    _require_data(client)
    body = _sweep(client, n_random=10)
    weights = body["weights"]
    assert set(weights) == set(body["weight_labels"])
    assert all(value >= 0 for value in weights.values())
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-9)
    for preset in body["presets"].values():
        assert all(value >= 0 for value in preset.values())
        assert sum(preset.values()) == pytest.approx(1.0, abs=1e-9)


def test_band_counts_account_for_every_tested_weighting(client):
    _require_data(client)
    body = _sweep(client, n_random=30)
    tested = body["n_scenarios_tested"]
    for row in body["rows"]:
        assert sum(row["band_counts"].values()) == tested
        band_shares = row["band_shares_pct"].values()
        assert sum(band_shares) == pytest.approx(100.0, abs=0.5)


def test_robustness_shares_are_bounded_and_the_flag_matches_without_invention(client):
    _require_data(client)
    body = _sweep(client, n_random=60)
    for row in body["rows"]:
        assert 0.0 <= row["top_n_share_pct"] <= 100.0
        assert 0.0 <= row["band_stability_pct"] <= 100.0
        assert row["best_rank"] <= row["worst_rank"]
        assert row["worst_rank"] - row["best_rank"] == row["rank_range"]
        # The flag is derived from the share, so it can never contradict it.
        assert row["robust"] == (row["top_n_share_pct"] >= 75.0)
    assert body["robust_count"] == sum(1 for row in body["rows"] if row["robust"])


def test_the_shortlist_cutoff_is_the_one_that_was_asked_for(client):
    _require_data(client)
    body = _sweep(client, n_random=40, top_n=3)
    assert body["top_n"] == 3
    for row in body["rows"]:
        assert 0 <= row["top_n_inclusions"] <= body["n_scenarios_tested"]
    # A tighter shortlist cannot be entered more often than a looser one.
    wider = _sweep(client, n_random=40, top_n=30, seed=body["seed"])
    tight = {row["id"]: row["top_n_inclusions"] for row in body["rows"]}
    for row in wider["rows"]:
        assert row["top_n_inclusions"] >= tight[row["id"]]


def test_baseline_ranks_agree_with_the_planner_endpoint(client):
    _require_data(client)
    planner = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PERIOD, "limit": 500},
    ).json()
    body = _sweep(client, n_random=0)

    assert body["districts_analysed"] == len(planner["rows"])
    top = [row for row in body["rows"] if row["baseline_rank"] == 1][0]
    assert top["id"] == planner["rows"][0]["id"]
    assert top["baseline_score"] == pytest.approx(planner["rows"][0]["score"], abs=1e-6)


def test_no_candidate_is_invented(client):
    _require_data(client)
    planner = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PERIOD, "limit": 500},
    ).json()
    allowed = {row["id"] for row in planner["rows"]}
    body = _sweep(client, n_random=20)
    assert {row["id"] for row in body["rows"]} <= allowed


# --- honest emptiness ----------------------------------------------------------


def test_a_selection_with_no_candidates_is_an_empty_table_not_a_stable_ranking(client):
    _require_data(client)
    body = _sweep(client, crop="NotARealCrop")
    assert body["districts_analysed"] == 0
    assert body["rows"] == []
    assert body["robust_count"] == 0
    assert any("nothing to test" in line for line in body["limitations"])


def test_provenance_describes_the_sweep(client):
    _require_data(client)
    body = _sweep(client, n_random=25, seed=11)
    provenance = body["provenance"]
    assert "deterministic" in provenance["method"].lower()
    assert "seed 11" in provenance["method"]
    assert provenance["limitations"]
