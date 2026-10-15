"""Offline priority-scoring tests, including 2.0.0 eligibility parity.

The served engine is ``services/api/app/analytics/intervention_priority.py``. The
ML module cannot import it (the pipeline installs without the API package), so the
rule is stated in both places and pinned here against the same cases the API suite
pins in ``services/api/tests/test_priority_eligibility.py``. If the two ever
disagree, one of these suites fails.
"""

from __future__ import annotations

from ml.src.models.intervention_priority import (
    COMPONENT_WEIGHT_KEYS,
    DEFAULT_PURPOSE,
    DEFAULT_WEIGHTS,
    PURPOSE_HARVEST_COORDINATION,
    PURPOSE_PRODUCTIVITY_SUPPORT,
    band_for,
    build_population,
    effective_weights,
    eligibility,
    priority_score,
    rank,
    shortfall_pct,
)


def _candidate(identifier: str, **overrides) -> dict:
    base = {
        "id": identifier,
        "gap": 20.0,
        "vulnerability": 0.5,
        "affected_scale": 100.0,
        "readiness": 0.2,
        "cost_constraint": 0.1,
        "harvested_area_ha": 100.0,
    }
    base.update(overrides)
    return base


def test_score_bounds_and_weights():
    high = priority_score(1.0, 1.0, 1.0, 1.0, 0.0)
    low = priority_score(0.0, 0.0, 0.0, 0.0, 1.0)
    assert 0.0 <= low["score"] <= high["score"] <= 1.0
    assert high["band"] == "CRITICAL"
    assert high["weights"] == DEFAULT_WEIGHTS


def test_cost_reduces_score():
    assert priority_score(0.8, 0.5, 0.5, 0.5, 1.0)["score"] < priority_score(0.8, 0.5, 0.5, 0.5, 0.0)["score"]


def test_rank_orders_eligible_candidates():
    ranked = rank(
        [
            _candidate("a", gap=40.0),
            _candidate("b", gap=10.0),
        ]
    )
    assert [row["id"] for row in ranked] == ["a", "b"]
    assert all(row["eligible"] for row in ranked)
    assert all(row["priority_purpose"] == PURPOSE_PRODUCTIVITY_SUPPORT for row in ranked)


def test_bands():
    assert band_for(0.9) == "CRITICAL"
    assert band_for(0.6) == "HIGH"
    assert band_for(0.3) == "MEDIUM"
    assert band_for(0.1) == "LOW"


# --- 2.0.0 parity with the served engine --------------------------------------


def test_an_above_benchmark_candidate_is_excluded_not_low():
    """Same case as the API suite: a large area must not carry a surplus to the top."""
    candidates = [
        _candidate("above", gap=-20.0, affected_scale=9000.0, harvested_area_ha=9000.0),
        _candidate("below", gap=15.0, affected_scale=50.0, harvested_area_ha=50.0),
        _candidate("other", gap=5.0, affected_scale=50.0, harvested_area_ha=50.0),
    ]
    population = build_population(candidates)
    assert population.eligible_ids == ("below", "other")
    assert "above the selected benchmark" in population.ineligible["above"]
    assert [row["id"] for row in rank(candidates)] == ["below", "other"]


def test_a_candidate_at_the_benchmark_is_ineligible():
    population = build_population([_candidate("at", gap=0.0), _candidate("under", gap=5.0)])
    assert population.eligible_ids == ("under",)


def test_the_shortfall_ignores_a_surplus():
    assert shortfall_pct(30.0) == 30.0
    assert shortfall_pct(-30.0) == 0.0
    assert shortfall_pct(None) is None


def test_a_constant_component_is_excluded_and_its_weight_redistributed():
    candidates = [
        _candidate("a", gap=30.0, vulnerability=0.5),
        _candidate("b", gap=10.0, vulnerability=0.5),
    ]
    population = build_population(candidates)
    assert "vulnerability" in population.constant
    assert "vulnerability" not in population.normalized
    weights = effective_weights(None, population.unavailable)
    assert weights[COMPONENT_WEIGHT_KEYS["vulnerability"]] == 0.0
    assert abs(sum(weights.values()) - 1.0) < 1e-6


def test_a_missing_component_is_excluded():
    candidates = [_candidate("a", gap=30.0), _candidate("b", gap=10.0)]
    population = build_population(candidates, unavailable=("readiness",))
    weights = effective_weights(None, population.unavailable)
    assert weights["wr"] == 0.0
    assert abs(sum(weights.values()) - 1.0) < 1e-6


def test_a_one_candidate_population_excludes_every_component():
    population = build_population([_candidate("only", gap=25.0)])
    assert population.n_reference == 1
    assert population.normalized == {}


def test_harvest_coordination_is_a_different_named_question():
    candidates = [
        _candidate("above", gap=-20.0, affected_scale=9000.0, harvested_area_ha=9000.0),
        _candidate("below", gap=15.0, affected_scale=50.0, harvested_area_ha=50.0),
    ]
    assert build_population(candidates).eligible_ids == ("below",)
    assert set(
        build_population(candidates, purpose=PURPOSE_HARVEST_COORDINATION).eligible_ids
    ) == {"above", "below"}


def test_eligibility_reasons_name_the_fact_that_excluded_the_candidate():
    ok, reason = eligibility(gap_pct=None)
    assert ok is False and "no published benchmark comparison" in reason
    ok, reason = eligibility(gap_pct=-5.0)
    assert ok is False and "above the selected benchmark" in reason
    ok, reason = eligibility(gap_pct=5.0)
    assert ok is True and reason is None
    assert DEFAULT_PURPOSE == PURPOSE_PRODUCTIVITY_SUPPORT
