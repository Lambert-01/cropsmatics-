# Feature And Data Coverage

Reviewed 2026-10-18 from the local processed tables. Runtime coverage is derived
from the serving data and exposed through `/api/v1/meta/data-coverage`; this
document does not override a deployment's actual availability.

## Official Analytical Tables

| Source layer | Observed local coverage | Meaning and limitations |
|---|---|---|
| `crop_productivity` | 6,156 rows; 14 periods, 2022A through 2026B | Contains district and aggregate rows. Select geography/farmer scale before analysis; do not add published totals to their component districts. Crop coverage is narrower in Season C. |
| `agricultural_practice_observation` | 9,468 rows; 2024A/B/C, 2025A/B/C, 2026A/B | Long-form practice, irrigation, water and erosion observations. Indicator, geography and unit availability vary by release. |
| `crop_postharvest_use_multi_period` | 1,573 rows over the same eight 2024-2026 periods | Crop/indicator observations, not invented district loss estimates. Share-sum warnings are retained. |
| Legacy factor/irrigation/erosion extracts | 2025 Season B | Retained for existing joined-factor analysis and the current priority readiness/cost component policy; do not claim all practice history is 2025B-only. |
| Legacy post-harvest use | 2025 Season B, national crop shares | Retained separately from the multi-period table. |
| Legacy national trends/input trends | Their published periods only | Do not substitute them silently for missing canonical observations. |
| Cold-chain/program context | Registered 2026 context | Program districts are not verified facility capacity. Capacity remains null where unverified. |

Counts describe the reviewed artifacts, not API constants. Rebuilds and new
sources must regenerate the manifest and coverage metadata. This review did not
rebuild the full pipeline or resolve outstanding source conflicts.

## What Each Feature May Claim

- District yield, gaps and priorities use the selected crop/period and declared
  reference population. District inspection must not redefine that population.
- Same-season change compares B with B (or A with A, C with C), not consecutive
  seasons interpreted as years. Missing comparisons stay unavailable.
- All-crop production and area may be summed across comparable rows. Their ratio
  is aggregate output per harvested hectare and changes with crop composition;
  it is not the yield of one crop or an average of unrelated crop yields.
- Factor associations use the coverage the service actually joins. Long-form
  practice data existing does not mean every analytical engine already uses it.
- Post-harvest shares are shown at the geographic level supported by the source.
  National crop shares are not district-specific measured losses.
- The priority engine still uses 2025B readiness/cost observations only where
  available. Other periods redistribute missing component weights and label
  proxies rather than borrowing another period or filling a constant.
- Manual projections are user-assumption calculations, never official statistics
  or validated forecasts. Their origins and targets must use the same season.

## Operational Data

Farm profiles and harvest registrations are voluntary mobile records, separate
from NISR statistics. The latest server code persists additional field inputs,
requires authenticated ownership for farm/harvest routes, scopes idempotency and
farm linking to the signed-in profile, and updates local farm/harvest/outbox
sync states together. This is covered by unit/API tests; physical-device
restart/reconnect behavior and a disposable PostGIS migration rehearsal remain
outstanding.

Rule-based post-harvest risk is an expert-set indicator, not a locally calibrated
probability. Storage optimization uses explicitly entered scenario supply and
capacity, never unverified capacity portrayed as an observed national total.

## Intentionally Unavailable

No fabricated storage capacity, farmer counts, budgets, expected economic gains
or market prices may fill an empty module. Validated model forecasts stay
withheld until publication evidence qualifies. A manual planning case does not
remove this requirement.

## Outstanding Data Decisions

See [SAS coverage audit](data/SAS_COVERAGE_AUDIT.md),
[data card](submission/DATA_CARD.md),
[traceability](submission/DATA_TO_NUMBER_TRACEABILITY.md) and
[Current Status](CURRENT_STATUS.md). Standalone 2025B source precedence,
worksheet dispositions, national subtotal semantics and exact cell lineage
remain unresolved. Never edit raw official inputs to hide a discrepancy.
