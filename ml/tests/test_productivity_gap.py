from __future__ import annotations

import pytest

from ml.src.models.productivity_gap import benchmark_yield, compute_gaps, productivity_gap

ROWS = [
    {"canonical_crop_name": "Maize", "season": "B", "year": 2025, "yield_kg_ha": 1000.0},
    {"canonical_crop_name": "Maize", "season": "B", "year": 2025, "yield_kg_ha": 2000.0},
    {"canonical_crop_name": "Maize", "season": "B", "year": 2025, "yield_kg_ha": 3000.0},
    {"canonical_crop_name": "Maize", "season": "B", "year": 2024, "yield_kg_ha": 500.0},
]


def test_scalar_gap():
    assert productivity_gap(900, 1000) == pytest.approx(10.0)
    assert productivity_gap(1100, 1000) == pytest.approx(-10.0)
    assert productivity_gap(900, 0) is None
    assert productivity_gap(None, 100) is None


def test_crop_median_benchmark():
    target = {"canonical_crop_name": "Maize", "season": "B", "yield_kg_ha": 1000.0}
    # national_crop_median pools every year for the crop: median of [500,1000,2000,3000].
    assert benchmark_yield(target, ROWS, "national_crop_median") == 1500.0


def test_crop_season_median_benchmark():
    target = {"canonical_crop_name": "Maize", "season": "A", "yield_kg_ha": 10.0}
    # No season A rows -> undefined benchmark, never invented.
    assert benchmark_yield(target, ROWS, "national_crop_season_median") is None


def test_top_quartile_benchmark():
    target = {"canonical_crop_name": "Maize", "season": "B", "yield_kg_ha": 1000.0}
    # top quartile of [1000,2000,3000] -> 3000
    assert benchmark_yield(target, ROWS, "top_quartile_comparable_districts") == 3000.0


def test_multi_year_baseline():
    target = {"canonical_crop_name": "Maize", "season": "B", "year": 2025, "yield_kg_ha": 1000.0}
    assert benchmark_yield(target, ROWS, "multi_year_crop_baseline") == 500.0


def test_compute_gaps_annotates():
    out = compute_gaps(ROWS, strategy="national_crop_median")
    assert all("gap_index" in r and "benchmark_strategy" in r for r in out)
    # benchmark 1500, observed 1000 -> 100*(1500-1000)/1500.
    assert out[0]["gap_index"] == pytest.approx(33.3333, abs=1e-3)


def test_unknown_strategy():
    with pytest.raises(ValueError):
        benchmark_yield(ROWS[0], ROWS, "nope")
