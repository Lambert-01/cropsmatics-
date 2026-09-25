from __future__ import annotations

from app.analytics.intervention_priority import DEFAULT_WEIGHTS, band_for, priority_score, rank


def test_priority_score_bounds():
    high = priority_score(gap=1.0, vulnerability=1.0, affected_scale=1.0, readiness=1.0,
                          cost_constraint=0.0)
    low = priority_score(gap=0.0, vulnerability=0.0, affected_scale=0.0, readiness=0.0,
                         cost_constraint=1.0)
    assert 0.0 <= low.score <= high.score <= 1.0
    assert high.band == "CRITICAL"
    assert high.weights == DEFAULT_WEIGHTS


def test_cost_constraint_reduces_score():
    without = priority_score(0.8, 0.5, 0.5, 0.5, 0.0)
    with_cost = priority_score(0.8, 0.5, 0.5, 0.5, 1.0)
    assert with_cost.score < without.score


def test_rank_orders_by_score():
    candidates = [
        {"id": "a", "gap": 10, "vulnerability": 1, "affected_scale": 1, "readiness": 0,
         "cost_constraint": 0},
        {"id": "b", "gap": 0, "vulnerability": 0, "affected_scale": 0, "readiness": 1,
         "cost_constraint": 1},
    ]
    ranked = rank(candidates)
    assert ranked[0]["id"] == "a"
    assert ranked[0]["score"] >= ranked[1]["score"]


def test_band_thresholds():
    assert band_for(0.9) == "CRITICAL"
    assert band_for(0.6) == "HIGH"
    assert band_for(0.3) == "MEDIUM"
    assert band_for(0.1) == "LOW"
