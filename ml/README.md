# ML — Cropmatics Rwanda

Modelling, evaluation, explainability and optimization code. Pure-standard-library
modules (gap index, priority, risk, metrics) run anywhere; pandas/scikit-learn/
OR-Tools parts are optional and guarded.

```
ml/
├── src/
│   ├── data/            # loaders for processed tables
│   ├── features/        # feature engineering
│   ├── models/          # productivity_gap, yield_model, intervention_priority, postharvest_risk
│   ├── evaluation/      # metrics, season/district-aware validation
│   ├── explainability/  # native / permutation / SHAP importance
│   ├── optimization/    # storage allocation (OR-Tools)
│   ├── utils/           # paths
│   └── pipelines/       # run_training.py
├── tests/
├── artifacts/           # trained artifacts (gitignored)
├── reports/             # model cards (gitignored)
└── notebooks/
```

## Run

```bash
make data        # build data/processed/training_district_crop.csv first
make ml          # python ml/src/pipelines/run_training.py
pytest ml -q     # unit tests
```

## Principles

- **Benchmarks are configurable**, never hardcoded (`ml/src/models/productivity_gap.py`).
- **Validation is season/district-aware**; random row splits are avoided.
- **Associations, not causation.** Output language must say "associated factors".
- **No fabricated data.** Missing values stay null; capacity is never invented.
- **Baseline first.** Ridge + random forest before any gradient boosting.
