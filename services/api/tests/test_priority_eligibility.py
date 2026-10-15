"""Productivity-support eligibility: the defects this suite exists to prevent.

Two reported behaviours are pinned here.

1. **Maize 2026B Nyagatare ranked HIGH while its yield was above the selected
   benchmark.** The engine min-max normalized ``gap_index`` across the whole
   population, so a candidate with *no* shortfall still received a positive gap
   component, and with a large harvested area could reach the HIGH band. An
   above-benchmark candidate is now **ineligible** with a stated reason - not
   LOW, which would still present it as a priority of some degree.
2. **Inspecting one district redefined its own score.** The candidate frame was
   filtered by the request's district before normalizing, so a single-district
   view normalized over one candidate - which replaces every component with a
   neutral constant. The population is now the *reference scope* (the same crop,
   period, benchmark and province, all districts), and the district narrows only
   what is displayed.

The remaining cases cover the properties the fix must not break: monotonicity,
a constant component, a missing component, and an honest unavailable state.
"""

from __future__ import annotations

import pytest

from app.analytics import intervention_priority as ip

PERIOD = "2026B"


def _candidate(identifier: str, **overrides) -> dict:
    base = {
        "id": identifier,
        "district": identifier.title(),
        "crop": "Maize",
        "gap": 20.0,
        "vulnerability": 0.5,
        "affected_scale": 100.0,
        "readiness": 0.2,
        "cost_constraint": 0.1,
        "harvested_area_ha": 100.0,
    }
    base.update(overrides)
    return base


# --- the reported defect, at the engine level ---------------------------------


def test_an_above_benchmark_candidate_is_ineligible_not_low():
    """A district above its benchmark must not appear in a shortfall ranking.

    This is the exact reported symptom: a huge harvested area carried a candidate
    with a *negative* gap to the top of the list.
    """
    candidates = [
        _candidate("above", gap=-20.0, affected_scale=9000.0, harvested_area_ha=9000.0),
        _candidate("below", gap=15.0, affected_scale=50.0, harvested_area_ha=50.0),
        _candidate("other", gap=5.0, affected_scale=50.0, harvested_area_ha=50.0),
    ]
    population = ip.build_population(candidates)

    assert population.eligible_ids == ("below", "other")
    assert "above" in population.ineligible
    assert "above the selected benchmark" in population.ineligible["above"]

    ranked = ip.rank(candidates)
    assert [row["id"] for row in ranked] == ["below", "other"]
    # The ineligible candidate is absent entirely - it is not a LOW row.
    assert all(row["band"] != "LOW" or row["id"] != "above" for row in ranked)
    assert "above" not in {row["id"] for row in ranked}


def test_a_candidate_exactly_at_the_benchmark_is_ineligible():
    population = ip.build_population([_candidate("at", gap=0.0), _candidate("under", gap=5.0)])
    assert population.eligible_ids == ("under",)
    assert "at" in population.ineligible


def test_the_shortfall_component_ignores_a_surplus():
    """The gap component is max(gap, 0), so a surplus cannot score positively."""
    assert ip.shortfall_pct(30.0) == 30.0
    assert ip.shortfall_pct(-30.0) == 0.0
    assert ip.shortfall_pct(0.0) == 0.0
    assert ip.shortfall_pct(None) is None


def test_a_threshold_above_zero_is_honoured():
    candidates = [_candidate("small", gap=3.0), _candidate("large", gap=30.0)]
    population = ip.build_population(candidates, threshold_pct=10.0)
    assert population.eligible_ids == ("large",)
    assert "10.0% below" in population.ineligible["small"]


def test_a_candidate_with_no_published_benchmark_is_ineligible():
    """Missing is not a shortfall. It is reported as unmeasurable."""
    population = ip.build_population([_candidate("nobench", gap=None), _candidate("ok", gap=9.0)])
    assert population.eligible_ids == ("ok",)
    assert "no published benchmark comparison" in population.ineligible["nobench"]


# --- monotonicity --------------------------------------------------------------


def test_ranking_is_monotonic_in_the_shortfall():
    """A strictly larger shortfall, with everything else equal, cannot rank lower."""
    candidates = [
        _candidate("big", gap=40.0),
        _candidate("middle", gap=20.0),
        _candidate("small", gap=5.0),
    ]
    ranked = ip.rank(candidates)
    assert [row["id"] for row in ranked] == ["big", "middle", "small"]
    scores = [row["score"] for row in ranked]
    assert scores == sorted(scores, reverse=True)


def test_moving_one_candidate_further_below_its_benchmark_cannot_lower_its_score():
    before = ip.rank([_candidate("a", gap=10.0), _candidate("b", gap=30.0)])
    after = ip.rank([_candidate("a", gap=10.0), _candidate("b", gap=35.0)])
    a_before = next(row for row in before if row["id"] == "a")
    a_after = next(row for row in after if row["id"] == "a")
    # `a`'s own gap is unchanged; the relative normalization can only move it
    # toward the bottom, never above the candidate with the larger shortfall.
    assert a_after["score"] <= a_before["score"] + 1e-9
    assert next(row for row in after if row["id"] == "b")["score"] == max(
        row["score"] for row in after
    )


# --- constant and missing components ------------------------------------------


def test_a_constant_component_is_excluded_rather_than_scored_as_a_constant():
    """A perishability value identical across the population distinguishes nobody."""
    candidates = [
        _candidate("a", gap=30.0, vulnerability=0.5),
        _candidate("b", gap=10.0, vulnerability=0.5),
    ]
    population = ip.build_population(candidates)
    assert "vulnerability" in population.constant
    assert "vulnerability" in population.unavailable
    assert "vulnerability" not in population.normalized

    weights = ip.effective_weights(None, population.unavailable)
    assert weights["wv"] == 0.0
    # The redistributed weighting still sums to 1, so it is a valid simplex.
    assert abs(sum(weights.values()) - 1.0) < 1e-6


def test_a_constant_component_does_not_change_the_order():
    varied = ip.rank([_candidate("a", gap=30.0, vulnerability=0.1), _candidate("b", gap=10.0, vulnerability=0.9)])
    constant = ip.rank([_candidate("a", gap=30.0, vulnerability=0.5), _candidate("b", gap=10.0, vulnerability=0.5)])
    # Only the gap varies in the second case, so the order is decided by the gap.
    assert [r["id"] for r in varied] == ["a", "b"]
    assert [r["id"] for r in constant] == ["a", "b"]


def test_an_unavailable_component_is_excluded_and_its_weight_redistributed():
    candidates = [_candidate("a", gap=30.0), _candidate("b", gap=10.0)]
    population = ip.build_population(candidates, unavailable=("readiness",))
    weights = ip.effective_weights(None, population.unavailable)
    assert weights["wr"] == 0.0
    assert abs(sum(weights.values()) - 1.0) < 1e-6
    # Every remaining score is still a weighted sum of present components.
    assert all(0.0 <= row["score"] <= 1.0 for row in ip.rank(candidates, unavailable=("readiness",)))


def test_a_population_with_one_candidate_excludes_every_component():
    """Nothing to compare against: report no discriminating components."""
    population = ip.build_population([_candidate("only", gap=25.0)])
    assert population.n_reference == 1
    assert set(population.unavailable) == set(ip.COMPONENTS)
    assert population.normalized == {}


def test_an_empty_population_has_no_eligible_candidate():
    assert ip.build_population([]).eligible_ids == ()
    assert ip.rank([]) == []


# --- reference population ------------------------------------------------------


def test_the_population_is_not_redefined_by_narrowing_the_display():
    """The invariant the district-inspection bug violated."""
    everything = [_candidate("a", gap=30.0), _candidate("b", gap=20.0), _candidate("c", gap=5.0)]
    full = ip.rank(everything)
    # The engine is handed the same reference population; the caller then filters
    # the scored rows. `c`'s score is therefore identical in both views.
    narrowed = [row for row in full if row["district"] == "C"]
    assert narrowed and narrowed[0]["score"] == next(r for r in full if r["id"] == "c")["score"]
    assert narrowed[0]["reference_n"] == 3


def test_scoring_only_the_inspected_candidate_excludes_every_component():
    """Shows why the population must not be narrowed, so the guard cannot regress.

    A one-candidate population has nothing to compare against, so every component
    is excluded and no component value exists at all. This is what previously
    happened when a district filter shrank the candidate frame to one row: the
    score was built from constants rather than from the reference population.
    """
    narrowed = ip.build_population([_candidate("only", gap=20.0)])
    assert narrowed.normalized == {}
    assert set(narrowed.unavailable) == set(ip.COMPONENTS)


# --- harvest coordination is a different, named question -----------------------


def test_harvest_coordination_does_not_require_a_shortfall_and_is_named_differently():
    candidates = [
        _candidate("above", gap=-20.0, affected_scale=9000.0, harvested_area_ha=9000.0),
        _candidate("below", gap=15.0, affected_scale=50.0, harvested_area_ha=50.0),
    ]
    productivity = ip.build_population(candidates)
    coordination = ip.build_population(candidates, purpose=ip.PURPOSE_HARVEST_COORDINATION)

    assert productivity.eligible_ids == ("below",)
    # The above-benchmark candidate IS a coordination target: the question is
    # operational scale, not shortfall.
    assert set(coordination.eligible_ids) == {"above", "below"}
    assert ip.PURPOSE_LABELS[ip.PURPOSE_HARVEST_COORDINATION] != ip.PURPOSE_LABELS[
        ip.PURPOSE_PRODUCTIVITY_SUPPORT
    ]
    assert "not a productivity-shortfall ranking" in ip.PURPOSE_NOTES[
        ip.PURPOSE_HARVEST_COORDINATION
    ]


def test_harvest_coordination_requires_a_measured_scale():
    population = ip.build_population(
        [_candidate("noarea", harvested_area_ha=None), _candidate("ok", harvested_area_ha=10.0)],
        purpose=ip.PURPOSE_HARVEST_COORDINATION,
    )
    assert population.eligible_ids == ("ok",)
    assert "no published harvested area" in population.ineligible["noarea"]


def test_an_unknown_purpose_is_refused():
    with pytest.raises(ValueError, match="unknown planning purpose"):
        ip.build_population([_candidate("a")], purpose="whatever_is_most_convenient")


# --- the served endpoint -------------------------------------------------------


def _require_data(client) -> None:
    resp = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PERIOD, "limit": 1},
    )
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _priorities(client, **params) -> dict:
    params.setdefault("period_code", PERIOD)
    params.setdefault("limit", 500)
    res = client.get("/api/v1/analytics/intervention-priorities", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def test_no_above_benchmark_candidate_is_served_as_a_priority(client):
    """The end-to-end form of the reported defect, over every published candidate."""
    _require_data(client)
    body = _priorities(client, crop="Maize")
    assert body["rows"], "expected a Maize shortlist for the latest district release"

    for row in body["rows"]:
        assert row["eligible"] is True
        assert row["shortfall_pct"] is not None
        assert row["shortfall_pct"] > 0, row
        # A HIGH/CRITICAL band must rest on a real shortfall.
        if row["band"] in ("CRITICAL", "HIGH"):
            assert row["gap"] > 0, row


def test_ineligible_candidates_are_reported_with_a_reason(client):
    _require_data(client)
    body = _priorities(client, crop="Maize")
    assert body["n_ineligible"] > 0, "expected some Maize districts at or above the median benchmark"
    assert len(body["ineligible"]) == body["n_ineligible"]
    for entry in body["ineligible"]:
        assert entry["reason"]
    # The counts partition the published candidate set.
    assert body["n_eligible"] == len(body["rows"]) or body["n_eligible"] >= len(body["rows"])


def test_the_response_states_its_purpose_and_methodology_version(client):
    _require_data(client)
    body = _priorities(client, crop="Maize")
    assert body["purpose"] == "productivity_support"
    assert body["purpose_label"] == "Productivity support"
    assert body["methodology_version"] == "2.0.1"
    assert body["shortfall_threshold_pct"] == 0.0
    assert "does not change that population or its score" in body["reference_population_note"]


def test_inspecting_one_district_does_not_change_its_score(client):
    """The stable-population acceptance condition, through the real endpoint."""
    _require_data(client)
    full = _priorities(client, crop="Maize")
    top = full["rows"][0]

    narrowed = _priorities(client, crop="Maize", district=top["district"])
    assert narrowed["rows"], f"expected {top['district']} to still be listed"
    same = next(
        (row for row in narrowed["rows"] if row["id"] == top["id"]),
        None,
    )
    assert same is not None, "the inspected district's candidate disappeared"
    assert same["score"] == pytest.approx(top["score"], abs=1e-9)
    assert same["band"] == top["band"]
    assert same["affected_scale"] == pytest.approx(top["affected_scale"], abs=1e-9)
    # ...and the reference population is the same one, so the comparison is honest.
    assert same["reference_n"] == top["reference_n"]


def test_the_map_and_the_ranking_agree_about_who_is_a_priority(client):
    """One eligibility rule for every consumer."""
    _require_data(client)
    body = _priorities(client, crop="Maize")
    # The map colours one value per district from the best-scoring eligible
    # candidate, so every coloured district must own at least one eligible row.
    ranked_districts = {row["district"] for row in body["rows"]}

    res = client.get(
        "/api/v1/maps/district-metrics",
        params={"metric": "priority", "crop": "Maize", "period_code": PERIOD},
    )
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    assert res.status_code == 200, res.text
    coloured = {
        row["district"] for row in res.json()["districts"] if row.get("value") is not None
    }
    assert coloured <= ranked_districts, (
        f"map coloured districts with no eligible candidate: {sorted(coloured - ranked_districts)}"
    )


def test_harvest_coordination_is_served_as_a_named_different_ranking(client):
    _require_data(client)
    productivity = _priorities(client, crop="Maize", purpose="productivity_support")
    coordination = _priorities(client, crop="Maize", purpose="harvest_coordination")

    assert coordination["purpose"] == "harvest_coordination"
    assert coordination["purpose_label"] == "Harvest coordination"
    assert coordination["purpose_label"] != productivity["purpose_label"]
    # The two rankings answer different questions, so they need not agree.
    assert coordination["n_eligible"] >= productivity["n_eligible"]


def test_an_unknown_purpose_is_rejected_by_the_endpoint(client):
    _require_data(client)
    res = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PERIOD, "purpose": "shortest_path_to_a_decision"},
    )
    assert res.status_code == 422
