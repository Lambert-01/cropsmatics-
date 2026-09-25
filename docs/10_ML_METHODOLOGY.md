# 11. ML Pipeline

```text
raw source
→ validate schema/provenance
→ normalize geography/crop/time
→ missingness report
→ feature engineering
→ time-aware train/validation/test
→ baseline model
→ candidate models
→ error analysis
→ explainability
→ model card
→ versioned inference artifact
```

If respondent-level SAS is used:
- preserve `plot_weight`;
- inspect stratification/clustering metadata;
- separate survey estimation from predictive modeling.

Minimum evaluation:
- Regression: MAE, RMSE, R²
- Classification: precision, recall, AUROC, calibration
- Error breakdown by crop and geography
