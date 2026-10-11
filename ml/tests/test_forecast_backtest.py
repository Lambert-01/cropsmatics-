"""Forecast backtest contract tests.

These use **synthetic** series only. They are numbers invented to exercise the
mechanics (leakage safety, baseline comparison, suppression), and they are
labelled as such here and in every test name; nothing in this file describes a
real observation.

The real dataset's backtest result is a *suppression*, and that is asserted
separately in ``test_the_published_record_does_not_yet_support_a_forecast``,
which reads the produced report rather than re-deriving it.
"""

from __future__ import annotations

import json

import pandas as pd
import pytest

from ml.src.forecast.backtest import (
    BacktestPolicy,
    _Series,
    drift,
    evaluate_series,
    naive_last,
    run_backtest,
    seasonal_mean,
)
from ml.src.forecast.targets import CANDIDATE_TARGETS, ForecastTarget, target_series
from ml.src.utils.paths import REPORTS_DIR, ROOT

FORECAST_REPORT = REPORTS_DIR / "forecast" / "backtest.json"


def _synthetic_panel(rows: list[dict]) -> pd.DataFrame:
    base = {
        "period_code": None,
        "year": None,
        "season": "B",
        "geography_level": "DISTRICT",
        "farmer_scale": "all",
        "crop_name_raw": "Maize",
        "district": "Test District",
        "cultivated_area_ha": 100.0,
        "harvested_area_ha": 100.0,
        "production_mt": None,
        "yield_kg_ha": None,
    }
    out = [dict(base, **row) for row in rows]
    frame = pd.DataFrame(out)
    frame["period_code"] = frame["period_code"].astype(str)
    frame["year"] = frame["year"].astype(int)
    # Production deliberately consistent with yield so the published-consistency
    # exclusion never interferes with a mechanics test unless it is asked to.
    frame["production_mt"] = frame["harvested_area_ha"] * frame["yield_kg_ha"] / 1000.0
    return frame


def _spec(**overrides) -> ForecastTarget:
    base = {
        "target_id": "synthetic_target",
        "crop": "Maize",
        "metric": "yield",
        "season": "B",
        "geography_level": "DISTRICT",
        "horizon": "next synthetic season",
        "publication_lag_note": "synthetic",
    }
    base.update(overrides)
    return ForecastTarget(**base)


# --- leakage ---------------------------------------------------------------


def test_every_fold_trains_strictly_before_its_test_period():
    series = _Series(
        name="Test District",
        values=[100.0, 110.0, 120.0, 130.0],
        periods=["2022B", "2023B", "2024B", "2025B"],
    )
    folds, problems = evaluate_series(series, BacktestPolicy(min_history=2))
    assert problems == []
    assert len(folds) == 2
    for fold in folds:
        assert fold.test_period not in fold.train_periods
        assert max(fold.train_periods) < fold.test_period


def test_backtest_raises_if_a_fold_could_see_its_own_test_period(monkeypatch):
    """The guard must fail loudly, not warn: leakage invalidates every number."""
    import ml.src.forecast.backtest as backtest

    def leaky_evaluate(series, policy):
        return (
            [
                backtest.Fold(
                    series=series.name,
                    train_periods=("2022B", "2023B", "2024B"),
                    # A test period that is inside the training window.
                    test_period="2024B",
                    observed=1.0,
                    predictions={"naive_last": 1.0},
                    intervals={},
                )
            ],
            [],
        )

    monkeypatch.setattr(backtest, "evaluate_series", leaky_evaluate)
    panel = _synthetic_panel(
        [
            {"period_code": "2022B", "year": 2022, "district": "A", "yield_kg_ha": 100.0},
            {"period_code": "2023B", "year": 2023, "district": "A", "yield_kg_ha": 110.0},
            {"period_code": "2024B", "year": 2024, "district": "A", "yield_kg_ha": 120.0},
        ]
    )
    with pytest.raises(AssertionError, match="leakage"):
        run_backtest(_spec(), panel, BacktestPolicy(min_history=2))


def test_a_season_a_target_never_trains_on_season_b_rows():
    panel = _synthetic_panel(
        [
            {"period_code": "2022A", "year": 2022, "season": "A", "yield_kg_ha": 100.0},
            {"period_code": "2022B", "year": 2022, "season": "B", "yield_kg_ha": 900.0},
            {"period_code": "2023A", "year": 2023, "season": "A", "yield_kg_ha": 110.0},
        ]
    )
    series = target_series(_spec(season="A"), panel)
    assert list(series["period_code"]) == ["2022A", "2023A"]
    assert 900.0 not in set(series["value"])


def test_scale_and_geography_are_never_mixed():
    panel = _synthetic_panel(
        [
            {"period_code": "2022B", "year": 2022, "yield_kg_ha": 100.0},
            {"period_code": "2022B", "year": 2022, "farmer_scale": "ssf", "yield_kg_ha": 500.0},
            {
                "period_code": "2022B",
                "year": 2022,
                "geography_level": "NATIONAL",
                "district": None,
                "yield_kg_ha": 700.0,
            },
        ]
    )
    district_series = target_series(_spec(), panel)
    assert set(district_series["value"]) == {100.0}
    national_series = target_series(_spec(geography_level="NATIONAL"), panel)
    assert set(national_series["value"]) == {700.0}


def test_flagged_observations_are_excluded_and_counted():
    """A published yield that contradicts its own area/production is dropped."""
    panel = _synthetic_panel(
        [
            {"period_code": "2022B", "year": 2022, "yield_kg_ha": 1000.0},
            {"period_code": "2023B", "year": 2023, "yield_kg_ha": 1100.0},
        ]
    )
    # Make the second row's published yield irreconcilable with its inputs.
    panel.loc[panel["period_code"] == "2023B", "yield_kg_ha"] = 5000.0
    panel.loc[panel["period_code"] == "2023B", "production_mt"] = 11.0 / 1.0
    series = target_series(_spec(), panel)
    assert list(series["period_code"]) == ["2022B"], "flagged observation must not train"

    from ml.src.forecast.targets import excluded_observation_count

    assert excluded_observation_count(_spec(), panel) == 1


# --- methods ---------------------------------------------------------------


def test_naive_and_trend_methods_are_deterministic_and_guard_short_history():
    assert naive_last([3.0, 4.0, 5.0]) == 5.0
    assert seasonal_mean([3.0, 4.0, 5.0]) == 4.0
    assert naive_last([]) is None
    assert seasonal_mean([]) is None
    # Four points on a straight line: the drift baseline extrapolates exactly.
    assert drift([10.0, 20.0, 30.0, 40.0]) == pytest.approx(50.0)
    # Too short to fit a trend: no opinion rather than a fabricated one.
    assert drift([10.0, 20.0]) is None


def test_a_trend_that_beats_the_baseline_is_reported_as_skill():
    """A synthetic linear series where drift must win on the scored folds."""
    period_codes = ["2022B", "2023B", "2024B", "2025B", "2026B"]
    panel = _synthetic_panel(
        [
            {"period_code": code, "year": 2022 + index, "yield_kg_ha": 1000.0 + 100.0 * index}
            for index, code in enumerate(period_codes)
        ]
    )
    result = run_backtest(_spec(), panel, BacktestPolicy(min_history=3, min_folds=2))
    assert result.status == "ok"
    assert result.candidate == "drift"
    assert result.skill_vs_naive is not None and result.skill_vs_naive > 0
    assert result.point_estimate == pytest.approx(1500.0)
    assert result.next_period == "2027B"
    # A perfect straight line leaves zero residual spread, so no interval is
    # reported at all - better than publishing a zero-width one as if the next
    # season were known exactly.
    assert result.interval is None


def test_an_interval_is_reported_only_when_its_spread_is_estimable():
    """Noisy synthetic history: an 80% interval must be reported and scored."""
    period_codes = ["2022B", "2023B", "2024B", "2025B", "2026B"]
    values = [1000.0, 1180.0, 1260.0, 1450.0, 1520.0]
    panel = _synthetic_panel(
        [
            {"period_code": code, "year": 2022 + index, "yield_kg_ha": value}
            for index, (code, value) in enumerate(zip(period_codes, values, strict=True))
        ]
    )
    result = run_backtest(_spec(), panel, BacktestPolicy(min_history=3, min_folds=2))
    assert result.status == "ok"
    # The naive baseline can form at least two in-sample residuals per fold, so
    # its interval is estimable and scored.
    assert result.metrics["naive_last"]["n_intervals"] > 0
    assert result.metrics["naive_last"]["interval_coverage"] is not None
    assert result.metrics["naive_last"]["mean_interval_width"] > 0
    # The drift candidate cannot: at four observations it forms one in-sample
    # residual per fold, and a spread cannot be estimated from one point. The
    # report says "not estimable" instead of printing an unjustified width.
    assert result.metrics["drift"]["n_intervals"] == 0


def test_an_unstable_series_is_suppressed_not_forecast():
    """A candidate that loses to the baseline must produce a suppression."""
    values = [1000.0, 5000.0, 900.0, 6000.0, 800.0]
    period_codes = ["2022B", "2023B", "2024B", "2025B", "2026B"]
    panel = _synthetic_panel(
        [
            {"period_code": code, "year": 2022 + index, "yield_kg_ha": value}
            for index, (code, value) in enumerate(zip(period_codes, values, strict=True))
        ]
    )
    result = run_backtest(_spec(), panel, BacktestPolicy(min_history=3, min_folds=2))
    assert result.status == "insufficient_evidence"
    assert result.point_estimate is None
    assert any("does not beat the naive baseline" in reason for reason in result.reasons)


def test_too_short_a_history_suppresses_with_a_readable_reason():
    panel = _synthetic_panel(
        [
            {"period_code": "2025B", "year": 2025, "yield_kg_ha": 1000.0},
            {"period_code": "2026B", "year": 2026, "yield_kg_ha": 1100.0},
        ]
    )
    result = run_backtest(_spec(), panel, BacktestPolicy(min_history=4, min_folds=2))
    assert result.status == "insufficient_evidence"
    assert result.point_estimate is None
    assert result.reasons
    assert "too short" in result.decision_note or "no series reaches" in result.decision_note


def test_a_target_with_no_admissible_observations_is_reported_not_crashed():
    panel = _synthetic_panel(
        [{"period_code": "2026B", "year": 2026, "crop_name_raw": "Cassava", "yield_kg_ha": 100.0}]
    )
    result = run_backtest(_spec(crop="Maize"), panel)
    assert result.status == "insufficient_evidence"
    assert result.n_series == 0
    assert "no admissible" in result.reasons[0]


# --- the real dataset ------------------------------------------------------


@pytest.mark.skipif(not FORECAST_REPORT.exists(), reason="run run_forecast_backtest first")
def test_the_published_record_does_not_yet_support_a_forecast():
    """The honest decision for the real data, pinned so it cannot silently flip.

    Five same-season district observations (2022-2026) yield at most two
    expanding-window folds per district, and a regularized trend loses to the
    seasonal naive baseline. Both facts must keep the gate closed until a longer
    record exists; if this test fails because data was added, the gate should be
    re-evaluated deliberately, not by accident.
    """
    report = json.loads(FORECAST_REPORT.read_text())
    assert report["policy_is_default"] is True
    assert report["serves_forecast"] is False
    for target in report["targets"]:
        assert target["status"] == "insufficient_evidence", target["target_id"]
        assert target["point_estimate"] is None
        assert target["reasons"]
        # No target may be scored on a single fold and called validated.
        assert all(
            count < report["policy"]["min_folds"] for count in target["folds_per_series"].values()
        )


@pytest.mark.skipif(not FORECAST_REPORT.exists(), reason="run run_forecast_backtest first")
def test_the_registry_only_covers_scorable_questions():
    report = json.loads(FORECAST_REPORT.read_text())
    ids = {target["target_id"] for target in report["targets"]}
    assert ids == {target.target_id for target in CANDIDATE_TARGETS}
    for target in report["targets"]:
        assert target["horizon"]
        assert target["unit"]
        assert target["policy"]["min_folds"] >= 2


def test_forecast_report_is_not_visible_to_the_model_registry():
    """``meta_service.models()`` globs ``ml/reports/*.json`` non-recursively.

    A backtest report is not a model card, so it must not sit where that glob can
    pick it up and advertise it as a registered model.
    """
    assert FORECAST_REPORT.parent.name == "forecast"
    assert FORECAST_REPORT.parent.parent == REPORTS_DIR
    assert ROOT in FORECAST_REPORT.parents
    assert FORECAST_REPORT not in set(REPORTS_DIR.glob("*.json"))
