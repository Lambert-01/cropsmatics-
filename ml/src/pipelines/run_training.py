#!/usr/bin/env python3
"""End-to-end baseline training pipeline.

    load processed table -> build features -> leakage-safe split
    -> linear baseline + random forest -> metrics -> model card

The split holds out every 5th district so evaluation measures generalization to
districts not seen in training (random row splits leak across districts/crops).

Writes a JSON model card to ``ml/reports/``.
"""

from __future__ import annotations

import json
import sys

from ml.src.data.load import load_training_dataframe
from ml.src.evaluation.metrics import regression_report
from ml.src.features.build_features import build_design_matrix, clean
from ml.src.models.yield_model import model_card, predict, train_linear, train_random_forest
from ml.src.utils.paths import REPORTS_DIR, ensure_dirs


def main() -> int:
    try:
        raw = load_training_dataframe()
    except FileNotFoundError as exc:
        print(f"[ml] {exc}")
        return 1

    df = clean(raw)
    X, y, names = build_design_matrix(df)
    if len(X) < 20:
        print(f"[ml] too few usable rows to train ({len(X)}); expected >= 20")
        return 1

    # Deterministic district holdout (~20% of districts) — no leakage.
    districts = sorted(df["district"].dropna().unique())
    holdout = districts[::5]
    test_mask_df = df["district"].isin(holdout)
    test_mask = test_mask_df.reindex(X.index, fill_value=False)

    X_train, y_train = X[~test_mask], y[~test_mask]
    X_test, y_test = X[test_mask], y[test_mask]
    if len(X_train) == 0 or len(X_test) == 0:
        print("[ml] split produced an empty fold; check the processed table")
        return 1

    results = {}
    results["ridge"] = regression_report(list(y_test), predict(train_linear(X_train, y_train), X_test))
    results["random_forest"] = regression_report(
        list(y_test), predict(train_random_forest(X_train, y_train), X_test)
    )

    ensure_dirs()
    best = min(results, key=lambda k: results[k]["rmse"])
    card = model_card(
        name="yield_baseline",
        metrics=results,
        extra={
            "best_model": best,
            "n_features": len(names),
            "holdout_districts": list(holdout),
            "validation_split": "district holdout (every 5th district)",
            "target": "yield_kg_ha",
        },
    )
    out = REPORTS_DIR / "yield_baseline_model_card.json"
    out.write_text(json.dumps(card, indent=2))
    print(f"[ml] trained on {len(X_train)} rows, tested on {len(X_test)} rows "
          f"(holdout districts: {len(holdout)})")
    for name, m in results.items():
        print(f"[ml] {name}: MAE={m['mae']:.1f} RMSE={m['rmse']:.1f} R2={m['r2']:.3f}")
    print(f"[ml] model card -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
