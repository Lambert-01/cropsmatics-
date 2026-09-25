# 12. Post-Harvest Risk Model

## Output

```text
risk_probability, risk_band (LOW|MODERATE|HIGH),
top_contributing_factors, recommended_actions, model_version
```

## MVP: transparent additive rules

Each signal contributes a documented amount to a baseline, and every contribution
is returned as a human-readable string so the UI can answer "why?".

| Signal | Contribution |
|---|---|
| baseline | +0.05 |
| crop perishability (low/medium/high) | +0.05 / +0.20 / +0.35 |
| rainfall risk (low/moderate/high) | +0.00 / +0.10 / +0.20 |
| expected volume ≥ 300 / ≥ 1000 kg | +0.05 / +0.10 |
| historical post-harvest loss (capped) | up to +0.20 |
| capacity **not verified** | +0.05 (conservative) |
| available capacity < expected harvest | +0.15 |
| distance > 25 km | +0.10 |

Bands: `HIGH ≥ 0.66`, `MODERATE ≥ 0.33`, else `LOW` (configurable).

## Why rules first

The rule model is interpretable and does not require labelled outcome data. It is
honest about uncertainty: when capacity is unknown it raises risk rather than
inventing a number.

## Upgrade path

A calibrated classifier can replace the rules behind the same interface
(`PostHarvestRiskModel(classifier=...)` in
`ml/src/models/postharvest_risk.py`). When that happens:

- validate with time-aware splits, report precision/recall/AUROC and calibration;
- keep the `model_version` on every stored `risk_score`;
- never present a probability as certainty; always show contributing factors.

## Capacity honesty

Facility capacity is **never fabricated**. Where public sources lack
facility-level capacity, the API returns `capacity_not_verified` and the risk
model treats it conservatively.
