from __future__ import annotations

import pytest

from app.analytics.productivity_gap import compute_gaps, productivity_gap


def test_productivity_gap_basic():
    assert productivity_gap(900, 1000) == pytest.approx(10.0)
    assert productivity_gap(1100, 1000) == pytest.approx(-10.0)


def test_productivity_gap_undefined():
    assert productivity_gap(900, 0) is None
    assert productivity_gap(900, None) is None
    assert productivity_gap(None, 1000) is None


def test_compute_gaps_crop_median():
    pd = pytest.importorskip("pandas")
    df = pd.DataFrame(
        {
            "canonical_crop_name": ["Maize", "Maize", "Maize", "Beans", "Beans"],
            "season": ["B"] * 5,
            "yield_kg_ha": [1000.0, 2000.0, 3000.0, 500.0, 500.0],
            "agro_ecological_zone": ["Z1"] * 5,
        }
    )
    out = compute_gaps(df, strategy="national_crop_median")
    # Maize median = 2000; lowest yield -> largest positive gap.
    assert out.loc[0, "benchmark_yield_kg_ha"] == 2000.0
    assert out.loc[0, "gap_index"] == pytest.approx(50.0)
    assert out.loc[2, "gap_index"] == pytest.approx(-50.0)


def test_unknown_strategy_raises():
    pd = pytest.importorskip("pandas")
    df = pd.DataFrame(
        {"canonical_crop_name": ["Maize"], "season": ["B"], "yield_kg_ha": [1000.0]}
    )
    with pytest.raises(ValueError):
        compute_gaps(df, strategy="does-not-exist")
