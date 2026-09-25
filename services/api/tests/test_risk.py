"""Post-harvest risk endpoint tests.

The product rule under test: a rule-based score must be labelled as a risk score
with its rule/model version, not sold as a calibrated probability of loss, and
every contribution must be explainable.
"""

from __future__ import annotations


def _score(client, **payload):
    res = client.post("/api/v1/risk/post-harvest", json=payload)
    assert res.status_code == 200
    return res.json()


def test_risk_returns_structured_factors_and_actions(client):
    body = _score(client, crop="Maize", expected_quantity_kg=1500)

    assert body["factors"], "factors must be structured for the UI to explain the score"
    for factor in body["factors"]:
        assert set(factor) == {"factor", "factor_value", "impact", "reason"}
        assert isinstance(factor["impact"], int | float)
        assert factor["reason"]

    assert body["actions"]
    for action in body["actions"]:
        assert set(action) == {"action", "reason", "priority"}
        assert action["priority"] in {"HIGH", "MEDIUM", "LOW"}
        assert action["reason"]


def test_risk_is_labelled_a_rule_score_not_ai_confidence(client):
    body = _score(client, crop="Maize")

    assert body["score_label"] == "Risk score"
    assert body["model_version"]
    assert body["provenance"]["model_version"] == body["model_version"]

    serialised = str(body).lower()
    assert "ai confidence" not in serialised
    assert "confidence" not in serialised


def test_risk_string_views_stay_backward_compatible(client):
    body = _score(client, crop="Maize", expected_quantity_kg=500)
    assert body["contributing_factors"]
    assert body["recommended_actions"]
    assert isinstance(body["contributing_factors"][0], str)
    assert isinstance(body["recommended_actions"][0], str)


def test_unverified_capacity_is_treated_conservatively(client):
    body = _score(client, crop="Maize")
    assert body["capacity_context"] == "capacity_not_verified"

    factor_names = " ".join(f["factor"] for f in body["factors"]).lower()
    assert "capacity" in factor_names


def test_band_tracks_the_reported_probability(client):
    low = _score(client, crop="Cassava")
    assert low["band"] in {"LOW", "MODERATE", "HIGH"}
    assert 0.0 <= low["probability"] <= 1.0
