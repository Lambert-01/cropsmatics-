# Production 503 incident and release verification

**Project:** Cropmatics Rwanda (DataSprout) · **Branch:** `main` only
**Audit date:** 2026-10-13 · **Head at audit:** `9e2e5aa225c6e5ebfb66ae9d9524372763485038` (= `origin/main`)
**API:** `https://cropsmatics-api.onrender.com/api/v1` · **Web:** `https://cropsmatics-web.vercel.app`
**Owner-approval gate:** **NOT GRANTED** — no Neon `DATABASE_URL`, no Render/Vercel credentials were available in this environment; every production *write* is therefore still pending.

Status vocabulary: **IMPLEMENTED** (code exists) · **LOCALLY VERIFIED** (executed
here, evidence below) · **CI VERIFIED** (green on GitHub Actions) · **PRODUCTION
VERIFIED** (observed on the deployed service) · **DEVICE VERIFIED** · **PENDING** ·
**BLOCKED**.

---

## 1. Root cause

Three conditions, all required for the outage:

1. **The Neon canonical database is stale.** It holds a dataset loaded on
   **2026-09-28** (version `0.2.0-535efe5d2bd75b51`): **8 periods** (2024A–2026B),
   **3,738** productivity rows, **1,477** observations. The image being served
   expects a different dataset: **14 periods** (2022A–2026B), **6,156**
   productivity rows, **9,468** practice observations, **1,573** post-harvest
   observations. *PRODUCTION VERIFIED* (readiness + `/data/version`).

2. **The release step that would resynchronise it never runs.** The load is
   designed as a Render Pre-Deploy Command (`python /app/scripts/data/canonical_bootstrap.py`,
   declared in `render.yaml`). Render documents that the pre-deploy command *"is
   available for paid web services"* (https://render.com/docs/deploys); the
   production service is on the **Free** plan, so it cannot run. The committed
   blueprint also cannot reconfigure a service that was created by hand — as
   `render.yaml` itself warns. *PRODUCTION VERIFIED* (the database was never
   resynchronised; the service reports itself Live while readiness is 503, so its
   health check is not the deep readiness path either).

3. **`CANONICAL_DATA_MODE=required` correctly turns that staleness into HTTP
   503.** Every canonical-backed analytics read is refused with a typed
   `503 DATASET_OUT_OF_SYNC` rather than answered from stale or file-based data.
   **This is the safeguard working as designed.**

No application defect produced the 503. There was no frontend defect hiding it,
no missing migration, no missing PostGIS extension, and no cold start: the
response is a typed application error emitted *after* a successful database probe,
which a sleeping instance cannot produce.

### 1a. Aggravating defect found during the investigation (and fixed)

`make data` was **not idempotent**. `scripts/data/ingest_sas_tables.py` read
`data/interim/crop_alias_map.csv`, an artefact that `scripts/data/normalize_crops.py`
writes **later in the same pipeline**. Consequences, measured in one clean
checkout:

| Build | Content version | Post-harvest `crop` labels |
| --- | --- | --- |
| First run (pristine tree — the Docker image, a fresh clone, CI) | `0.2.0-84a97c5a37f07996` | raw published labels (`Banana for beer`) |
| Second run in the same tree | `0.2.0-646a72d53cd349df` | canonical (`Banana`) |

Same commit, two different datasets. This is what would have made the "obvious"
repair fail: an operator running the release step from their own working tree
would have loaded `0.2.0-646a72d53cd349df`, the image would still expect
`0.2.0-84a97c5a37f07996`, and the 503 would have survived the fix.

## 2. Original failing endpoints

Observed 2026-10-13 against the deployed API (full transcript:
`docs/audits/artifacts/PRODUCTION_SMOKE_2026-10-13.json`):

| Endpoint | Status | Body |
| --- | --- | --- |
| `GET /dashboard/overview?benchmark_strategy=national_crop_median` | **503** | `DATASET_OUT_OF_SYNC` |
| `GET /analytics/input-adoption` | **503** | `DATASET_OUT_OF_SYNC` |
| `GET /analytics/canonical-trend?crop=Maize` | **503** | `DATASET_OUT_OF_SYNC` |
| `GET /productivity` (context) | **503** | `DATASET_OUT_OF_SYNC` |
| `GET /maps/district-metrics?metric=gap&crop=Maize&period_code=2026B` | **503** | `DATASET_OUT_OF_SYNC` |
| `GET /health/readiness` | **503** | `status: not_ready` |
| `GET /health`, `GET /api/v1/health` | 200 | liveness unaffected |
| `GET /data/version`, `/data/coverage` | 200 | these report the *loaded* (stale) state |
| `GET /meta/periods`, `/crops`, `/analytics/practice-indicators`, `/analytics/postharvest-history`, `/analytics/trends` | 200 | served from the image's processed artefacts, not the canonical layer |

All four mandated diagnostics routes exist and were exercised; the error contract
is:

```json
{"code":"DATASET_OUT_OF_SYNC",
 "expected_version":"0.2.0-84a97c5a37f07996",
 "loaded_version":"0.2.0-535efe5d2bd75b51",
 "expected_periods":["2022A", "...", "2026B"],
 "loaded_periods":["2024A", "...", "2026B"],
 "retryable":true}
```

## 3. Actual Render configuration

| Item | Blueprint (`render.yaml`) | Live service evidence | Status |
| --- | --- | --- | --- |
| Branch | `main` | deploys track `main` (`9e2e5aa…`) | matches |
| Runtime / Dockerfile / context | Docker, `./services/api/Dockerfile`, root | image build timestamp `2026-10-12T22:31:19Z`, `git_sha: "unknown"` (no `.git` in the image) | consistent with a Docker build from a repo checkout |
| Pre-Deploy Command | `python /app/scripts/data/canonical_bootstrap.py` | **never runs** — the database was never resynchronised, and the plan does not support it | **MISMATCH (plan limitation)** |
| Health check path | `/api/v1/health/readiness` | the service is "Live" while readiness returns 503, so the deep readiness path is **not** the configured check | **MISMATCH** |
| Start command | uvicorn on `$PORT` | serves traffic; liveness 200 | consistent |

Dashboard-side items (Render plan/tier, env var values, Vercel project settings)
could **not** be read from this environment: no Render, Vercel or Neon
credentials exist here. They are marked **PENDING** with exact manual steps in
`docs/17_DEPLOYMENT.md` §5 and `docs/19_PRODUCTION_INCIDENT_RUNBOOK.md` §4.

## 4. Actual database status

Read-only reconnaissance only (no credentials; `DATABASE_URL` in `.env` points at
`localhost`). All facts below come from the API's read-only canonical endpoints:

| Fact | Value | Source |
| --- | --- | --- |
| Reachability | reachable (`availability: ready`) | `/health/readiness` |
| Migrations | applied (`migrations_applied: true`) | `/health/readiness` |
| Tables | present (`tables_present: true`) | `/health/readiness` |
| Dataset loaded | yes, `dataset_version` rows = 1 | `/health/readiness` |
| Loaded version | `0.2.0-535efe5d2bd75b51` | `/health/readiness`, `/data/version` |
| Loaded provenance | `git_sha c22f7445…`, `build_timestamp 2026-09-28T08:49:50Z` | `/data/version` |
| Row counts | `period` 8, `crop_productivity` 3,738, `agricultural_observation` 1,477 | `/health/readiness` |
| Loaded periods | 2024A–2026B (8) | `/health/readiness` |
| Synthetic rows | excluded by every canonical query (`is_synthetic` filters) | code + integration tests |

**A direct Neon inspection was not possible**, so the reconnaissance above is
API-mediated. The pending release step closes that gap by printing the loader's
own per-table report and running the six verification SQL statements in
`docs/17_DEPLOYMENT.md` §6.

## 5. Dataset version mismatch

| Identity | Version | Periods | Productivity rows |
| --- | --- | --- | --- |
| Neon (loaded) | `0.2.0-535efe5d2bd75b51` | 8 (2024A–2026B) | 3,738 |
| Deployed image (built from `main`) | `0.2.0-84a97c5a37f07996` | 14 (2022A–2026B) | 6,156 |

Reproduced and explained *LOCALLY VERIFIED*:

* A clean git worktree at `9e2e5aa` (tracked files only — the Docker build
  context) rebuilt the pipeline and produced **exactly** `0.2.0-84a97c5a37f07996`,
  matching the deployed image's expectation. The image is therefore consistent
  with `main`; the database is the stale side.
* The image's own manifest (`/meta/data-version`) was built at
  `2026-10-12T22:31:19Z`, between `eea7e3f` (00:30:32+02:00) and `9e2e5aa`
  (00:36:19+02:00), and `eea7e3f..9e2e5aa` touches only `apps/web` and `docs/` —
  i.e. the deployed image matches the current pipeline content.
* The 8-period/14-period and 3,738/6,156 mismatches are the panel growing from
  the 2024–2026 releases to 2022A–2026B between the 2026-09-28 load and today.

## 6. Changes made

| # | Change | File(s) | Status |
| --- | --- | --- | --- |
| 1 | **Pipeline determinism.** The crop alias map is derived from committed inputs (`alias_map()`) instead of being read from a leftover interim artefact a later step writes | `scripts/data/normalize_crops.py`, `scripts/data/ingest_sas_tables.py` | IMPLEMENTED + LOCALLY VERIFIED |
| 2 | **Idempotency proof + CI guard.** `check_idempotent_build.py` rebuilds and fails if the content-addressed version moves; wired into CI | `scripts/data/check_idempotent_build.py`, `.github/workflows/ci.yml` | IMPLEMENTED + LOCALLY VERIFIED |
| 3 | **`--dry-run` writes nothing** — not even migrations; it now reports the pending migration state instead of applying it | `scripts/data/canonical_bootstrap.py` | IMPLEMENTED + LOCALLY VERIFIED |
| 4 | **Web 503 handling.** Typed `ApiFailure`, honest sentence per code (`DATASET_OUT_OF_SYNC`, `DATABASE_UNAVAILABLE`, bare 5xx, unreachable), status/code kept for policy | `apps/web/lib/apiError.ts`, `apps/web/lib/api.ts` | IMPLEMENTED + LOCALLY VERIFIED |
| 5 | **Bounded web retry policy.** One retry, capped backoff, no retry on deterministic refusals, no refetch on window focus | `apps/web/lib/queryClient.ts`, `apps/web/app/providers.tsx` | IMPLEMENTED + LOCALLY VERIFIED |
| 6 | **Production-safe error copy.** The developer hint (`make api`/`make data`) renders only outside production | `apps/web/components/ui/States.tsx` | IMPLEMENTED + LOCALLY VERIFIED |
| 7 | **Mobile 503 handling + bounded retry** (was: retry 2, generic message) | `apps/mobile/src/services/api/client.ts`, `apps/mobile/src/services/queryPolicy.ts`, `apps/mobile/app/_layout.tsx` | IMPLEMENTED + LOCALLY VERIFIED |
| 8 | **Mismatch is reported everywhere.** `/data/*` envelopes carry `canonical_sync` (`in_sync`, expected/loaded versions) and a plain-language limitation when stale | `services/api/app/services/data_status_service.py`, `services/api/app/schemas/data_status.py` | IMPLEMENTED + LOCALLY VERIFIED |
| 9 | **Read-only production smoke gate** (`scripts/verify_production.py`): 12 required + 5 context endpoints, leak checks, non-zero exit on failure | `scripts/verify_production.py` | IMPLEMENTED + run against production |
| 10 | **Secure alternative release process** (manual, approval-gated, pinned commit, dry-run by default) | `.github/workflows/release-database.yml` | IMPLEMENTED (needs the `PRODUCTION_DATABASE_URL` secret) |
| 11 | **Regression tests** (see §10) | `services/api/tests/test_readiness.py`, `scripts/tests/test_pipeline_determinism.py`, `scripts/tests/test_canonical_bootstrap.py`, `apps/web/tests/api-failure.test.ts`, `apps/mobile/tests/api-errors.test.ts` | IMPLEMENTED + LOCALLY VERIFIED |
| 12 | **Runbook + deployment documentation** | `docs/19_PRODUCTION_INCIDENT_RUNBOOK.md`, `docs/17_DEPLOYMENT.md` §5, `docs/P0_DATABASE_AUTHORITY.md` | IMPLEMENTED |

Nothing was changed to hide a 503, to relax canonical enforcement, to substitute
CSV data, to invent or zero any published figure, or to weaken a test.

## 7. Migration and loader plan (prepared, not executed)

```text
1. Pin the release to the commit the deployed image was built from
   (Render Deploys page → SHA; or plan to deploy the fixed commit and sync to it).
2. Build the processed dataset from that commit in a clean checkout or container
   (`python scripts/data/run_all.py`; `check_idempotent_build.py` proves stability).
3. Take a Neon branch/backup of the current data; record the restore point.
4. python scripts/data/canonical_bootstrap.py --dry-run
   → reports pending migrations, expected version, loaded version. Writes nothing.
5. python scripts/data/canonical_bootstrap.py          [OWNER APPROVAL REQUIRED]
   → alembic upgrade head → compare → load only if the version differs → verify
   → on success: "verified: crop_productivity holds 6,156 rows across 14 periods
     (2022A..2026B)".
6. Verify: readiness 200 with version_matches_manifest=true, blocking=[],
   then scripts/verify_production.py must print "release gate: PASSED".
7. Rollback: re-run the bootstrap from the correct commit (upsert-only, never
   destructive); if the dataset itself must be reverted, restore the Neon branch.
```

Because change #1 alters the built dataset's `crop` labels for the post-harvest
multi-period table (raw → canonical, matching the single-release table), the
content version of a build *after* the fix is `0.2.0-646a72d53cd349df`. Two
coherent release paths exist and must not be mixed:

* **Path A (no new deploy):** sync from the deployed commit `9e2e5aa` →
  database becomes `0.2.0-84a97c5a37f07996` → the running image is satisfied.
* **Path B (recommended):** deploy the fixed commit, then sync from *that* build
  → both sides become `0.2.0-646a72d53cd349df`, and the reproducibility trap is
  gone for good.

## 8. Production write approval status

**BLOCKED — not granted, and not attempted.** Preconditions missing here:

* Neon `DATABASE_URL` for production (server-side secret) — absent.
* Render dashboard/API access — absent (no API key, no CLI).
* Explicit owner authorisation for a production migration/load — not given.

Consequently: no migration was applied, no canonical row was written, no Render
or Vercel configuration was changed, and no deploy was triggered.

Non-destructive preparation that *was* completed: the plan above, the dry-run
path (now genuinely read-only), the idempotency proof, the smoke gate, the
approval-gated release workflow, and the runbook.

## 9. Exact commits

* Repository `main` at audit time: `9e2e5aa225c6e5ebfb66ae9d9524372763485038`
  (identical to `origin/main`). The audit's changes are **15 modified + 12 new**
  paths; the shortstat for modifications to tracked files alone was `+643/-44`,
  while the committed change set (§9, third bullet) is `+2,321/-44` because it
  counts the newly added files as well.
* Deployed image: built `2026-10-12T22:31:19Z`; commit content equals
  `eea7e3f..9e2e5aa` (web/docs-only difference), i.e. the current pipeline.
* This audit's changes are committed **locally** on `main` as
  **`2a0f4a8`** — 27 paths, +2,321/-44 — and **not pushed**, because the mandate
  forbids pushing or deploying without authorisation and the owner asked for a
  local commit only. **CI VERIFIED is therefore PENDING** (it needs the push).

## 10. Tests executed

| Suite | Command | Result |
| --- | --- | --- |
| Python: API + data pipeline + ML | `pytest services/api/tests scripts/tests ml` | **PASS** (exit 0; canonical integration skips without `CANONICAL_TEST_DATABASE_URL`, as designed) |
| Python lint | `ruff check services/api/app services/api/tests scripts/data scripts/tests scripts/verify_production.py` | **PASS** ("All checks passed") |
| Web lint | `pnpm --filter cropmatics-web lint` | **PASS** |
| Web typecheck | `pnpm --filter cropmatics-web typecheck` | **PASS** |
| Web unit tests | `pnpm --filter cropmatics-web test` | **PASS** — 308 tests / 23 files (13 new) |
| Web build | `pnpm --filter cropmatics-web build` | **PASS** |
| Mobile lint / typecheck / tests | `npm run lint` · `npm run typecheck` · `npm run test` | **PASS** — 335 tests / 24 files (8 new) |
| Pipeline idempotency | `python scripts/data/check_idempotent_build.py` | **PASS** — before = after = `0.2.0-646a72d53cd349df` |
| Production smoke | `python scripts/verify_production.py` | **8/12 required endpoints** — release gate **FAILED** (the incident) |

New regression coverage: readiness 503 + `canonical_dataset_out_of_sync` blocking
with expected/loaded versions, **pending migrations named as
`migrations_not_applied`**, liveness staying up while readiness fails, recovery
to `ready` when the version matches, `/data/*` mismatch reporting, pipeline
determinism (derived alias map, leftover-state independence, canonical artefact
labels), `--dry-run` writing nothing (migrations included), the real-run
migrate→load order, web 503 message/retry policy, mobile 503 message/retry policy.

## 11. CI results

* Last green run on GitHub: `9e2e5aa` (per the mandate; not re-verified from this
  environment).
* **This audit's changes (`2a0f4a8`): NOT RUN IN CI** — committed locally but
  not pushed, so no workflow has seen them. Status **PENDING**, expected to pass:
  the same commands CI runs were executed locally and passed (§10).

## 12. Deployment identifiers

| Item | Value |
| --- | --- |
| Render service | `cropsmatics-api` (`srv-dasdtb3bc2fs73erqvhg`), region per blueprint `frankfurt`/Free |
| Live deploy commit | `9e2e5aa…` (as reported); image build `2026-10-12T22:31:19Z` |
| Vercel project | `cropsmatics-web` → `https://cropsmatics-web.vercel.app` (7/7 pages return HTTP 200) |
| Vercel build SHA | **PENDING** (dashboard not accessible here) |
| Neon dataset loaded | `0.2.0-535efe5d2bd75b51` (2026-09-28) vs expected `0.2.0-84a97c5a37f07996` |

## 13. API smoke-test results

Full transcript: `docs/audits/artifacts/PRODUCTION_SMOKE_2026-10-13.json`.

```text
PASS  liveness (root)       HTTP 200
PASS  liveness (versioned)  HTTP 200
fail  readiness             HTTP 503  not_ready (version_matches_manifest: false)
PASS  dataset version       HTTP 200  version=0.2.0-535efe5d2bd75b51
PASS  dataset coverage      HTTP 200  (loaded, stale: 8 periods)
PASS  period catalogue      HTTP 200  periods=14
PASS  crops                 HTTP 200
fail  dashboard overview    HTTP 503  DATASET_OUT_OF_SYNC
fail  input adoption        HTTP 503  DATASET_OUT_OF_SYNC
fail  canonical trend       HTTP 503  DATASET_OUT_OF_SYNC
PASS  practice indicators   HTTP 200
PASS  post-harvest history  HTTP 200
8/12 required endpoints answered — release gate: FAILED
```

## 14. Web browser findings

* All seven mandated routes answer HTTP 200 on the deployed site:
  `/dashboard`, `/crops`, `/productivity`, `/yield-intelligence`,
  `/interventions`, `/post-harvest`, `/storage` — *PRODUCTION VERIFIED* (HTTP
  level).
* Interactive/browser-level verification of chart stability and error states is
  **PENDING/BLOCKED**: it requires a browser session against the deployed site
  (Playwright is configured in `apps/web`, but running it against production
  would immediately exercise the incident state rather than the fixed behaviour,
  which cannot be deployed without authorisation).
* The client-side behaviour that *is* verified is unit-tested: a typed 503 renders
  an explanation with a manual retry, never a fabricated `0`; retries are bounded
  to one with capped backoff; the developer hint is suppressed in production; a
  loaded chart is not torn down by a background refetch.
* CORS, Vercel env vars and the deployed API base URL: **PENDING** manual
  confirmation (`docs/17_DEPLOYMENT.md` §5); no Vercel credentials were available.

## 15. Android device findings

**BLOCKED — no device attached.** `adb devices -l` lists no devices, so no
installation or workflow test was performed and none is claimed. `adb` is
installed at `/usr/local/bin/adb`, so a device attached to this machine would
have been testable. Exact procedure when a Samsung device is available:

```bash
adb devices -l                      # expect one device in "device" state
cd apps/mobile
npm ci && npx expo run:android --device   # or install the existing preview APK
```

Then walk: splash → navigation → Home → Crops → Crop detail → Analyze →
District maps → Compare → Indicators → Post-Harvest → Ask AI → language switch →
offline/reconnect → error handling. With the API in its current state the
expected (and correct) behaviour is an informative "figures withheld / service
unavailable" state with a retry, never zeroed figures — the mobile client now
produces that message from `DATASET_OUT_OF_SYNC` (unit-tested, *LOCALLY
VERIFIED*).

## 16. Remaining blockers

| # | Blocker | Owner action required |
| --- | --- | --- |
| 1 | Production canonical sync not authorised | Grant explicit approval, then run the release step (`docs/19_PRODUCTION_INCIDENT_RUNBOOK.md` §4) |
| 2 | No Neon `DATABASE_URL` available here | Provide it as a secret (Render dashboard and/or `PRODUCTION_DATABASE_URL` in GitHub) |
| 3 | Render dashboard access | Confirm the live service's plan, health-check path and env vars against `docs/17_DEPLOYMENT.md` §5; the Free plan cannot run a pre-deploy step |
| 4 | Vercel project settings | Confirm production branch, monorepo root, build command, env vars, API base URL, CORS |
| 5 | Changes uncommitted/unpushed | Authorise commit + push so CI verifies them and a fixed image can deploy |
| 6 | Android device not attached | Attach the Samsung device for device verification |
| 7 | Render Free plan and the release step | Either upgrade to a paid instance type (pre-deploy supported) or keep using the approval-gated `Release database` workflow |

## 17. Final submission verdict

**NOT SUBMISSION-READY — critical analytical endpoints are still unavailable on
production.** As of 2026-10-13 the deployed API returns
`503 DATASET_OUT_OF_SYNC` for the dashboard overview, input adoption, canonical
trend, productivity and map analytics. The service fails its own deep-readiness
probe. That is the correct, intentional behaviour for a stale canonical database,
and it must not be relaxed.

What is finished: the root cause is identified beyond doubt and reproduced
locally; the three contributing conditions are documented; the latent
reproducibility defect that would have defeated a naive repair is fixed and
proven idempotent; the reporting, error surfaces, retry policies and regression
tests are in place; the release plan, rollback procedure, approval-gated release
workflow, runbook and smoke gate are ready; the read-only production evidence is
captured in `docs/audits/artifacts/`.

The single remaining action is a **production write that requires the owner's
approval and the Neon `DATABASE_URL`**. Once granted, the expected outcome is:
`readiness 200`, `version_matches_manifest: true`, `blocking: []`, and
`python scripts/verify_production.py` printing **"release gate: PASSED"** — at
which point this verdict can be revisited against §13 of the mandate's acceptance
gates.
