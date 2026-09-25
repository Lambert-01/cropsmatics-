from __future__ import annotations

import pytest

from ml.src.evaluation.metrics import mae, r2, regression_report, rmse


def test_mae_rmse():
    assert mae([1, 2, 3], [1, 2, 3]) == 0
    assert rmse([1, 2, 3], [2, 2, 2]) == pytest.approx((2 / 3) ** 0.5)


def test_r2_perfect_and_constant():
    assert r2([1, 2, 3], [1, 2, 3]) == pytest.approx(1.0)
    assert r2([5, 5, 5], [5, 5, 5]) == 0.0


def test_report_shape():
    rep = regression_report([1, 2], [1, 2])
    assert set(rep) == {"mae", "rmse", "r2", "n"}


def test_length_mismatch():
    with pytest.raises(ValueError):
        mae([1, 2], [1])
