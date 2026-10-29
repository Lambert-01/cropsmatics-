# Data-to-UI Matrix

Every number that reaches the interface is traced from a **raw / processed
dataset** through a **Python service** and an **API endpoint** to a **frontend
component**. The frontend never computes an official analytical value.

Legend for datasets (`data/processed/`):

| # | Processed dataset | Built by |
|---|---|---|
| P | `crop_productivity.csv` | `build_crop_productivity.py` |
| 01 | `district_crop_productivity.csv` | `build_district_crop_dataset.py` |
| 02 | `district_productivity_factors.csv` | `build_factor_dataset.py` |
| 03 | `irrigation_water.csv` | `build_irrigation.py` |
| 04 | `erosion_control.csv` | `build_erosion.py` |
| 05 | `crop_postharvest_use.csv` | `build_postharvest_dataset.py` |
| 06 | `national_crop_trends.csv` | `build_national_trends.py` |
| 07 | `national_input_trends.csv` | `build_input_trends.py` |
| 08 | `cold_chain_context.csv` | `build_cold_chain.py` |
| 09 | `data_sources.csv` | `build_sources.py` |
| T | `training_district_crop.csv` | `build_training_dataset.py` (01 ⋈ 02) |
| C | `data_coverage.csv` | `build_data_coverage.py` |
| O | `dashboard_overview.csv` | `build_dashboard_summary.py` |

**P is the multi-period panel** and is what a period-aware widget reads; **01** is
the legacy single-release extract, still used for the release it actually is
(2025B), because that is the only table carrying the district factor columns.
With no period selected, a period-aware widget reads the latest published
district release and names it; a single-release layer reads the release that
carries it and names that. See `docs/data/SAS_COVERAGE_AUDIT.md` for the
maintained coverage register.

## Matrix

| UI widget | Dataset(s) | Python service | API | Frontend component |
|---|---|---|---|---|
| Overview KPI cards | P+01+05+08 | `dashboard_service.overview` | `GET /dashboard/overview` | `features/dashboard/DashboardKpis` |
| Overview scope line | period axis (C) | `dashboard_service.overview` | `GET /dashboard/overview` | `components/ui/States.ScopeNotice` |
| Published-period timeline | period axis (C) | `dashboard_service.overview` | `GET /dashboard/overview` | `features/dashboard/PeriodTimeline` |
| Productivity/Risk map | P+01+02 | `map_service.district_metrics` | `GET /maps/district-metrics` | `features/maps/RwandaDistrictMap`, `DistrictChoropleth` |
| Field evidence and allocation | optional `field_crop_observations.csv` | `field_service.field_observations` | `GET /maps/field-observations` | Dashboard `FieldEvidenceSummary` + `FieldEvidenceDistrictChart`, analytical-page `FieldEvidenceSummary`, mobile `FieldEvidenceCard` |
| Map tooltip | P+01+02 | `map_service.district_metrics` | `GET /maps/district-metrics` | `features/maps/MapTooltip` |
| Map legend | P+01+02 (min/max) | `map_service.district_metrics` | `GET /maps/district-metrics` | `features/maps/MapLegend` |
| Map metric switch | — | — | query param `metric` | `features/maps/MapControls` |
| Harvest-pressure overlay | 01 | `analytics_service.gapped` | `GET /maps/district-metrics` | `features/maps/HarvestPressureLayer` |
| Cold-chain layer | 08 | `facility_service.context` | `GET /facilities/context` | `features/maps/FacilityLayer` |
| Priority table | P+01+02 | `analytics_service.priorities` | `GET /analytics/intervention-priorities` | `features/dashboard/PriorityTable` |
| Yield trend chart | 06 | `trend_service.crop_trends` | `GET /analytics/trends` | `features/dashboard/YieldTrendChart` |
| Input adoption chart | 07 | `trend_service.input_adoption` | `GET /analytics/input-adoption` | `features/dashboard/InputAdoptionChart` |
| Gap heatmap | 01 (gap) | `analytics_service.heatmap` | `GET /analytics/heatmap` | `features/dashboard/GapHeatmap` |
| Insight panel | overview result | `dashboard_service` | `GET /dashboard/overview` | `features/dashboard/InsightPanel` |
| Provenance card | all | service provenance | all endpoints | `components/ProvenanceCard` |
| Productivity KPIs | P+01+02 | `analytics_service.productivity` | `GET /analytics/productivity` | `features/dashboard/DashboardKpis` |
| District ranking | P+01+02 | `analytics_service.productivity` | `GET /analytics/productivity` | `features/productivity/DistrictRankingTable` |
| Factors associated with yield | 01+02 | `analytics_service.factor_associations` | `GET /analytics/factors` | `features/productivity/FactorAssociationChart` |
| Model performance | `ml/reports` | `meta_service.models` | `GET /meta/models` | `features/productivity/ModelPerformancePanel` |
| Weights sliders | 01+02 | `analytics_service.priorities` | `POST /analytics/intervention-priorities` | `features/interventions/WeightsPanel` |
| Priority ranking | 01+02 | `analytics_service.priorities` | GET/POST priorities | `features/interventions/PriorityRanking` |
| District rationale | 01+02 | `analytics_service.priorities` | GET/POST priorities | `features/interventions/DistrictRationale` |
| Score components | 01+02 | `analytics_service.priorities` | GET/POST priorities | `features/interventions/ScoreComponentChart` |
| Scenario comparison | 01+02 | `analytics_service.priorities` | GET + POST | `features/interventions/ScenarioComparison` |
| Post-harvest KPIs | 05 | `postharvest_service.summary` | `GET /analytics/post-harvest` | `DashboardKpis` |
| Loss by crop | 05 | `postharvest_service.summary` | `GET /analytics/post-harvest` | `features/postharvest/LossByCropChart` |
| Use composition | 05 | `postharvest_service.summary` | `GET /analytics/post-harvest` | `features/postharvest/UseCompositionChart` |
| Risk classification | 05 | `postharvest_service.summary` | `GET /analytics/post-harvest` | `features/postharvest/RiskClassificationTable` |
| Facility status table | 08 | `facility_service.context` | `GET /facilities/context` | `features/storage/FacilityStatus` |
| Optimization demo | user scenario only | `optimization.storage_allocation` | `POST /optimization/storage-allocation` | `features/storage/OptimizationDemo` |
| District water-source report | `agricultural_practice_observation` (`water_source` domain) | `analytics_service.practice_indicator_history` | `GET /reports/water-source.csv` or `.json` | `app/reports/page.tsx` |
| Fertilizer source by type | `fertilizer_source.csv` | `dataset_service.fertilizer_source` and `trend_service.fertilizer_source_snapshot` | `GET /reports/fertilizer-source.csv` or `.json`; `GET /analytics/fertilizer-source` | `app/reports/page.tsx`, Data Explorer, `FertilizerSourceCard` on Dashboard and Productivity (national context only) |
| District fertilizer access | `agricultural_practice_observation` (`fertilizer_source_district` domain) | `analytics_service.practice_indicator_history` | `GET /reports/fertilizer-access.csv` or `.json` | `app/reports/page.tsx` |
| Report exports | processed | reports services | `GET /reports/*.csv` | `app/reports/page.tsx` |
| Data explorer tables | all processed | `dataset_service.fetch` | `GET /meta/dataset/{key}` | `features/data-explorer/DataTable` |
| Data coverage matrix | C | `meta_service.coverage` | `GET /meta/data-coverage` | `app/transparency/page.tsx` |
| Source registry | 09 + registry | `meta_service.sources` | `GET /meta/sources` | `app/transparency/page.tsx` |
| Algorithms & proxies | constants | `meta_service` | `GET /meta/algorithms` | `app/transparency/page.tsx` |
| Data & Models failure state | API response status | shared UI state | each reference endpoint | `app/transparency/page.tsx` |
| Assistant answer | 01+02 retrieved | `assistant` router | `POST /assistant/query` | `app/assistant/page.tsx` |
| Mobile risk result | 05 | `risk_service.score` | `POST /risk/post-harvest` | `app/register-harvest.tsx` |
| Mobile nearby context | 08 | `facility_service.context` | `GET /facilities/context` | `app/index.tsx` |
| Mobile planning projection | P + period axis | `manual_projection_service` | `GET /scenarios/manual-projection/origins` + `POST /scenarios/manual-projection` | `ManualPlanningSection` |

## Rules this matrix enforces

1. No UI widget reads a CSV, a GeoJSON attribute list, or a hardcoded statistic.
2. Every widget has exactly one API endpoint and one Python service.
3. `coverage_level` travels with every aggregate so the UI can say
   *"district-level data are not available for this period"* instead of pretending.
4. Nulls propagate: `capacity_kg = null` renders as *"Capacity not verified"*, never `0`.
5. Proxies are labelled wherever they enter a score (see `/meta/algorithms`).
6. A widget that needs one release says which one it used. A map is never
   coloured from a release other than the one its own subtitle names, and no
   panel presents a single release's figures under an "all published periods"
   heading.

## 2022A–2026B trends and period availability (this pass)

| Dataset | Service | Endpoint | UI |
|---|---|---|---|
| `crop_productivity.csv` (national rows) | `canonical_trend_service.national_trend` | `GET /analytics/canonical-trend?crop=` | Overview / trend visual |
| `crop_productivity.csv` (district rows) | `canonical_trend_service.district_crop_trend` | `GET /analytics/canonical-trend?crop=&district=` | District + crop trend |
| `crop_productivity.csv` | `map_service.district_metrics` | `GET /maps/district-metrics?metric=production\|harvested_area` | Overview map (crop-agnostic default) |
| `crop_productivity.csv` | `period_service.catalog` | `GET /meta/periods` | Period scope control, availability badges |

`GET /analytics/canonical-trend` is deliberately **separate** from the legacy
`GET /analytics/trends`: the legacy endpoint still serves the single-release
context table for the pages that need it, and the two methodologies are never
mixed in one visual. The canonical trend reports its source, unit, geography,
period axis and method with every response, preserves published nulls, never
averages raw crop yields, and never adds a crop family total to its own
varieties (the canonical panel stores one row per canonical crop, asserted at
read time).

The overview map opens on `production` — an additive quantity valid for any crop
selection (or none) — instead of a metric that needs a crop before it can be
coloured. Yield remains crop-gated; `gap` remains valid district-wide because it
is relative to each crop's own benchmark.
