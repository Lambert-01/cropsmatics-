# Model Interpretation Policy

This policy governs how model output may be described, in code, API responses,
dashboards and presentations.

## 1. Associations, not causes

Official district factors are observed alongside yield. They are **associations**.

Use: "associated with", "model contribution", "predicts", "priority for
investigation", "scenario estimate".

Avoid: "fertilizer causes +X% yield", "this intervention will raise production",
"proven effect".

## 2. Every result carries provenance

Each analytical response exposes: `source_id`, `source_period`, `method`,
`benchmark_strategy` / `model_version`, and `limitations`.

## 3. Benchmarks are explicit and configurable

The Productivity Gap Index depends heavily on the benchmark. The chosen strategy
(`national_crop_median`, `national_crop_season_median`,
`top_quartile_comparable_districts`, `multi_year_crop_baseline`,
`agro_ecological_peer_group`) is always returned with the results, never hidden.

## 4. Uncertainty is stated

- Report ranges / limitations, not single authoritative numbers.
- Do not present a probability as certainty.
- Where data is missing, say "not verified" — do not substitute a guess.

## 5. Explainability is not causality

Coefficients, permutation importance, SHAP and partial dependence describe what a
model learned. They do **not** establish causal effects. Any UI built on them
must say "associated factors".

## 6. Operational data is not national statistics

Voluntary app data (harvest registrations, field observations) must never be
labelled or aggregated as nationally representative NISR statistics.

## 7. Human in the loop

Intervention priorities are decision **support**. Rankings must remain reviewable
and adjustable; no automated binding decision is made.

## 8. Synthetic data is labelled

Synthetic fixtures are test-only, isolated under `data/dev_fixtures/`, and marked
`SYNTHETIC`. They never enter analytical tables or public output.
