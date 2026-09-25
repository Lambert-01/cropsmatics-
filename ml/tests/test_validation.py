from __future__ import annotations

import pytest

from ml.src.evaluation.validation import assert_no_leakage, holdout_by_key, season_split

ROWS = [
    {"season": "A", "district": "Gasabo"},
    {"season": "B", "district": "Gasabo"},
    {"season": "B", "district": "Musanze"},
]


def test_season_split():
    train, test = season_split(ROWS, ["B"])
    assert all(r["season"] == "A" for r in train)
    assert all(r["season"] == "B" for r in test)


def test_holdout_by_key():
    train, test = holdout_by_key(ROWS, "district", ["Gasabo"])
    assert all(r["district"] == "Musanze" for r in train)
    assert all(r["district"] == "Gasabo" for r in test)


def test_leakage_detected():
    with pytest.raises(AssertionError):
        assert_no_leakage(ROWS, ROWS, ["district", "season"])
