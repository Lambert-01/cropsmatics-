# Dashboard Implementation Progress

**Date:** 2026-09-25
**Scope:** transform the working-but-basic MVP into a professional agricultural
decision-intelligence platform — dashboard shell, real Rwanda map, Python-backed
analytics pages, and a mobile visual refresh — without inventing any statistic.

Statuses: `NOT STARTED` · `IN PROGRESS` · `FUNCTIONAL` · `VERIFIED`

`VERIFIED` = implemented **and** exercised by the local checks listed in
[DASHBOARD_REFINEMENT_REPORT.md](DASHBOARD_REFINEMENT_REPORT.md).

---

## Phase 1 — App shell, design system, global filters

| Feature | Backend | Frontend | Real data | Tested | Status |
|---|---|---|---|---|---|
| Semantic design tokens | n/a | `tailwind.config.ts`, `app/globals.css` | n/a | build | VERIFIED |
| Sidebar (brand, groups, landscape footer, mobile drawer) | n/a | `components/layout/AppSidebar.tsx` | n/a | build/lint | VERIFIED |
| Top header (search, year/season/crop/district, EN/RW, profile) | n/a | `components/layout/DashboardHeader.tsx` | filters | build/lint | VERIFIED |
| URL-backed filter store | `schemas/filters.py` | `lib/filters.ts`, `services/hooks/useFilters.ts` | filters | unit tests | VERIFIED |
| EN/RW shell i18n | n/a | `lib/i18n.tsx` | n/a | build | FUNCTIONAL (native review pending) |
| Loading / empty / error / coverage states | n/a | `components/ui/States.tsx` | n/a | build | VERIFIED |

## Phase 2 — Python analytics endpoints

| Endpoint | Service | Real data | Tested | Status |
|---|---|---|---|---|
| `GET /dashboard/overview` | `dashboard_service` | 01 + 02 + 05 + 08 | `test_dashboard.py` | VERIFIED |
| `GET /analytics/productivity` | `analytics_service` | 01 + 02 | yes | VERIFIED |
| `GET /analytics/factors` | `analytics_service` | 01 + 02 | yes | VERIFIED |
| `GET /analytics/heatmap` | `analytics_service` | 01 | yes | VERIFIED |
| `GET /analytics/trends` | `trend_service` | 06 | yes | VERIFIED |
| `GET /analytics/input-adoption` | `trend_service` | 07 | yes | VERIFIED |
| `GET /analytics/post-harvest` | `postharvest_service` | 05 | yes | VERIFIED |
| `GET /analytics/irrigation` | `analytics_service` | 03 | smoke | VERIFIED |
| `GET /analytics/erosion` | `analytics_service` | 04 | smoke | VERIFIED |
| `GET/POST /analytics/intervention-priorities` | `analytics_service` | 01 + 02 | yes (weights validation) | VERIFIED |
| `GET /maps/district-metrics` | `map_service` | 01 + 02 | yes | VERIFIED |
| `GET /facilities/context` | `facility_service` | 08 | yes (null preservation) | VERIFIED |
| `GET /meta/data-coverage` | `meta_service` | coverage matrix | yes | VERIFIED |
| `GET /meta/sources` | `meta_service` | 09 + registry | smoke | VERIFIED |
| `GET /meta/models` | `meta_service` | `ml/reports` | yes | VERIFIED |
| `GET /meta/algorithms` | `meta_service` | constants | smoke | VERIFIED |
| `GET /meta/dataset[/{key}]` | `dataset_service` | all processed | smoke | VERIFIED |
| `POST /risk/post-harvest` | `risk_service` | 05 | smoke | VERIFIED |
| `GET /reports/*.csv` | services | processed | smoke | VERIFIED |

## Phase 3 — National overview dashboard (`/dashboard`)

| Widget | Backend | Frontend component | Real data | Status |
|---|---|---|---|---|
| KPI cards | `/dashboard/overview` | `DashboardKpis` | yes | VERIFIED |
| Rwanda map + choropleth modes | `/maps/district-metrics` | `RwandaDistrictMap` | yes (geoBoundaries) | VERIFIED |
| Map legend / tooltip / controls | `/maps/district-metrics` | `MapLegend`, `MapTooltip`, `MapControls` | yes | VERIFIED |
| Priority district/crop table | `/analytics/intervention-priorities` | `PriorityTable` | yes | VERIFIED |
| Crop yield trend | `/analytics/trends` | `YieldTrendChart` | 06 | VERIFIED |
| Input adoption chart | `/analytics/input-adoption` | `InputAdoptionChart` | 07 | VERIFIED |
| Productivity gap heatmap | `/analytics/heatmap` | `GapHeatmap` | 01 | VERIFIED |
| Insight panel + provenance | overview provenance | `InsightPanel`, `ProvenanceCard` | yes | VERIFIED |

## Phase 4 — Productivity intelligence (`/productivity`)

| Widget | Backend | Frontend component | Status |
|---|---|---|---|
| KPIs + benchmark strategy switch | `/analytics/productivity` | `DashboardKpis` + strategy chips | VERIFIED |
| District ranking | `/analytics/productivity` | `DistrictRankingTable` | VERIFIED |
| Factors associated with yield | `/analytics/factors` | `FactorAssociationChart` | VERIFIED |
| Model performance | `/meta/models` | `ModelPerformancePanel` | VERIFIED |

## Phase 5 — Intervention planner (`/interventions`)

| Widget | Backend | Frontend component | Status |
|---|---|---|---|
| Adjustable weights | `POST /analytics/intervention-priorities` | `WeightsPanel` | VERIFIED |
| Priority ranking + rationale | same | `PriorityRanking`, `DistrictRationale` | VERIFIED |
| Score component chart | same | `ScoreComponentChart` | VERIFIED |
| Scenario comparison | baseline vs adjusted | `ScenarioComparison` | VERIFIED |
| Recommended investigation areas | same | page section | VERIFIED |

## Phase 6 — Post-harvest, storage, data, transparency

| Page | Backend | Frontend | Status |
|---|---|---|---|
| `/post-harvest` | `/analytics/post-harvest` | `LossByCropChart`, `UseCompositionChart`, `RiskClassificationTable` | VERIFIED |
| `/storage` | `/facilities/context`, `/optimization/storage-allocation` | `FacilityStatus`, `OptimizationDemo`, map | VERIFIED |
| `/maps` | `/maps/district-metrics` | `RwandaDistrictMap` + ranking | VERIFIED |
| `/reports` | `/reports/*` | export cards + district summary | VERIFIED |
| `/data-explorer` | `/meta/dataset` | `DataTable` | VERIFIED |
| `/transparency` | `/meta/*` | `transparency/page.tsx` | VERIFIED |
| `/assistant` | `/assistant/query` | `assistant/page.tsx` | VERIFIED |
| `/yield-intelligence`, `/markets`, `/settings` | n/a | `ComingSoon` | VERIFIED (coming soon) |

## Phase 7 — Mobile visual refresh

| Screen | Offline logic preserved | Status |
|---|---|---|
| Home dashboard | `listHarvests`, `listPendingOutbox` unchanged | VERIFIED (typecheck/lint/test) |
| Register harvest wizard | `saveHarvestOffline` unchanged | VERIFIED |
| Risk result | server-side `/risk/post-harvest` only | VERIFIED |
| Theme, i18n (EN/RW) | tokens + strings extended | VERIFIED |
| Storage / nearby context | `/facilities/context` | FUNCTIONAL |

## Not started / remaining

| Item | Status |
|---|---|
| Mobile photo attachment (needs `expo-image-picker` + schema column) | NOT STARTED |
| Mobile farm-name / notes persistence (needs SQLite schema migration) | NOT STARTED |
| PDF report export (CSV implemented) | NOT STARTED |
| Database-backed auth, harvest sync, PostGIS distance | NOT STARTED (unchanged from prior state) |
| Component-render tests (jsdom/Testing Library) | NOT STARTED |
| MapLibre/Map Tiles basemap (SVG choropleth used instead) | NOT STARTED (deliberate) |
