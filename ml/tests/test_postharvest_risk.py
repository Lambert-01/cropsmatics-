from __future__ import annotations

from ml.src.models.postharvest_risk import PostHarvestRiskModel, band_for


def test_low_risk_for_sturdy_crop_small_volume():
    r = PostHarvestRiskModel().score(
        "Maize", expected_quantity_kg=50, perishability="low", rainfall_risk="low",
        distance_km=5, capacity_available_kg=1000,
    )
    assert r.band == "LOW"
    assert 0.0 <= r.probability <= 1.0


def test_high_risk_for_perishable_volume():
    r = PostHarvestRiskModel().score(
        "Vegetables", expected_quantity_kg=2000, perishability="high", rainfall_risk="high",
        distance_km=40, capacity_available_kg=None,
    )
    assert r.band == "HIGH"
    assert any("capacity not verified" in f for f in r.contributing_factors)


def test_unverified_capacity_is_flagged():
    r = PostHarvestRiskModel().score("Maize", expected_quantity_kg=100, capacity_available_kg=None)
    assert any("not verified" in f for f in r.contributing_factors)


def test_bands():
    assert band_for(0.9) == "HIGH"
    assert band_for(0.5) == "MODERATE"
    assert band_for(0.1) == "LOW"
