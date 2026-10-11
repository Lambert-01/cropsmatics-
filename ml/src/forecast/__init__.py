"""Honest agricultural forecasting: targets, chronological backtests, gates.

This package exists so that the platform can answer "what is the next comparable
season's yield likely to be?" **only** where the published record actually
supports it, and so that a suppression is a first-class, explainable result
rather than a silent failure.

It is deliberately separate from ``ml.src.pipelines.run_training``. That pipeline
holds out *districts* to measure how a model generalizes spatially; a district
holdout is not evidence about a future season and must never be presented as a
forecast. The only validation that counts here is a rolling-origin,
strictly chronological backtest on the target's own time axis.
"""

from ml.src.forecast.backtest import (
    BacktestPolicy,
    BacktestResult,
    Fold,
    evaluate_series,
    run_backtest,
)
from ml.src.forecast.targets import CANDIDATE_TARGETS, ForecastTarget, target_series

__all__ = [
    "CANDIDATE_TARGETS",
    "BacktestPolicy",
    "BacktestResult",
    "Fold",
    "ForecastTarget",
    "evaluate_series",
    "run_backtest",
    "target_series",
]
