# Dashboard Implementation Progress

**Date:** 2026-09-25
**Scope:** transform the working-but-basic MVP into a professional agricultural
decision-intelligence platform — dashboard shell, real Rwanda map, Python-backed
analytics pages, and a mobile visual refresh — without inventing any statistic.

Statuses: `NOT STARTED` · `IN PROGRESS` · `FUNCTIONAL` · `VERIFIED`

`VERIFIED` in the phase tables below means implemented and exercised by the
local checks listed in [DASHBOARD_REFINEMENT_REPORT.md](DASHBOARD_REFINEMENT_REPORT.md).

### Verification levels (read this before trusting a status)

| Level | Meaning |
|---|---|
| **LOCAL VERIFIED** | The command was run and passed on the development machine |
| **CI VERIFIED** | A green GitHub Actions run exists for the commit |
| **DEVICE VERIFIED** | Confirmed on a physical Android/iOS device |

**As of 2026-09-25 nothing in this repository is CI VERIFIED or DEVICE VERIFIED.**
No GitHub Actions run has been observed for these changes, and no device test has
been performed. Local results are in
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md), which records the exact
commands and their outcomes.

---

## Phase 0 — Production hardening pass (2026-09-25)

Scope: fix CI, strengthen raw-data validation, ingest the official MINAGRI
storage-context add-on, and finish the mobile implementation.

| Item | Where | Status |
|---|---|---|
| CI pnpm double-version conflict removed | `.github/workflows/ci.yml` | LOCAL VERIFIED |
| Web CI gains `build`; mobile CI gains `expo config` smoke check | `.github/workflows/ci.yml` | LOCAL VERIFIED |
| Data CI lints `scripts/data`, asserts new outputs, runs pipeline tests | `.github/workflows/ci.yml` | LOCAL VERIFIED |
| Per-source raw validation (irrigation, erosion, post-harvest sums, national trends, inputs, cold chain, MINAGRI add-on) | `scripts/data/validate_raw.py` | LOCAL VERIFIED |
| Area discrepancy report (ROUNDING_TOLERANCE / REVIEW / SEVERE) without touching raw values | `data/interim/area_consistency_report.csv` | LOCAL VERIFIED |
| MINAGRI add-on ingested (national infrastructure + cold-chain program) | `data/raw/external/minagri/`, `scripts/data/build_postharvest_infrastructure.py`, `build_cold_chain_network_summary.py` | LOCAL VERIFIED |
| `GET /analytics/storage-infrastructure` | `services/api/app/services/storage_service.py` | LOCAL VERIFIED |
| `GET /health/readiness` | `app/services/meta_service.py` | LOCAL VERIFIED |
| `GET /meta/data-version` + data manifest | `scripts/data/build_manifest.py` | LOCAL VERIFIED |
| Structured risk factors/actions with a rule-score label | `app/services/risk_service.py` | LOCAL VERIFIED |
| Storage page split into official / program / scenario sections with badges | `apps/web/app/storage/page.tsx`, `ui/DataBadge.tsx` | LOCAL VERIFIED |
| Post-harvest page: stored-vs-sold chart, headline crops, national context | `apps/web/app/post-harvest/page.tsx` | LOCAL VERIFIED |
| Transparency page: pipeline status, warnings, build identity | `apps/web/app/transparency/page.tsx` | LOCAL VERIFIED |
| Active sidebar item contrast fixed | `components/layout/AppSidebar.tsx` | LOCAL VERIFIED |
| Mobile: additive SQLite migrations (farm, risk, attachments, expanded harvest) | `src/database/schema.ts` | LOCAL VERIFIED |
| Mobile: real farm model + expanded harvest wizard (dates, GPS, notes, storage, files) | `app/register-harvest.tsx` | LOCAL VERIFIED |
| Mobile: risk persistence, structured factors, storage CTA | `app/harvest-risk.tsx` | LOCAL VERIFIED |
| Mobile: storage options, insights, profile, harvest history, alerts, home rebuilt on real data | `apps/mobile/app/*` | LOCAL VERIFIED |
| Mobile: brand mark, initials avatar, real notification badge | `src/components/BrandMark.tsx`, `AppHeader.tsx` | LOCAL VERIFIED |
| Docker image builds processed data at build time; readiness healthcheck | `services/api/Dockerfile`, `docker-compose.yml` | CODE READY — image not built here |

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
| Mobile photo/document attachment → **done this pass** (local storage; server upload still absent) | DONE (LOCAL VERIFIED) |
| Mobile farm-name / notes persistence → **done this pass** (`local_farm`, `notes`, additive migration) | DONE (LOCAL VERIFIED) |
| GitHub Actions green run | BLOCKED — not observed |
| First Alembic revision + upgrade/downgrade round trip | BLOCKED — `alembic/versions/` is empty |
| Server-side attachment upload with size/type validation | BLOCKED — not implemented |
| CHIRPS rainfall pipeline | BLOCKED — not implemented |
| Market price provider/repository/service interfaces | BLOCKED — not scaffolded |
| Database-backed auth, harvest ownership, PostGIS distance | NOT STARTED (unchanged from prior state) |
| Server-side conflict versioning for harvest edits | PARTIAL — client records CONFLICT, server has no version guard |
| Rate limiting, metrics, tracing | BLOCKED — not implemented |
| EAS preview build + physical device test | BLOCKED — not run |
| PDF report export (CSV implemented) | NOT STARTED |
| Component-render tests (jsdom/Testing Library) | NOT STARTED |
| MapLibre/Map Tiles basemap (SVG choropleth used instead) | NOT STARTED (deliberate) |
| Pixel comparison against the 8 reference images | BLOCKED — needs a human reviewer |
