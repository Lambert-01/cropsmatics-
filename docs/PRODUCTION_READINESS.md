# Production Readiness

**Date:** 2026-09-25
**Commit base:** `8089b4de3bbb2804ac9594c745d41601fba167f4` plus the changes in this pass.

Every item is `READY`, `PARTIAL` or `BLOCKED` and carries the evidence used to
decide. Evidence means a command, a file, or an endpoint response — not an
intention.

Verification levels used below:

| Level | Meaning |
|---|---|
| **LOCAL VERIFIED** | Ran on this machine, in this session |
| **CI VERIFIED** | A green GitHub Actions run exists for the commit |
| **DEVICE VERIFIED** | Confirmed on a physical Android/iOS device |

---

## Data

| Item | State | Evidence |
|---|---|---|
| Raw sources committed and immutable | READY | `data/raw/cropmatics_real_data_2024_2026/01–09_*.csv`, `data/raw/external/minagri/10–11_*.csv` |
| Pipeline deterministic and re-runnable | READY | `python scripts/data/run_all.py` — 18 steps, exit 0, **LOCAL VERIFIED** |
| Structural counts match the documented baseline | READY | 510 productivity rows / 30 districts / 17 crops; 108 trend rows; 8 input rows; 21 coverage rows; asserted by `scripts/tests/test_data_pipeline.py` |
| Raw validation covers every analytical source | READY | `scripts/data/validate_raw.py` — 01, 02, 03, 04, 05, 06, 07, 08, 10, 11 |
| Known warnings preserved and published | READY | `data/interim/validation_report.json`: 49 blank cultivated area, 62 area excess (60 rounding / 2 review / 0 severe); surfaced by `/meta/data-version` and `/transparency` |
| Area discrepancy categorised without altering raw values | READY | `data/interim/area_consistency_report.csv`, asserted raw-equality in `test_area_consistency_report_categorises_raw_values` |
| MINAGRI national add-on ingested | READY | `scripts/data/build_postharvest_infrastructure.py`, `build_cold_chain_network_summary.py`; outputs `national_postharvest_infrastructure.csv` (5 rows + derived total), `cold_chain_network_summary.csv` (6 indicators) |
| National totals never joined to districts | READY | No `district` column in the infrastructure table; `test_postharvest_infrastructure_is_national_only`, `test_coverage_includes_add_on_datasets` |
| Null capacity never becomes 0 | READY | `test_cold_chain_capacity_is_null_not_zero` (both raw and processed) |
| Data manifest with hashes and row counts | READY | `scripts/data/build_manifest.py` → `data/processed/manifest.json`; exposed safely by `/meta/data-version` |
| CHIRPS rainfall pipeline | **BLOCKED** | Not implemented. No operational rainfall table exists, so no rainfall feature is shown |
| Market price ingestion | **BLOCKED** | No verified feed connected. Provider/repository/service interfaces are **not** yet scaffolded |

## API

| Item | State | Evidence |
|---|---|---|
| All routers mounted | READY | `services/api/app/api/v1/router.py` |
| New: `GET /analytics/storage-infrastructure` | READY | `services/api/app/services/storage_service.py`; `tests/test_storage_context.py` (**LOCAL VERIFIED**) |
| New: `GET /facilities/program-context` | READY | `test_program_membership_endpoint_answers_membership_only` |
| New: `GET /health/readiness` | READY | `tests/test_readiness.py` — required datasets, row counts, dictionaries, optional DB, model availability |
| New: `GET /meta/data-version` | READY | Safe manifest projection, no hashes/paths |
| `GET /analytics/post-harvest?crop=` | READY (LOCAL VERIFIED) | `postharvest_service.summary(crop)`; `test_postharvest_filter.py` — 6 tests incl. no-op district and 404 unknown crop |
| `GET /analytics/trends?compare=` (2–5 crops) | READY (LOCAL VERIFIED) | `trend_service.crop_trends(compare_crops)`; `test_trends_compare.py` |
| `GET /meta/dataset/{key}` whitelisted filters + sort | READY (LOCAL VERIFIED) | `dataset_service.fetch(filters, sort_by)`; `test_dataset_filters.py` — 400 on unsupported, 400 on unknown sort column, 422 on bad direction |
| Structured risk output | READY | `risk_service.RiskFactor` / `RiskAction`; `tests/test_risk.py` |
| Consistent error contract | PARTIAL | `DatasetUnavailable` → 503 with hints; no global exception envelope for unexpected errors |
| Rate limiting | **BLOCKED** | Not implemented |
| Request-id correlation in responses | PARTIAL | Request logging exists, but no `X-Request-ID` echo |
| OpenAPI description of the disclaimer | READY | `app/main.py` app description |

## ML

| Item | State | Evidence |
|---|---|---|
| Baseline modules + tests | READY | `ml/src`, `pytest ml -q` — 25 passed (**LOCAL VERIFIED**) |
| Model metrics never fabricated | READY | `/meta/models` returns `unavailable` when no card exists |
| Model card available in production | PARTIAL | `ml/reports/` is git-ignored. The Dockerfile builds a card only when `INSTALL_ML=true`; otherwise the model page honestly reports `unavailable`. An approved card must be injected as a deployment artifact |
| Calibrated post-harvest risk model | **BLOCKED** | The score is a documented additive rule model; wording corrected so it is never called AI confidence |

## Web

| Item | State | Evidence |
|---|---|---|
| Typecheck | READY | `pnpm --filter cropmatics-web typecheck` — clean (**LOCAL VERIFIED**) |
| Lint | READY | `pnpm --filter cropmatics-web lint` — no warnings (**LOCAL VERIFIED**) |
| Unit tests | READY | `pnpm --filter cropmatics-web test` — 26 passed |
| Production build | READY | `pnpm --filter cropmatics-web build` (**LOCAL VERIFIED**) |
| AnalyticsFilterBar (URL-backed, cascading, chips, drawer) | READY | `components/filters/AnalyticsFilterBar.tsx` |
| Responsive table system replaces nowrap CSS | READY | `components/table/`, `globals.css` `.responsive-table*` |
| Post-harvest crop filter end-to-end | READY | API tests `test_postharvest_filter.py` + `usePostHarvest(filters)` |
| Compare Crops (2–5) national trends | READY | `CompareCropsControl.tsx`; yield excluded by design |
| Data Explorer filters/sort/columns | READY | `features/data-explorer/DataTable.tsx`; `test_dataset_filters.py` |
| Storage page separated into official / program / scenario sections | READY | `apps/web/app/storage/page.tsx`, `DataBadge` |
| Active sidebar contrast | READY | White icon + white text on the teal active surface, `AppSidebar.tsx` |
| Data-quality panel on transparency | READY | `apps/web/app/transparency/page.tsx` |
| Charts never recompute analytics values | READY | All series come from API responses; the page recomputes nothing |
| Design reference parity | PARTIAL | Not pixel-compared against the 8 images — needs a human reviewer (see `VISUAL_REFERENCE_IMPLEMENTATION.md`) |

## Mobile

| Item | State | Evidence |
|---|---|---|
| Typecheck | READY | `pnpm --filter cropmatics-mobile typecheck` — clean (**LOCAL VERIFIED**) |
| Lint | READY | `pnpm --filter cropmatics-mobile lint` — 0 errors / 0 warnings |
| Unit tests | READY | 21 passed (`tests/i18n.test.ts`, `tests/harvest.test.ts`, `tests/schema.test.ts`) |
| Expo config resolves | READY | `expo config --type public` (**LOCAL VERIFIED**) |
| Additive SQLite migrations | READY | `src/database/schema.ts`, `ensureColumns`; test asserts no DROP/DELETE and that every added column is nullable or defaulted |
| Risk persistence | READY | `harvest_risk` table; risk screen stores the server result and falls back to the stored one when offline |
| Farm model | READY | `local_farm` table + farm selector and inline creation in the wizard |
| Expanded harvest schema | READY | farm, start/end dates, GPS, notes, storage-assistance columns |
| Native date pickers | READY | `DateField` + `@react-native-community/datetimepicker` |
| GPS (optional, permission-gated) | READY | `expo-location` in the wizard's Location step |
| Attachments | READY | `expo-image-picker`, `expo-document-picker`, `expo-file-system`; rows written only after save so a cancelled wizard leaves nothing behind |
| Permission strings declared for real builds | READY | `app.json` plugins for `expo-image-picker` and `expo-location` |
| Notification badge reflects real pending records | READY | `AppHeader` counts `countPendingOutbox()` |
| EAS preview build | **BLOCKED** | Not run — needs Expo credentials/EAS project |
| Physical device verification | **BLOCKED** | No device test this session: offline save, restart, reconnect, permission denial, keyboard, date picker |
| Photo/GPS permission-denial paths | PARTIAL | Code paths exist and degrade gracefully; not exercised on a device |

## Database

| Item | State | Evidence |
|---|---|---|
| Models defined | READY | `services/api/app/models/*` |
| Alembic configured | READY | `services/api/alembic/env.py`, `alembic.ini` |
| First revision generated | **BLOCKED** | `services/api/alembic/versions/` is empty — `alembic upgrade head` creates nothing. `make db-init` (create-from-models) is the current dev path |
| `upgrade → downgrade → upgrade` round trip verified | **BLOCKED** | Requires a migration and a temporary PostGIS database |
| PostGIS used only for legitimate geospatial work | PARTIAL | PostGIS is provisioned and GeoAlchemy is a dependency, but farm/facility geometry is not yet stored; no facility points are fabricated |
| Conflict handling on harvest edits | PARTIAL | The client records a `CONFLICT` status on a 409 and surfaces it under Alerts/Sync, but the server has no `version`/`updated_at` guard yet, and the app only creates (never edits) harvests |

## Security

| Item | State | Evidence |
|---|---|---|
| Server-side validation of every request | READY | Pydantic models, `_validate_district_crop` on harvest create |
| CORS restricted to configured origins | READY | `settings.cors_origin_list`, no wildcard |
| JWT settings pinned, Argon2 available | READY | `app/core/config.py`, `argon2-cffi` in requirements |
| Secrets not logged | READY | `app/core/logging.py` sets an explicit formatter; readiness/data-version expose no secrets |
| PII never in public analytical endpoints | READY | Analytical endpoints read aggregated CSV tables only; GPS and notes stay on-device and in operational tables |
| Idempotent mobile sync (no duplicate harvests) | READY | `client_uuid` lookup returns the stored row; repeated sync cannot duplicate |
| Upload size / type validation | **BLOCKED** | No server-side upload endpoint yet, so mobile attachments are stored locally and `server_url` stays null. The client enforces a 20 MB / 5-file cap; the server-side enforcement required by the brief is not built |
| Rate limiting / abuse protection | **BLOCKED** | Not implemented |
| Auth-backed harvest ownership | PARTIAL | `POST /harvests` is not yet scoped to an authenticated owner |

## Deployment

| Item | State | Evidence |
|---|---|---|
| API image builds processed data | READY (code) | `services/api/Dockerfile` runs `scripts/data/run_all.py` at build time and fails the build if validation fails or outputs are missing |
| Image build verified in this session | **BLOCKED** | Docker was not run here, so the image itself is unverified |
| Compose wired to the repo-root context | READY | `docker-compose.yml` `api.build.context: .` |
| Container readiness probe | READY | `HEALTHCHECK` calls `/api/v1/health/readiness` and requires `status=ready` |
| Non-root container user | READY | `appuser` (uid 10001), `/app` chowned |
| `.dockerignore` keeps the context small | READY | `.dockerignore` |
| Hosted API + web deployment provisioned | **BLOCKED** | `infra/README.md` is a note only; nothing is deployed |

## CI/CD

| Item | State | Evidence |
|---|---|---|
| pnpm dual-version conflict fixed | READY | `pnpm/action-setup@v4` no longer passes `version:`, so `packageManager: pnpm@9.12.0` is authoritative |
| Web CI runs lint, typecheck, test **and build** | READY | `.github/workflows/ci.yml` |
| Mobile CI: lint, typecheck, test **and** `expo config` — previous `useState` failure fixed | READY (LOCAL VERIFIED) | `apps/mobile/app/share.tsx`; all four mobile commands pass locally |
| API CI builds analytical tables before pytest — previous missing-processed-data failure fixed | READY (LOCAL VERIFIED) | `.github/workflows/ci.yml` api job runs `python scripts/data/run_all.py`; full API suite passes locally after a pipeline run |
| Data CI lints `scripts/data`, runs the pipeline, asserts outputs, runs pipeline tests | READY | `.github/workflows/ci.yml` (`data-pipeline` job) |
| `--frozen-lockfile` install | PARTIAL | Lockfile updated locally by `pnpm add` for new table/filter dependencies; should install cleanly — **not confirmed by a CI run** |
| GitHub Actions green | **BLOCKED** | No push was made and no Actions run was observed. Treat every job as **LOCAL VERIFIED** only. The project must not be called CI verified until one single commit has Web+Mobile+API+ML+Data all green |

## Observability

| Item | State | Evidence |
|---|---|---|
| Structured logging configured | PARTIAL | `configure_logging()` sets level/stream/format. There is no JSON formatter and no request-id/duration/data-version fields |
| Secrets excluded from logs | READY | No secret is logged anywhere; readiness output contains none |
| Data version visible at runtime | READY | `GET /meta/data-version` |
| Readiness probe | READY | `GET /health/readiness` |
| Metrics/tracing | **BLOCKED** | Not implemented |

## Backup

| Item | State | Evidence |
|---|---|---|
| Raw data recoverable | READY | Committed under `data/raw/` (immutable) |
| Processed data recoverable | READY | Regenerable from raw by `run_all.py`; the manifest records source hashes |
| Database backup strategy | **BLOCKED** | No database is in production use; no backup/restore procedure exists |
| Mobile local data durability | PARTIAL | SQLite in WAL mode; additive migrations only. No export/restore for a lost phone |

## Privacy

| Item | State | Evidence |
|---|---|---|
| Official statistics and app data separated | READY | Separate tables and `SOURCE_IDS`; `is_synthetic` flag on every processed row |
| Respondent microdata not redistributed | READY | Only aggregates are committed |
| GPS coordinates private | READY | Stored locally and in operational tables only; never returned by a public analytical endpoint |
| Farm notes private | READY | Local SQLite (`notes`), not published |
| Consent copy shown to the user | READY | Mobile Profile → Privacy and consent |
| Data-protection review | **BLOCKED** | No formal DPIA or retention policy |

## Outstanding blockers

1. **GitHub Actions has not been observed green.** Everything here is local.
2. **No Alembic revision exists**, so `alembic upgrade head` is a no-op.
3. **No Docker build was run**, so the multi-stage image is unverified in practice.
4. **No device test** was performed, so the Expo permissions, date picker and attachment flows are unproven on hardware.
5. **Server-side attachment upload does not exist.** Attachments are local-only.
6. **CHIRPS rainfall and market-price ingestion are not implemented**, so mobile shows no weather and no prices.
7. **No rate limiting, metrics or tracing.**
8. **Auth is not wired to harvest ownership**, and the database-backed User/Role/Farm tables are unused.
