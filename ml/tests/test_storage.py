from __future__ import annotations

import pytest

from ml.src.optimization.storage import Facility, Source, allocate


def _require_ortools():
    pytest.importorskip("ortools")


def test_allocation_respects_capacity_and_supply():
    _require_ortools()
    sources = [Source("s1", 100.0, "Maize"), Source("s2", 100.0, "Maize")]
    facilities = [Facility("f1", 150.0), Facility("f2", 150.0)]
    distances = {("s1", "f1"): 1, ("s1", "f2"): 2, ("s2", "f1"): 2, ("s2", "f2"): 1}
    result = allocate(sources, facilities, distances)
    assert result.status == "OPTIMAL"
    assert sum(a["quantity_kg"] for a in result.assignments) == pytest.approx(200.0, abs=1e-3)
    for f in facilities:
        got = sum(a["quantity_kg"] for a in result.assignments if a["facility"] == f.id)
        assert got <= f.capacity_kg + 1e-3


def test_unverified_capacity_excluded():
    _require_ortools()
    result = allocate(
        [Source("s1", 50.0, "Maize")],
        [Facility("f1", None), Facility("f2", 50.0)],
        {("s1", "f1"): 1, ("s1", "f2"): 5},
    )
    assert "f1" in result.capacity_not_verified
    assert all(a["facility"] != "f1" for a in result.assignments)


def test_crop_compatibility():
    _require_ortools()
    result = allocate(
        [Source("s1", 10.0, "Banana")],
        [Facility("f1", 100.0, crops=["Maize"])],
        {("s1", "f1"): 1},
    )
    assert result.status == "INFEASIBLE"
