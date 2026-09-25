"""Regression metrics implemented without third-party dependencies."""

from __future__ import annotations

from collections.abc import Sequence


def mae(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    _check(y_true, y_pred)
    return sum(abs(t - p) for t, p in zip(y_true, y_pred, strict=True)) / len(y_true)


def rmse(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    _check(y_true, y_pred)
    return (sum((t - p) ** 2 for t, p in zip(y_true, y_pred, strict=True)) / len(y_true)) ** 0.5


def r2(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    _check(y_true, y_pred)
    mean_t = sum(y_true) / len(y_true)
    ss_tot = sum((t - mean_t) ** 2 for t in y_true)
    ss_res = sum((t - p) ** 2 for t, p in zip(y_true, y_pred, strict=True))
    return 1.0 - ss_res / ss_tot if ss_tot else 0.0


def regression_report(y_true: Sequence[float], y_pred: Sequence[float]) -> dict:
    return {"mae": mae(y_true, y_pred), "rmse": rmse(y_true, y_pred), "r2": r2(y_true, y_pred),
            "n": len(y_true)}


def _check(y_true: Sequence[float], y_pred: Sequence[float]) -> None:
    if len(y_true) != len(y_pred):
        raise ValueError("y_true and y_pred must have equal length")
    if not y_true:
        raise ValueError("empty input")
