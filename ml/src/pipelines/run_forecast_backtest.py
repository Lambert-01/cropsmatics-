#!/usr/bin/env python3
"""Backtest every candidate forecast target and publish the decision.

    python -m ml.src.pipelines.run_forecast_backtest
    python -m ml.src.pipelines.run_forecast_backtest --min-folds 2   # sensitivity only

Writes:

* ``ml/reports/forecast_backtest.json``               machine-readable results
* ``docs/forecasting/FORECAST_VALIDATION.md``         the human report

The ``ok`` / ``insufficient_evidence`` decision in this report is what the
forecast API is allowed to serve. Running the script is not evidence; the
chronological backtest inside it is. A target that fails a gate is reported with
the numbers that failed, never as a quietly skipped row.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date

from ml.src.forecast.backtest import BacktestPolicy, run_backtest
from ml.src.forecast.targets import (
    CANDIDATE_TARGETS,
    excluded_observation_count,
    load_panel,
)
from ml.src.utils.paths import REPORTS_DIR, ROOT, ensure_dirs

DOC_PATH = ROOT / "docs" / "forecasting" / "FORECAST_VALIDATION.md"

# Deliberately NOT ``REPORTS_DIR/*.json``: the API's model registry globs that
# directory, and this is a backtest report, not a model card. Keeping it one
# level down means it cannot be mistaken for a registered model.
REPORT_PATH = REPORTS_DIR / "forecast" / "backtest.json"


def _fmt(value, digits: int = 1) -> str:
    if value is None:
        return "—"
    return f"{value:,.{digits}f}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-folds", type=int, default=None,
                        help="override the fold gate (sensitivity analysis only)")
    parser.add_argument("--min-history", type=int, default=None)
    args = parser.parse_args(argv)

    try:
        panel = load_panel()
    except (FileNotFoundError, ValueError) as exc:
        print(f"[ml] {exc}")
        return 1

    policy = BacktestPolicy()
    if args.min_folds is not None or args.min_history is not None:
        policy = BacktestPolicy(
            min_history=args.min_history if args.min_history is not None else policy.min_history,
            min_folds=args.min_folds if args.min_folds is not None else policy.min_folds,
        )
        print("[ml] NOTE: non-default policy - this run is a sensitivity analysis, "
              "not a publication decision")

    results = [
        run_backtest(
            target, panel, policy,
            excluded_observations=excluded_observation_count(target, panel),
        )
        for target in CANDIDATE_TARGETS
    ]

    ensure_dirs()
    report = {
        "generated": date.today().isoformat(),
        "policy": policy.to_dict(),
        "policy_is_default": args.min_folds is None and args.min_history is None,
        # A client must be able to read one boolean rather than re-implement the
        # gate. It is true only when a default-policy run published at least one
        # target with a point estimate; a sensitivity run never sets it.
        "serves_forecast": bool(
            args.min_folds is None
            and args.min_history is None
            and any(result.status == "ok" and result.point_estimate is not None for result in results)
        ),
        "method_note": (
            "rolling-origin expanding-window backtest; each fold trains only on the "
            "target's own earlier same-season observations. Baselines: naive_last, "
            "seasonal_mean, seasonal_median. Candidate: drift (regularized trend)."
        ),
        "targets": [result.as_dict() for result in results],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, default=str))

    DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOC_PATH.write_text(_render_markdown(report), encoding="utf-8")

    for result in results:
        print(f"[ml] {result.target_id}: {result.status} "
              f"({result.n_series_eligible}/{result.n_series} series with "
              f"{policy.min_folds} folds)")
        if result.status != "ok":
            for reason in result.reasons:
                print(f"       - {reason}")
    print(f"[ml] report -> {REPORT_PATH}")
    print(f"[ml] report -> {DOC_PATH}")
    return 0


def _render_markdown(report: dict) -> str:
    policy = report["policy"]
    lines: list[str] = [
        "# Forecast Validation Report",
        "",
        f"**Generated:** {report['generated']}",
        f"**Policy:** minimum history {policy['min_history']} observations · "
        f"minimum folds {policy['min_folds']} · series coverage "
        f"{policy['min_series_coverage']:.0%} · interval level "
        f"{policy['interval_level']:.0%} · minimum interval coverage "
        f"{policy['min_interval_coverage']:.0%}",
        f"**Default policy:** {'yes' if report['policy_is_default'] else 'NO - sensitivity run'}",
        "",
        report["method_note"],
        "",
        "A forecast is published only when **every** gate passes. A seasonal naive",
        "baseline that beats every candidate is a valid, publishable outcome; a",
        "suppression means the published record cannot support the question, not that",
        "a script failed.",
        "",
        "## Decisions",
        "",
        "| Target | Status | Series eligible | Candidate | Skill vs naive | Interval coverage |",
        "|---|---|---:|---|---:|---:|",
    ]
    for result in report["targets"]:
        chosen = result["candidate"] or result["best_naive"] or ""
        coverage = result["metrics"].get(chosen, {}).get("interval_coverage")
        skill = result["skill_vs_naive"]
        skill_text = f"{_fmt(skill * 100, 1)}%" if skill is not None else "—"
        coverage_text = f"{_fmt(coverage * 100, 0)}%" if coverage is not None else "—"
        lines.append(
            f"| `{result['target_id']}` | **{result['status']}** | "
            f"{result['n_series_eligible']}/{result['n_series']} | "
            f"{chosen or '—'} | {skill_text} | {coverage_text} |"
        )

    lines += ["", "## Error by method", ""]
    for result in report["targets"]:
        lines += [
            f"### `{result['target_id']}` — {result['status']}",
            "",
            f"{result['decision_note']}",
            "",
        ]
        if result["reasons"]:
            lines += ["Blocking reasons:", ""]
            lines += [f"- {reason}" for reason in result["reasons"]]
            lines += [""]
        folds = result["folds_per_series"]
        if folds:
            counts = sorted(folds.values())
            lines += [
                f"Series: {result['n_series']} · folds per series: "
                f"min {counts[0]}, max {counts[-1]} · "
                f"observations excluded by the published-consistency policy: "
                f"{result['excluded_observations']}",
                "",
            ]
        rows = [name for name in ("naive_last", "seasonal_mean", "seasonal_median", "drift")
                if result["metrics"].get(name, {}).get("n")]
        if rows:
            lines += [
                "| Method | n | MAE | RMSE | bias | sMAPE | interval coverage | mean interval width |",
                "|---|---:|---:|---:|---:|---:|---:|---:|",
            ]
            for name in rows:
                m = result["metrics"][name]
                cov = m["interval_coverage"]
                cov_text = f"{_fmt(cov * 100, 0)}%" if cov is not None else "—"
                lines.append(
                    f"| {name} | {m['n']} | {_fmt(m['mae'])} | {_fmt(m['rmse'])} | "
                    f"{_fmt(m['bias'])} | {_fmt(m['smape'], 2)} | {cov_text} | "
                    f"{_fmt(m['mean_interval_width'])} |"
                )
            lines += [""]
        if result["status"] == "ok" and result["next_period"]:
            lines += [
                f"**Forecast for {result['next_period']}:** "
                f"{_fmt(result['point_estimate'])} {result['unit']}"
                + (
                    f" (80% interval {_fmt(result['interval'][0])}–{_fmt(result['interval'][1])})"
                    if result["interval"]
                    else " (interval not estimable)"
                ),
                "",
            ]

    lines += [
        "## What this report does not claim",
        "",
        "- No causal effect of any input on yield. These are predictions from the",
        "  crop's own history, not explanations.",
        "- No skill beyond the horizon that was actually scored. One step ahead on the",
        "  same season is the only horizon with folds.",
        "- No forecast served to users unless its row above reads `ok`.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
