# Forecast Validation Report

**Generated:** 2026-10-11
**Policy:** minimum history 3 observations · minimum folds 3 · series coverage 90% · interval level 80% · minimum interval coverage 60%
**Default policy:** yes

rolling-origin expanding-window backtest; each fold trains only on the target's own earlier same-season observations. Baselines: naive_last, seasonal_mean, seasonal_median. Candidate: drift (regularized trend).

A forecast is published only when **every** gate passes. A seasonal naive
baseline that beats every candidate is a valid, publishable outcome; a
suppression means the published record cannot support the question, not that
a script failed.

## Decisions

| Target | Status | Series eligible | Candidate | Skill vs naive | Interval coverage |
|---|---|---:|---|---:|---:|
| `district_maize_yield_next_season_a` | **insufficient_evidence** | 0/30 | drift | -146.4% | — |
| `district_maize_yield_next_season_b` | **insufficient_evidence** | 0/30 | drift | -77.2% | — |
| `district_beans_yield_next_season_a` | **insufficient_evidence** | 0/30 | drift | -158.3% | — |
| `district_beans_yield_next_season_b` | **insufficient_evidence** | 0/30 | drift | -93.5% | — |
| `national_maize_yield_next_season_b` | **insufficient_evidence** | 0/1 | drift | -178.7% | — |
| `national_maize_production_next_season_b` | **insufficient_evidence** | 0/1 | — | — | — |

## Error by method

### `district_maize_yield_next_season_a` — insufficient_evidence

Not published. only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast candidate drift does not beat the naive baseline naive_last (skill -146.4% < +0.0%) The historical view remains available; this is a data limitation, not a modelling failure.

Blocking reasons:

- only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast
- candidate drift does not beat the naive baseline naive_last (skill -146.4% < +0.0%)

Series: 30 · folds per series: min 2, max 2 · observations excluded by the published-consistency policy: 0

| Method | n | MAE | RMSE | bias | sMAPE | interval coverage | mean interval width |
|---|---:|---:|---:|---:|---:|---:|---:|
| naive_last | 60 | 86.7 | 112.6 | 27.7 | 4.89 | 100% | 912.3 |
| seasonal_mean | 60 | 165.3 | 206.4 | -129.5 | 9.48 | 100% | 719.1 |
| seasonal_median | 60 | 160.4 | 205.9 | -108.3 | 9.43 | 100% | 733.2 |
| drift | 60 | 213.7 | 262.9 | 155.4 | 11.31 | — | — |

### `district_maize_yield_next_season_b` — insufficient_evidence

Not published. only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast candidate drift does not beat the naive baseline naive_last (skill -77.2% < +0.0%) The historical view remains available; this is a data limitation, not a modelling failure.

Blocking reasons:

- only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast
- candidate drift does not beat the naive baseline naive_last (skill -77.2% < +0.0%)

Series: 30 · folds per series: min 2, max 2 · observations excluded by the published-consistency policy: 0

| Method | n | MAE | RMSE | bias | sMAPE | interval coverage | mean interval width |
|---|---:|---:|---:|---:|---:|---:|---:|
| naive_last | 60 | 62.6 | 82.2 | -15.3 | 5.54 | 100% | 257.1 |
| seasonal_mean | 60 | 77.5 | 103.1 | 4.9 | 6.95 | 100% | 166.4 |
| seasonal_median | 60 | 72.9 | 97.1 | -5.8 | 6.53 | 100% | 176.6 |
| drift | 60 | 110.9 | 142.6 | -63.8 | 10.40 | — | — |

### `district_beans_yield_next_season_a` — insufficient_evidence

Not published. only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast candidate drift does not beat the naive baseline naive_last (skill -158.3% < +0.0%) The historical view remains available; this is a data limitation, not a modelling failure.

Blocking reasons:

- only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast
- candidate drift does not beat the naive baseline naive_last (skill -158.3% < +0.0%)

Series: 30 · folds per series: min 2, max 2 · observations excluded by the published-consistency policy: 0

| Method | n | MAE | RMSE | bias | sMAPE | interval coverage | mean interval width |
|---|---:|---:|---:|---:|---:|---:|---:|
| naive_last | 60 | 31.8 | 41.6 | 1.7 | 4.35 | 100% | 448.8 |
| seasonal_mean | 60 | 47.0 | 58.6 | -29.4 | 7.01 | 100% | 336.6 |
| seasonal_median | 60 | 41.7 | 52.8 | -22.6 | 5.99 | 100% | 335.5 |
| drift | 60 | 82.1 | 102.1 | 5.9 | 12.51 | — | — |

### `district_beans_yield_next_season_b` — insufficient_evidence

Not published. only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast candidate drift does not beat the naive baseline naive_last (skill -93.5% < +0.0%) The historical view remains available; this is a data limitation, not a modelling failure.

Blocking reasons:

- only 0/30 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast
- candidate drift does not beat the naive baseline naive_last (skill -93.5% < +0.0%)

Series: 30 · folds per series: min 2, max 2 · observations excluded by the published-consistency policy: 0

| Method | n | MAE | RMSE | bias | sMAPE | interval coverage | mean interval width |
|---|---:|---:|---:|---:|---:|---:|---:|
| naive_last | 60 | 35.8 | 44.8 | -1.8 | 4.94 | 100% | 151.9 |
| seasonal_mean | 60 | 57.6 | 70.5 | 34.8 | 7.64 | 100% | 124.1 |
| seasonal_median | 60 | 59.7 | 75.8 | 35.2 | 7.87 | 100% | 130.7 |
| drift | 60 | 69.3 | 89.7 | -31.0 | 9.09 | — | — |

### `national_maize_yield_next_season_b` — insufficient_evidence

Not published. only 0/1 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast candidate drift does not beat the naive baseline seasonal_mean (skill -178.7% < +0.0%) The historical view remains available; this is a data limitation, not a modelling failure.

Blocking reasons:

- only 0/1 series support 3 expanding-window folds (fewest: 2); the published record is too short to validate a next-season forecast
- candidate drift does not beat the naive baseline seasonal_mean (skill -178.7% < +0.0%)

Series: 1 · folds per series: min 2, max 2 · observations excluded by the published-consistency policy: 0

| Method | n | MAE | RMSE | bias | sMAPE | interval coverage | mean interval width |
|---|---:|---:|---:|---:|---:|---:|---:|
| naive_last | 2 | 22.1 | 22.5 | -4.0 | 1.73 | 100% | 194.6 |
| seasonal_mean | 2 | 16.7 | 21.0 | 12.7 | 1.31 | 100% | 124.3 |
| seasonal_median | 2 | 17.6 | 17.6 | 0.5 | 1.38 | 100% | 127.9 |
| drift | 2 | 46.7 | 48.1 | -46.7 | 3.71 | — | — |

### `national_maize_production_next_season_b` — insufficient_evidence

Not published. only 0/1 series support 3 expanding-window folds (fewest: 0); the published record is too short to validate a next-season forecast no series reaches the 3-observation minimum, so no fold exists The historical view remains available; this is a data limitation, not a modelling failure.

Blocking reasons:

- only 0/1 series support 3 expanding-window folds (fewest: 0); the published record is too short to validate a next-season forecast
- no series reaches the 3-observation minimum, so no fold exists

Series: 1 · folds per series: min 0, max 0 · observations excluded by the published-consistency policy: 0

## What this report does not claim

- No causal effect of any input on yield. These are predictions from the
  crop's own history, not explanations.
- No skill beyond the horizon that was actually scored. One step ahead on the
  same season is the only horizon with folds.
- No forecast served to users unless its row above reads `ok`.
