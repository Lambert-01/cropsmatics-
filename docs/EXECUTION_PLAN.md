# Execution Plan — Remaining Work

Created: **2026-10-18** from `docs/REMAINING_BUILD_PROMPT.md`; updated after the
repair pass below.
Working branch: `review/latest-improvements-2026-10-17` (no auto-promotion to
`main`; branch/deployment promotion stays an owner decision).

## Latest status

WP-2 through WP-6 are implemented in the working tree and have focused passing
tests. This includes authenticated operational ownership, AI crop/period claim
binding, displayed-row peer benchmark headlines, entity-aware transactional
mobile sync, the one-to-one farmer-profile migration, and the JSON/CSV dataset
filter contract. WP-8 and WP-9 remain evidence/UX work; WP-10 is only partly
complete until the full suite, clean data rebuild, isolated PostGIS migration
rehearsal, browser matrix and physical Android checks are run against this
exact revision.

Each work package is a file-level plan. Status is updated only with evidence;
reproduced findings are re-checked before their status changes.

## WP-1 Baseline audit (done, no code change)

Read `README.md`, `DOCUMENTATION_INDEX.md`, `docs/CURRENT_STATUS.md`,
`.github/workflows/ci.yml`, work-package domain docs, `git status` (clean tree,
branch up to date with origin). Confirmed the newly repaired areas named in the
brief exist and are covered by tests (`test_yield_intelligence.py`,
`test_priority_*`, `test_manual_projection*`, `test_farm_sync.py`,
`test_ai_claim_guard.py`, dataset/explorer tests). Preserved by convention:
no algorithm rewrites outside the stated findings, no test deletions, no raw
source edits, official/operational separation, mobile's own npm lockfile.

## WP-2 Authenticated ownership — implemented locally; PostGIS rehearsal pending

| File | Change |
|---|---|
| `services/api/app/api/deps.py` | add `get_current_farmer_profile` (get-or-create `FarmerProfile` for `CurrentUser`) |
| `services/api/app/api/v1/farms.py` | require current user; store owner; scope replay by owner (`409` on someone else's `client_uuid`); ownership-checked `_link_pending_harvests`; `extra="forbid"`; `IntegrityError` → reload/compare (idempotent under race) |
| `services/api/app/api/v1/harvests.py` | require current user for create/read/risk; store `farmer_id`; farm link only to own farm; `extra="forbid"`; race-safe replay |
| `services/api/app/schemas/farm.py`, `schemas/harvest.py` | `model_config extra="forbid"` (unknown fields → 422, not silently dropped) |
| `services/api/alembic/versions/f1c9d4a7e2b6_...` | document rollback; add ownership-aware rollback helper + test (quarantine, no silent delete) |
| `apps/mobile/src/services/api/client.ts` | attach `Authorization: Bearer` from secure storage; 401 → typed expired-session signal |
| new `apps/mobile/src/services/auth.ts` (or existing store) | register/login/refresh against `/auth`, credentials in `expo-secure-store` only |
| `apps/mobile/src/sync/queue.ts` | do not acknowledge without full server response; 401 → session-expired, entries stay queued |
| `services/api/tests/test_farm_sync.py` | anonymous → 401; A/B isolation; foreign UUID; expired token; lost-response retry; conflicting payload → 409; concurrent duplicate upload |
| migration rehearsal | disposable PostGIS (`CANONICAL_TEST_DATABASE_URL`) — CI only; recorded as blocker if unavailable locally |

## WP-3 AI claim binding — implemented locally; provider QA pending

| File | Change |
|---|---|
| `services/api/app/ai/claim_guard.py` | crop vocabulary from the **full canonical dictionary**, not just evidence/request; parse per-claim (crop, metric, value, period, unit, evidence id) tuples and bind each mention locally; swapped number/period pairs rejected; ambiguous pairings → fallback; dictionary load failure → explicit fail-closed |
| `services/api/app/ai/evidence*.py`, `entity_resolver.py` | carry evidence IDs per claim for tuple binding |
| `services/api/app/api/v1/assistant.py`, `output_validator.py`, `grounded.py` | propagate structured claims where prose cannot be validated; keep positive controls passing |
| `services/api/tests/test_ai_claim_guard.py`, `test_ai_claim_eval.py` | new reproductions (rice-vs-maize, period swap), aliases, multi-clause, translated text, missing dictionary, positive controls |
| `docs/14_AI_ASSISTANT.md`, `docs/submission/AI_EVALUATION.md` | record what is and is not proven (no mocked-transport quality claims) |

## WP-4 Peer benchmark headline — implemented locally

| File | Change |
|---|---|
| `services/api/app/services/analytics_service.py` (~line 741) | keep gap on full reference cohort; benchmark KPI = summary of `benchmark_yield_kg_ha` of **displayed** rows; cohort metadata per strategy (incl. peer group) |
| response models + `test_yield_intelligence.py`, `test_productivity_gap.py`, report/map contracts | assert strategy × province × district × missing-row × export/assistant-evidence behaviour; preserve national-median regressions |

## WP-5 SQLite sync state — implemented locally; device QA pending

| File | Change |
|---|---|
| `apps/mobile/src/database/index.ts` | entity-aware, transactional `markSynced`/`markFailed`/`markConflict` covering `local_farm`, `harvest_registration`, outbox |
| `apps/mobile/src/sync/queue.ts` | single-flight flush guard; reconnect behaviour |
| mobile sync/database tests | assert actual SQL rows (incl. restart reload), not mocked calls |

## WP-6 Dataset catalog ↔ HTTP contract — implemented locally

| File | Change |
|---|---|
| `services/api/app/services/dataset_service.py`, `api/v1/data.py`, `api/v1/reports.py`, dataset schemas | support each advertised filter in JSON **and** CSV, or stop advertising it; explicit unsupported filters; identical CSV scope/sort |
| `apps/web/features/data-explorer/DataTable.tsx`, catalog UI | grouped current/archive/program/reference browsing, meaningful selector options, metadata |
| tests | contract test per advertised filter; literal punctuation; CSV ≡ JSON selection |

## WP-7 Plan restoration and export integrity

| File | Change |
|---|---|
| `apps/web/features/yield-intelligence/ManualProjectionWorkspace.tsx`, `apps/web/lib/manualProjection.ts` | restore exact partial cases or explicitly refuse the unsupported form (no silent defaults); predictable share-link/page-scope mismatch; explicit decision before replacing a restored origin |
| projection service/schema + report exporter | bind export to calculation ID/dataset version; changed snapshot → reject + ask recalculation |
| Planning screen copy | density pass, optional detail collapsed, EN/RW copy completed |
| tests | Calculate → controlled version change → Export parity; partial-case restoration |

## WP-8 Data evidence

| File | Change |
|---|---|
| `scripts/data/inventory_sas_workbooks.py`, `ingest_sas_tables.py`, `sas_table_map.py` | hash/overlap comparison of the two 2025B variants; worksheet disposition justification |
| `docs/data/SAS_SOURCE_PRECEDENCE.md` | **only after real review**; if workbooks are absent, record the blocker instead |
| builders + canonical loader | per-metric lineage/sidecar resolver; UI metric id → workbook/table/cell path |
| transparency/export | keep quality flags, affected keys, review status visible |
| verification | two consecutive rebuilds byte-stable (`check_idempotent_build.py`); update coverage audit, data card, traceability doc |

## WP-9 Web/native UX acceptance

| Area | Files |
|---|---|
| Maps | coverage-aware controls, clickable districts, keyboard alternatives |
| Reports | previews, applied filters, self-describing downloads |
| Transparency | compact source/quality/method/model sections |
| Settings | groups, real effects, service/data status |
| Cross-page | one authoritative period control; shareable Yield Intelligence workspaces; preserve content on refetch; wrapping with sources expanded |
| Mobile | Analyze/Compare/Maps/Ask design + filters, manual planning integration, device-tested sync journey — **device/EAS evidence is an explicit blocker until a real device and authorized build exist** |

## WP-10 Verification ladder

Per package: focused regressions. At the end: `make lint`, `make typecheck`,
`make test`, `pnpm --filter cropmatics-web test`, `npm --prefix apps/mobile test`
(from fresh `npm ci`), `pytest services/api/tests`, `ruff check`,
`python scripts/data/run_all.py` twice + `check_idempotent_build.py`,
`NEXT_PUBLIC_API_BASE_URL=... pnpm --filter cropmatics-web build`.
True exit codes only (no `|| true`, no output-filter masking). PostGIS suites
run only against `CANONICAL_TEST_DATABASE_URL`. Update
`docs/CURRENT_STATUS.md`, this plan, `docs/PRODUCTION_READINESS.md` and the
remaining-work brief with exact files, commands, results and unresolved
blockers; no completion or score claims.
