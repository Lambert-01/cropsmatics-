from __future__ import annotations

from ml.src.models.intervention_priority import DEFAULT_WEIGHTS, band_for, priority_score, rank


def test_score_bounds_and_weights():
    high = priority_score(1.0, 1.0, 1.0, 1.0, 0.0)
    low = priority_score(0.0, 0.0, 0.0, 0.0, 1.0)
    assert 0.0 <= low["score"] <= high["score"] <= 1.0
    assert high["band"] == "CRITICAL"
    assert high["weights"] == DEFAULT_WEIGHTS


def test_cost_reduces_score():
    assert priority_score(0.8, 0.5, 0.5, 0.5, 1.0)["score"] < priority_score(0.8, 0.5, 0.5, 0.5, 0.0)["score"]


def test_rank_orders():
    ranked = rank([
        {"id": "a", "gap": 10, "vulnerability": 1, "affected_scale": 1, "readiness": 0, "cost_constraint": 0},
        {"id": "b", "gap": 0, "vulnerability": 0, "affected_scale": 0, "readiness": 1, "cost_constraint": 1},
    ])
    assert ranked[0]["id"] == "a"


def test_bands():
    assert band_for(0.9) == "CRITICAL"
    assert band_for(0.6) == "HIGH"
    assert band_for(0.3) == "MEDIUM"
    assert band_for(0.1) == "LOW"
