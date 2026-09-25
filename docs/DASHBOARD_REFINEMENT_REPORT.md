# Dashboard Refinement Report

**Date:** 2026-09-25
**Task:** transform the existing Cropmatics Rwanda repository from a technically
solid but visually basic MVP into a professional agricultural
decision-intelligence platform, without inventing any statistic and without
breaking existing architecture.

Companion documents:
[DASHBOARD_IMPLEMENTATION_PROGRESS.md](DASHBOARD_IMPLEMENTATION_PROGRESS.md) ·
[DATA_TO_UI_MATRIX.md](DATA_TO_UI_MATRIX.md) ·
[FEATURE_DATA_COVERAGE.md](FEATURE_DATA_COVERAGE.md).

---

## 1. Existing system before this task

| Layer | State before |
|---|---|
| Data pipeline | validate → normalize → build; 5 processed tables; provenance columns |
| Analytics | gap index, factor correlation, intervention priority, rule-based risk, OR-Tools optimizer |
| API | thin, DB-free analytical endpoints; no dashboard/map/trend/coverage endpoints |
| Web | 1-page header nav; 6 basic pages; no charts, no map, no filter state, no design system |
| Mobile | functional offline harvest form; minimal styling |
| Tests | API 16, ML 24 (4 pre-existing failures), web 2, mobile 4 |

Preserved unchanged: the productivity-gap benchmark strategies, factor
association analysis, intervention prioritisation, post-harvest risk engine,
OR-Tools storage optimization, offline mobile architecture (SQLite + sync queue),
EN/RW translation architecture, provenance system, real NISR data, and the
statistical interpretation policy.

## 2. Implemented

**Data pipeline** (`scripts/data/`)
`build_irrigation.py`, `build_erosion.py`, `build_national_trends.py`,
`build_input_trends.py`, `build_cold_chain.py`, `build_dashboard_summary.py`,
`build_data_coverage.py`, `build_sources.py`, `build_geodata.py`; canonical
processed filenames; `run_all.py` now runs 15 ordered steps.

**Backend** (`services/api/`)
`schemas/filters.py` (shared filter model), `schemas/dashboard.py` (view models),
`schemas/dataset.py`, expanded `repositories/dataset_repository.py` (11 loaders +
`clear_cache`), services `dashboard_service`, `map_service`, `trend_service`,
`postharvest_service`, `facility_service`, `meta_service`, `dataset_service`, and
an expanded `analytics_service`. Routers `dashboard`, `maps`, `meta`, `data`,
`risk`, plus expanded `analytics`, `facilities`, `reports`.

**Frontend** (`apps/web/`)
Design tokens, `AppShell`/`AppSidebar`/`DashboardHeader`, URL filter store,
api client + TanStack Query hooks, UI primitives, an SVG Rwanda choropleth map
system, 8 feature families, and 13 routes.

**Mobile** (`apps/mobile/`)
Expanded theme tokens, extended EN/RW strings, rebuilt home dashboard and a
5-step harvest wizard with server-side risk scoring.

## 3. Python / data changes

New endpoints (all Python-computed, Pandas never in routers):

```
GET  /dashboard/overview            GET  /analytics/productivity
GET  /analytics/factors             GET  /analytics/heatmap
GET  /analytics/trends              GET  /analytics/input-adoption
GET  /analytics/post-harvest        GET  /analytics/irrigation
GET  /analytics/erosion             GET/POST /analytics/intervention-priorities
GET  /maps/district-metrics         GET  /facilities/context
GET  /meta/data-coverage            GET  /meta/sources
GET  /meta/models                   GET  /meta/algorithms
GET  /meta/dataset[/{key}]          POST /risk/post-harvest
GET  /reports/{district-summary,crop-summary,productivity-gap.csv,
     intervention-priority.csv,post-harvest.csv,dataset/{key}.csv}
```

Transformation decisions:

- Processed outputs renamed to canonical names (e.g. `district_crop_productivity.csv`)
  and all references updated (`load_database.py`, `risk_service`, docs).
- `cold_chain_context.csv` explicitly adds `capacity_status = not_verified`;
  capacity stays `null`.
- `national_crop_trends.csv` labels aggregate rows with `is_aggregate` so charts
  never sum an aggregate with its own parts; `Taro &Yams` added as a crop alias.
- `data_coverage.csv` is derived from the processed tables, so coverage cannot
  drift from reality.
- Every processed row keeps provenance columns.

Bugs fixed (pre-existing, found during implementation):

1. **Optimizer allocated zero.** Both `storage_allocation.py` copies minimised
   cost under upper-bound-only constraints, whose optimum is to assign nothing.
   Added a documented unassigned-quantity penalty so verified capacity fills
   first and cost is then minimised; reported `total_cost` is the real cost.
2. **Stale ML gap expectations.** Two `ml/tests/test_productivity_gap.py`
   assertions assumed a 3-row peer set; corrected to match the documented
   `national_crop_median` definition (pools all rows for the crop).
3. **Ruff findings.** Pre-existing style findings across `services/api` and `ml`
   cleared; `ruff check` is now clean.

## 4. UI changes

- Replaced the header nav with a fixed 256px forest sidebar (brand, grouped
  navigation, stylised terraced-hills landscape footer, mobile drawer) and a
  sticky header with search, year/season/crop/district selectors, EN/RW toggle,
  notifications and profile.
- All filters are URL search params and requery the API (nothing is filtered in
  browser memory).
- 13 routes: `/dashboard`, `/productivity`, `/yield-intelligence`, `/interventions`,
  `/post-harvest`, `/storage`, `/markets`, `/maps`, `/reports`, `/data-explorer`,
  `/transparency`, `/assistant`, `/settings`.
- Skeleton loaders for KPIs, maps, charts and tables; coverage/empty/error states.
- Real choropleth map from geoBoundaries RWA ADM2 (30 districts, joined on
  `district_code`), six choropleth metrics, always-visible legend, tooltip,
  labels toggle, harvest-pressure hatch overlay and cold-chain layer.
- Post-harvest, storage (scenario mode), reports, data explorer, transparency and
  grounded assistant pages.
- Mobile: new home dashboard (period, main crop, local records, nearby verified
  context, quick actions, history) and a wizard that preserves offline save and
  requests the risk score from the server.

## 5. Dataset usage

| Feature | Real datasets |
|---|---|
| Overview KPIs, priority table, gap heatmap, map | 01 district crop productivity + 02 district factors |
| Yield trend | 06 national crop trends |
| Input adoption | 07 national input trends |
| Post-harvest | 05 crop post-harvest use |
| Irrigation / erosion panels | 03 / 04 |
| Cold-chain map layer, facility status | 08 verified cold-chain context |
| Transparency sources | 09 + curated registry |
| Data explorer | all processed tables |
| Model panel | `ml/reports/*.json` (only if trained) |

## 6. Remaining limitations

- **District data exist only for 2025 Season B.** 2024B/2025A/2026A are national
  context; the UI says so instead of fabricating district estimates.
- **No verified storage capacity.** All capacity is `null` and displays
  "Capacity not verified"; unknown-capacity facilities are excluded from
  optimization.
- No district-level post-harvest loss join, so vulnerability in the priority
  score remains a documented crop-perishability proxy.
- Benchmark choice materially affects the gap; the strategy is always returned.
- All results are associations / priorities for investigation, not causes.
- Mobile: photos, farm name and notes are not persisted (no schema column yet).
- Reports are CSV only.

## 7. Verification

Environment: macOS, Node 20.20.2, pnpm 9.12.0 (corepack), Python 3.11.15
(`services/api/.venv`).

| Command | Result |
|---|---|
| `python scripts/data/run_all.py` | OK — 15 steps; 12 processed tables (e.g. 510 productivity rows, 30 districts, 17 crops; coverage 21 rows) |
| `python -m scripts.data.build_geodata <src>` | OK — 30 districts, 37 KB GeoJSON |
| `ruff check services/api/app services/api/tests ml/src ml/tests scripts/data` | **All checks passed** |
| `pytest services/api/tests -q` | **32 passed** |
| `pytest ml -q` | **25 passed** |
| `pnpm --filter cropmatics-web lint` | **0 errors** |
| `pnpm --filter cropmatics-web typecheck` | passed |
| `pnpm --filter cropmatics-web test` | **13 passed** |
| `pnpm --filter cropmatics-web build` | **success — 15 routes prerendered** |
| `pnpm --filter cropmatics-mobile lint` | **0 problems** |
| `pnpm --filter cropmatics-mobile typecheck` | passed |
| `pnpm --filter cropmatics-mobile test` | **4 passed** |
| Live API smoke test (`uvicorn` + `curl`) | `/dashboard/overview`, `/meta/data-coverage`, `/maps/district-metrics`, `/facilities/context`, `/meta/dataset/{key}` all returned real values; capacity stayed `null` |

**Not verified in this environment** (no Docker, no GitHub runner, no device):

- GitHub Actions workflow execution. `.github/workflows/ci.yml` is unchanged and
  the same commands pass locally, but a real Actions run was **not** observed.
- Docker/PostGIS startup and Alembic migration.
- Native Expo runtime (lint/typecheck/unit tests only).

## 8. Screens still pending

- `/yield-intelligence`, `/markets`, `/settings` — professional "coming in next
  module" screens.
- Mobile: photo attachment and farm-name/notes persistence.
- PDF reports.
- Database-backed auth/RBAC, harvest sync, PostGIS distance screens.

## 9. Recommended next work (prioritised)

1. **Run CI in GitHub Actions** and confirm the web/api/ml/data-pipeline jobs pass
   with the new lockfile.
2. **Bootstrap the database**: `alembic revision --autogenerate`, seed reference
   data, wire DB-backed auth and idempotent harvest sync.
3. **Add component-render tests** (jsdom + Testing Library) for badges, empty
   states, provenance rendering and critical table formatting.
4. **Optional MapLibre basemap** behind the existing SVG choropleth, keeping the
   current map as the offline fallback.
5. **Persist extra mobile fields** (farm name, notes, photos) with an explicit
   SQLite migration.
6. **Yield Intelligence module** using the existing `ml/` feature builder and
   district-holdout validation, surfacing real model metrics.
7. **Register an external climate source** (CHIRPS) before adding rainfall to
   any model.
