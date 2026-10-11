"""Chronological rolling-origin backtesting for forecast targets.

The rules this module enforces, because getting any of them wrong makes every
number it prints meaningless:

* **Chronological only.** Folds are expanding-window and strictly ordered: a
  prediction for period *t* is trained only on periods before *t*. Rows are never
  shuffled and no random split is ever used.
* **One series per (target, entity).** A season-A forecast trains only on
  season-A observations, and the all-farmer series is never mixed with the
  small/large-scale series. Stacking them would manufacture observations that do
  not exist.
* **Naive baselines first.** A candidate method is only interesting if it beats
  the best naive baseline on the same folds. With five published same-season
  observations per district there is no honest case for a complex model.
* **Suppression is a result.** If the record cannot support the target, the
  outcome is ``insufficient_evidence`` with a readable reason, never a number
  with a caveat attached.

Everything is plain Python + math so the same code can run in a test without a
scientific stack.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from dataclasses import asdict, dataclass, field

import pandas as pd

from ml.src.forecast.targets import ForecastTarget, target_series

#: 80% two-sided interval half-width in residual standard deviations.
Z_80 = 1.2816


@dataclass(frozen=True)
class BacktestPolicy:
    """Documented, testable thresholds - not invented universal constants.

    Every value here is a deliberate minimum for *this* dataset (at most five
    same-season observations per district). They are parameters rather than
    literals so a reviewer can re-run the sensitivity of a suppression decision,
    and so a change is a visible, reviewable commit.
    """

    #: Observations a series needs before its first fold exists.
    min_history: int = 3
    #: Expanding-window folds every series must support for the series to count.
    min_folds: int = 3
    #: Share of the target's eligible series that must clear ``min_history``.
    min_series_coverage: float = 0.9
    #: Relative MAE improvement the candidate must show over the best naive method.
    min_skill_vs_naive: float = 0.0
    #: Interval level used for the empirical coverage check.
    interval_level: float = 0.8
    #: Empirical coverage an interval must reach before it may be published.
    min_interval_coverage: float = 0.6

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Fold:
    """One scored prediction: trained on ``train_periods``, scored on ``test``."""

    series: str
    train_periods: tuple[str, ...]
    test_period: str
    observed: float
    predictions: dict[str, float | None]
    intervals: dict[str, tuple[float, float] | None]

    def as_dict(self) -> dict:
        return {
            "series": self.series,
            "train_periods": list(self.train_periods),
            "test_period": self.test_period,
            "observed": self.observed,
            "predictions": self.predictions,
            "intervals": {
                name: (list(bounds) if bounds else None)
                for name, bounds in self.intervals.items()
            },
        }


@dataclass
class BacktestResult:
    target_id: str
    status: str  # "ok" | "insufficient_evidence"
    reasons: list[str] = field(default_factory=list)
    n_series: int = 0
    n_series_eligible: int = 0
    folds_per_series: dict[str, int] = field(default_factory=dict)
    metrics: dict[str, dict] = field(default_factory=dict)
    best_naive: str | None = None
    candidate: str | None = None
    skill_vs_naive: float | None = None
    excluded_observations: int = 0
    policy: dict = field(default_factory=dict)
    decision_note: str = ""
    next_period: str | None = None
    point_estimate: float | None = None
    interval: tuple[float, float] | None = None
    series_forecasts: dict[str, dict] = field(default_factory=dict)
    unit: str = ""
    horizon: str = ""

    def as_dict(self) -> dict:
        payload = asdict(self)
        payload["interval"] = list(self.interval) if self.interval else None
        return payload


# --- methods ---------------------------------------------------------------
# Each takes the ordered history (oldest -> newest) and returns one prediction,
# or None when the history cannot support the method. None is never coerced to 0.


def naive_last(history: list[float]) -> float | None:
    """Last comparable same-season observation."""
    return history[-1] if history else None


def seasonal_mean(history: list[float]) -> float | None:
    return statistics.fmean(history) if history else None


def seasonal_median(history: list[float]) -> float | None:
    return statistics.median(history) if history else None


def drift(history: list[float]) -> float | None:
    """Least-squares trend on the series' own index, extrapolated one step.

    A regularized-trend *baseline*, not a model: with a handful of points the
    slope is descriptive, and it only gets credit if it beats the naive methods.
    """
    if len(history) < 3:
        return None
    n = len(history)
    xs = list(range(n))
    mean_x = statistics.fmean(xs)
    mean_y = statistics.fmean(history)
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return mean_y
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, history, strict=True)) / denominator
    intercept = mean_y - slope * mean_x
    return intercept + slope * n


NAIVE_METHODS: tuple[tuple[str, object], ...] = (
    ("naive_last", naive_last),
    ("seasonal_mean", seasonal_mean),
    ("seasonal_median", seasonal_median),
)
CANDIDATE_METHODS: tuple[tuple[str, object], ...] = (("drift", drift),)
ALL_METHODS = NAIVE_METHODS + CANDIDATE_METHODS


def _interval_half_width(residuals: list[float]) -> float | None:
    """Z-scaled residual standard deviation; None when it is not estimable."""
    if len(residuals) < 2:
        return None
    spread = statistics.stdev(residuals)
    if spread != spread or spread <= 0:  # NaN or a perfect fit
        return None
    return Z_80 * spread


def _training_residuals(method, history: list[float]) -> list[float]:
    """One-step-ahead residuals of ``method`` inside the training window.

    Only past-of-the-past information: at step *k* the method sees
    ``history[:k]`` and is scored against ``history[k]``.
    """
    residuals: list[float] = []
    for k in range(1, len(history)):
        predicted = method(history[:k])
        if predicted is None:
            continue
        residuals.append(history[k] - predicted)
    return residuals


@dataclass
class _Series:
    name: str
    values: list[float]
    periods: list[str]


def _series_from_frame(series: pd.DataFrame) -> list[_Series]:
    """Split a target's observations into one ordered series per entity."""
    grouped: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for row in series.itertuples():
        entity = str(row.district) if row.district is not None else "national"
        grouped[entity].append((str(row.period_code), float(row.value)))
    out: list[_Series] = []
    for entity, observations in grouped.items():
        observations.sort(key=lambda item: _period_key(item[0]))
        out.append(
            _Series(
                name=entity,
                periods=[period for period, _ in observations],
                values=[value for _, value in observations],
            )
        )
    return sorted(out, key=lambda s: s.name)


def _period_key(period_code: str) -> tuple[int, str]:
    return (int(period_code[:4]), period_code[4:])


def evaluate_series(
    series: _Series, policy: BacktestPolicy
) -> tuple[list[Fold], list[str]]:
    """Expanding-window folds for one entity, oldest first.

    Returns ``(folds, problems)``. Problems are raised facts about the record
    (for example a non-monotonic period axis), not silent skips.
    """
    problems: list[str] = []
    keys = [_period_key(period) for period in series.periods]
    if keys != sorted(keys):
        problems.append(f"series {series.name}: periods are not in chronological order")
    if len(set(series.periods)) != len(series.periods):
        problems.append(f"series {series.name}: duplicated periods")

    folds: list[Fold] = []
    # The first fold exists once ``min_history`` observations are available.
    for test_index in range(policy.min_history, len(series.values)):
        history = series.values[:test_index]
        observed = series.values[test_index]
        predictions: dict[str, float | None] = {}
        intervals: dict[str, tuple[float, float] | None] = {}
        for name, method in ALL_METHODS:
            predicted = method(history)
            predictions[name] = predicted
            if predicted is None:
                intervals[name] = None
                continue
            half_width = _interval_half_width(_training_residuals(method, history))
            intervals[name] = (
                (predicted - half_width, predicted + half_width)
                if half_width is not None
                else None
            )
        folds.append(
            Fold(
                series=series.name,
                train_periods=tuple(series.periods[:test_index]),
                test_period=series.periods[test_index],
                observed=observed,
                predictions=predictions,
                intervals=intervals,
            )
        )
    return folds, problems


# --- metrics ---------------------------------------------------------------


def _metrics(pairs: list[tuple[float, float]], intervals: list[tuple[float, float] | None]) -> dict:
    """Error metrics for one method over its scored pairs.

    Errors are ``predicted - observed`` so the sign of ``bias`` is readable:
    positive means the method over-predicts.
    """
    if not pairs:
        return {"n": 0, "mae": None, "rmse": None, "bias": None, "smape": None,
                "n_smape": 0, "interval_coverage": None, "n_intervals": 0,
                "mean_interval_width": None}

    errors = [predicted - observed for predicted, observed in pairs]
    abs_errors = [abs(error) for error in errors]
    smape_terms: list[float] = []
    for predicted, observed in pairs:
        denominator = (abs(predicted) + abs(observed)) / 2.0
        if denominator > 0:
            smape_terms.append(abs(predicted - observed) / denominator * 100.0)

    # An interval is only judged where one exists; coverage is the share of those
    # folds whose observed value fell inside. Counting (rather than averaging a
    # list of 1.0s) keeps the case "intervals exist but none covered" correct
    # instead of raising.
    with_interval = [bounds for bounds in intervals if bounds is not None]
    covered = [
        bounds
        for (predicted, observed), bounds in zip(pairs, intervals, strict=True)
        if bounds is not None and bounds[0] <= observed <= bounds[1]
    ]
    widths = [bounds[1] - bounds[0] for bounds in with_interval]

    return {
        "n": len(pairs),
        "mae": statistics.fmean(abs_errors),
        "rmse": math.sqrt(statistics.fmean(error * error for error in errors)),
        "bias": statistics.fmean(errors),
        "smape": statistics.fmean(smape_terms) if smape_terms else None,
        "n_smape": len(smape_terms),
        "interval_coverage": (len(covered) / len(with_interval)) if with_interval else None,
        "n_intervals": len(with_interval),
        "mean_interval_width": statistics.fmean(widths) if widths else None,
    }


def run_backtest(
    target: ForecastTarget,
    panel: pd.DataFrame,
    policy: BacktestPolicy | None = None,
    *,
    excluded_observations: int = 0,
) -> BacktestResult:
    """Score every method on every eligible series, then apply the gates."""
    policy = policy or BacktestPolicy()
    series_frame = target_series(target, panel)
    series = _series_from_frame(series_frame)
    result = BacktestResult(
        target_id=target.target_id,
        status="insufficient_evidence",
        n_series=len(series),
        excluded_observations=excluded_observations,
        policy=policy.to_dict(),
        unit=target.unit,
        horizon=target.horizon,
    )

    if not series:
        result.reasons.append(
            f"no admissible {target.crop} {target.metric} observations exist for "
            f"Season {target.season} at {target.geography_level.lower()} level"
        )
        result.decision_note = _note(result)
        return result

    all_folds: list[Fold] = []
    for one in series:
        folds, problems = evaluate_series(one, policy)
        result.reasons.extend(problems)
        result.folds_per_series[one.name] = len(folds)
        all_folds.extend(folds)

    # --- leakage guard: no fold may see its own test period ---------------
    for fold in all_folds:
        if fold.test_period in fold.train_periods:
            raise AssertionError(
                f"leakage: {target.target_id}/{fold.series} trained on its own test period"
            )
        if max(_period_key(p) for p in fold.train_periods) >= _period_key(fold.test_period):
            raise AssertionError(
                f"leakage: {target.target_id}/{fold.series} train period is not strictly earlier"
            )

    result.metrics = {
        name: _metrics(
            [
                (fold.predictions[name], fold.observed)
                for fold in all_folds
                if fold.predictions.get(name) is not None
            ],
            [fold.intervals.get(name) for fold in all_folds if fold.predictions.get(name) is not None],
        )
        for name, _ in ALL_METHODS
    }

    # --- gates -------------------------------------------------------------
    eligible = sum(1 for count in result.folds_per_series.values() if count >= policy.min_folds)
    result.n_series_eligible = eligible
    coverage = eligible / len(series)
    if coverage < policy.min_series_coverage:
        fewest = min(result.folds_per_series.values())
        result.reasons.append(
            f"only {eligible}/{len(series)} series support {policy.min_folds} expanding-window "
            f"folds (fewest: {fewest}); the published record is too short to validate a "
            f"next-season forecast"
        )

    if not all_folds:
        result.reasons.append(
            f"no series reaches the {policy.min_history}-observation minimum, so no fold exists"
        )
        result.decision_note = _note(result)
        return result

    naive_candidates = {name: result.metrics[name] for name, _ in NAIVE_METHODS}
    scoreable = {
        name: metrics
        for name, metrics in naive_candidates.items()
        if metrics["n"] > 0 and metrics["mae"] is not None
    }
    if not scoreable:
        result.reasons.append("no naive baseline could be scored on any fold")
        result.decision_note = _note(result)
        return result

    result.best_naive = min(scoreable, key=lambda name: scoreable[name]["mae"])
    best_naive_mae = scoreable[result.best_naive]["mae"]

    candidate_scores = {
        name: result.metrics[name]
        for name, _ in CANDIDATE_METHODS
        if result.metrics[name]["n"] > 0 and result.metrics[name]["mae"] is not None
    }
    if candidate_scores:
        result.candidate = min(candidate_scores, key=lambda name: candidate_scores[name]["mae"])
        candidate_mae = candidate_scores[result.candidate]["mae"]
        result.skill_vs_naive = (best_naive_mae - candidate_mae) / best_naive_mae if best_naive_mae else None
        if result.skill_vs_naive is not None and result.skill_vs_naive < policy.min_skill_vs_naive:
            result.reasons.append(
                f"candidate {result.candidate} does not beat the naive baseline "
                f"{result.best_naive} (skill {result.skill_vs_naive:+.1%} < "
                f"{policy.min_skill_vs_naive:+.1%})"
            )

    chosen = result.candidate or result.best_naive
    coverage_value = result.metrics[chosen]["interval_coverage"]
    if coverage_value is not None and coverage_value < policy.min_interval_coverage:
        result.reasons.append(
            f"{chosen} interval coverage {coverage_value:.0%} is below the "
            f"{policy.min_interval_coverage:.0%} minimum at the "
            f"{policy.interval_level:.0%} level"
        )

    if not result.reasons:
        result.status = "ok"
        result.next_period = _next_period(series_frame, target)
        method = dict(ALL_METHODS)[chosen]
        # One forecast per series: a district target never collapses 30 districts
        # into a single number without saying so.
        for one in series:
            point = method(one.values)
            half_width = _interval_half_width(_training_residuals(method, one.values))
            result.series_forecasts[one.name] = {
                "point_estimate": point,
                "interval": (
                    (point - half_width, point + half_width)
                    if point is not None and half_width is not None
                    else None
                ),
                "n_history": len(one.values),
            }
        if len(result.series_forecasts) == 1:
            only = next(iter(result.series_forecasts.values()))
            result.point_estimate = only["point_estimate"]
            result.interval = only["interval"]
        else:
            points = [
                entry["point_estimate"]
                for entry in result.series_forecasts.values()
                if entry["point_estimate"] is not None
            ]
            result.point_estimate = statistics.median(points) if points else None
            result.interval = None

    result.decision_note = _note(result)
    if result.status == "ok" and len(result.series_forecasts) > 1:
        result.decision_note += (
            " Point estimate is the median across the target's series; per-entity "
            "values and intervals are in series_forecasts."
        )
    return result


def _next_period(series_frame: pd.DataFrame, target: ForecastTarget) -> str | None:
    """The period the forecast would be about: the next published same season.

    Derived from the last observed period for that season, so it can never name a
    period the source does not publish (there is no fabricated 2027A here unless
    2026A was actually observed).
    """
    years = pd.to_numeric(series_frame["year"], errors="coerce").dropna()
    if years.empty:
        return None
    return f"{int(years.max()) + 1}{target.season.upper()}"


def _note(result: BacktestResult) -> str:
    if result.status == "ok":
        return (
            f"Publishable: {result.n_series_eligible}/{result.n_series} series support "
            f"{result.policy['min_folds']} chronological folds and "
            f"{result.candidate or result.best_naive} beats the naive baseline "
            f"(skill {result.skill_vs_naive:+.1%})."
        )
    return (
        "Not published. "
        + " ".join(result.reasons)
        + " The historical view remains available; this is a data limitation, not a "
        "modelling failure."
    )
