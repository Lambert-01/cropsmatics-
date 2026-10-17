# Data to Number Traceability

Review note, 2026-10-17: this document mixes desired contracts with worked
examples. Exact per-metric cell lineage and a resolver remain outstanding.
National-median district filtering and historical plan evidence windows are now
repaired; a peer-benchmark headline mismatch remains documented in
[Current Status](../CURRENT_STATUS.md). Do not interpret
the examples as proof of complete traceability across every route.

Every displayed analytical number must be traceable from the UI to the exact
source record without guessing which of several source ids supplied it. This
document states the contract, then gives worked examples. Examples marked
**verified this session** were exercised by the commands named; examples marked
**contract only** describe the lineage the code carries but were not walked
end-to-end in this session.

## The lineage contract

**Observed metric** — identifies dataset version, record key, indicator, unit,
geography, crop, season, farmer scope, source id, source release, workbook, sheet
and a row/cell reference.

The multi-period productivity panel (`data/processed/crop_productivity.csv`)
carries: `source_id`, `source_release`, `source_workbook`, `source_sheets`,
`source_title_raw`, `metric_source_map` (indicator → table), `source_row_min`,
`processing_script`, `processing_version`, `row_scope`, `farmer_scale`,
`geography_level`, `period_code`, `canonical_crop_name`, `yield_kg_ha`,
`production_mt`, `harvested_area_ha`.

**Derived metric** — additionally identifies the transformation, its inputs, the
comparison population and the algorithm/methodology version.

**Compact by default.** Normal responses return compact evidence references; the
full source detail is available through `/meta/dataset/{key}` and the source
drawer, so an entire raw workbook is never attached to every response.

## Worked example 1 — a manual projection (verified this session)

Request (`services/api/tests/fixtures/manual_projection_contract.json`):

```json
{"crop":"Maize","geography":"district","district":"Bugesera","season":"B",
 "horizon_steps":2,"metric":"yield_kg_ha","method":"carry_forward",
 "baseline":"latest_observed"}
```

Trace, top to bottom:

1. **UI** — `ManualProjectionWorkspace` builds the body with
   `manualProjectionRequest` (`apps/web/lib/manualProjection.ts`).
2. **API** — `POST /api/v1/scenarios/manual-projection`
   (`services/api/app/api/v1/scenarios.py`).
3. **Service** — `manual_projection_service.run` selects the panel rows for
   `geography_level == DISTRICT`, `farmer_scale == all`, `canonical_crop_name ==
   Maize`, `district == Bugesera`, keeps only `season == B` observations with a
   positive value, and takes the latest as the baseline. In the current artefact
   that origin is `2026B`.
4. **Source record** — the `2026B` panel row's `source_id`
   (`NISR_SAS_2026B`), `source_workbook` and `source_sheets` are returned in
   `baseline_observations[].*` and `evidence[].*`.
5. **Result** — `value_kind = "planning_projection"`, target periods `2027B`,
   `2028B`, each projected point equal to the baseline (carry-forward).
6. **Export** — `export_rows` separate `observed_baseline` from `projection`;
   the CSV header carries `row_kind`, `source_id` and `note`.

A reviewer can therefore see the observed value, the release it came from, and
which rows are the user's assumption rather than a published figure.

## Worked example 2 — a yield KPI (contract only)

`/dashboard/overview` national yield is `1000 × production_mt /
harvested_area_ha` over the period's published rows. Because it is a ratio of two
totals it is an **area-weighted aggregate**, and it moves with crop composition —
it is labelled as an aggregate and is not a comparable cross-crop yield. The
per-metric lineage is the panel row's `metric_source_map` (which table supplied
production vs area) and `source_row_min`.

## Worked example 3 — a gap percentage (contract only)

`gap_index = 100 × (benchmark − observed) / benchmark`. The response names the
`benchmark_strategy` (`national_crop_median`, `national_crop_season_median`,
`top_quartile_comparable_districts`, `agro_ecological_peer_group`), and eligibility
uses the **non-negative** shortfall `max(gap, 0)` so a surplus cannot contribute
to a shortfall score.

## Worked example 4 — a priority row (contract only)

Purpose is named (`productivity_support` / `harvest_coordination`), the
methodology version is reported (`2.0.1`), and each row returns its normalized
components, effective weights after redistribution, the reference population size
and an eligibility reason. A candidate at or above its benchmark is **ineligible
with a reason**, never a LOW priority.

## Worked example 5 — a practice map value (contract only)

Practice/irrigation/erosion observations are served from
`agricultural_practice_observation` (long form: period × geography × domain ×
indicator) with `unit`, `source_id`, `source_sheet` and `source_row`. A
district/period/indicator NISR did not tabulate has **no row**, never a zero.

## Worked example 6 — a post-harvest share (contract only)

`crop_postharvest_use_multi_period` carries `indicator_code`, `value`, `unit`,
`shares_sum_pct` and `shares_sum_ok`. The share-sum check is a quality flag; the
published values are never rewritten to make it pass.

## Outstanding

* `source_row_min` is a single minimum row and cannot always locate every metric
  sourced from different tables in one sheet. A sidecar keyed by stable
  observation + metric id is the recommended fix (brief §7) and is **not yet
  implemented**.
* An authenticated/public-safe resolver that returns full source detail is
  **not yet implemented**; the explorer endpoint is the current path.
