# Data-to-UI Matrix

Every number that reaches the interface is traced from a **raw / processed
dataset** through a **Python service** and an **API endpoint** to a **frontend
component**. The frontend never computes an official analytical value.

Legend for datasets (`data/processed/`):

| # | Processed dataset | Built by |
|---|---|---|
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

## Matrix

| UI widget | Dataset(s) | Python service | API | Frontend component |
|---|---|---|---|---|
| Overview KPI cards | 01+02+05+08 | `dashboard_service.overview` | `GET /dashboard/overview` | `features/dashboard/DashboardKpis` |
| Productivity/Risk map | 01+02 | `map_service.district_metrics` | `GET /maps/district-metrics` | `features/maps/RwandaDistrictMap`, `DistrictChoropleth` |
| Map tooltip | 01+02 | `map_service.district_metrics` | `GET /maps/district-metrics` | `features/maps/MapTooltip` |
| Map legend | 01+02 (min/max) | `map_service.district_metrics` | `GET /maps/district-metrics` | `features/maps/MapLegend` |
| Map metric switch | — | — | query param `metric` | `features/maps/MapControls` |
| Harvest-pressure overlay | 01 | `analytics_service.gapped` | `GET /maps/district-metrics` | `features/maps/HarvestPressureLayer` |
| Cold-chain layer | 08 | `facility_service.context` | `GET /facilities/context` | `features/maps/FacilityLayer` |
| Priority table | 01+02 | `analytics_service.priorities` | `GET /analytics/intervention-priorities` | `features/dashboard/PriorityTable` |
| Yield trend chart | 06 | `trend_service.crop_trends` | `GET /analytics/trends` | `features/dashboard/YieldTrendChart` |
| Input adoption chart | 07 | `trend_service.input_adoption` | `GET /analytics/input-adoption` | `features/dashboard/InputAdoptionChart` |
| Gap heatmap | 01 (gap) | `analytics_service.heatmap` | `GET /analytics/heatmap` | `features/dashboard/GapHeatmap` |
| Insight panel | overview result | `dashboard_service` | `GET /dashboard/overview` | `features/dashboard/InsightPanel` |
| Provenance card | all | service provenance | all endpoints | `components/ProvenanceCard` |
| Productivity KPIs | 01+02 | `analytics_service.productivity` | `GET /analytics/productivity` | `features/dashboard/DashboardKpis` |
| District ranking | 01+02 | `analytics_service.productivity` | `GET /analytics/productivity` | `features/productivity/DistrictRankingTable` |
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
| Report exports | processed | reports services | `GET /reports/*.csv` | `app/reports/page.tsx` |
| Data explorer tables | all processed | `dataset_service.fetch` | `GET /meta/dataset/{key}` | `features/data-explorer/DataTable` |
| Data coverage matrix | C | `meta_service.coverage` | `GET /meta/data-coverage` | `app/transparency/page.tsx` |
| Source registry | 09 + registry | `meta_service.sources` | `GET /meta/sources` | `app/transparency/page.tsx` |
| Algorithms & proxies | constants | `meta_service` | `GET /meta/algorithms` | `app/transparency/page.tsx` |
| Assistant answer | 01+02 retrieved | `assistant` router | `POST /assistant/query` | `app/assistant/page.tsx` |
| Mobile risk result | 05 | `risk_service.score` | `POST /risk/post-harvest` | `app/register-harvest.tsx` |
| Mobile nearby context | 08 | `facility_service.context` | `GET /facilities/context` | `app/index.tsx` |

## Rules this matrix enforces

1. No UI widget reads a CSV, a GeoJSON attribute list, or a hardcoded statistic.
2. Every widget has exactly one API endpoint and one Python service.
3. `coverage_level` travels with every aggregate so the UI can say
   *"district-level data are not available for this period"* instead of pretending.
4. Nulls propagate: `capacity_kg = null` renders as *"Capacity not verified"*, never `0`.
5. Proxies are labelled wherever they enter a score (see `/meta/algorithms`).
