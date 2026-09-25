from __future__ import annotations

import pytest

from app.optimization.storage_allocation import Facility, Source, allocate


def _require_ortools():
    pytest.importorskip("ortools")


def test_allocate_respects_capacity():
    _require_ortools()
    sources = [Source("s1", 100.0, "Maize"), Source("s2", 100.0, "Maize")]
    facilities = [
        Facility("f1", 100.0, storage_cost_per_kg=1.0),
        Facility("f2", 100.0, storage_cost_per_kg=2.0),
    ]
    distances = {("s1", "f1"): 1, ("s1", "f2"): 1, ("s2", "f1"): 1, ("s2", "f2"): 1}
    result = allocate(sources, facilities, distances)
    assert result.status == "OPTIMAL"
    total = sum(a["quantity_kg"] for a in result.assignments)
    assert total == pytest.approx(200.0, abs=1e-3)
    for f in facilities:
        allocated = sum(a["quantity_kg"] for a in result.assignments if a["facility"] == f.id)
        assert allocated <= f.capacity_kg + 1e-3


def test_unverified_capacity_never_used():
    _require_ortools()
    sources = [Source("s1", 50.0, "Maize")]
    facilities = [Facility("f1", None), Facility("f2", 50.0)]
    result = allocate(sources, facilities, {("s1", "f2"): 5, ("s1", "f1"): 1})
    assert "f1" in result.capacity_not_verified
    assert all(a["facility"] != "f1" for a in result.assignments)
    assert any("capacity_not_verified" in n for n in result.notes)


def test_infeasible_when_no_capacity():
    _require_ortools()
    result = allocate([Source("s1", 10.0, "Maize")], [Facility("f1", None)], {})
    assert result.status == "INFEASIBLE"
    assert "f1" in result.capacity_not_verified
