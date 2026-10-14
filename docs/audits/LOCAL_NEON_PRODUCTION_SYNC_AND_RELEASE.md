# Local Neon Production Sync and Release — Audit

**Date:** 2026-10-14
**Engineer:** automated local repair session (MacBook repository)
**Scope:** repair the production `503 DATASET_OUT_OF_SYNC` failure path, harden the release workflow, prove pipeline reproducibility, and prepare an approval-gated production write. **No production database write was performed.**

---

## 1. Original 503 root cause (verified)

The live API at `https://cropsmatics-api.onrender.com/api/v1` returned `503 DATASET_OUT_OF_SYNC` on every canonical-backed analytical route because the Neon production database serves an **older content-addressed dataset** than the image the API was built from.

The API runs in `CANONICAL_DATA_MODE=required`. In that mode the read path compares the `dataset_version` row in PostgreSQL against `content_version(data/processed/manifest.json)` **before any read** (`dataset_repository.py:239`, `meta_service.py:276-279`). A mismatch raises a structured 503 rather than serving stale figures — the correct, intentional behaviour.

Verified via the live readiness endpoint:

| Metric | Production database (loaded) | Expected (deployed image / repo manifest) |
|---|---|---|
| Dataset version | `0.2.0-535efe5d2bd75b51` | `0.2.0-646a72d53cd349df` |
| Productivity rows | 3,738 | 6,156 |
| Published periods | 8 (2024A–2026B) | 14 (2022A–2026B) |
| Agricultural observations | 1,477 | (not the gating metric) |

Blocking reasons reported by production: `canonical_dataset_out_of_sync`, `dataset_version_mismatch`. Contributing condition (from the earlier incident audit): the Render **Free plan does not execute `preDeployCommand`**, so the canonical bootstrap declared in `render.yaml` never ran on deploy; the database was never synchronised when the image advanced.

### 1b. Second incident (2026-10-14): deploy crash on `psycopg2` — FIXED

When `DATABASE_URL` in the Render dashboard was switched to the Neon connection string, the API began **crash-looping** (`ModuleNotFoundError: No module named 'psycopg2'` at `create_engine`) — a total outage (HTTP 000), worse than the 503s.

**Root cause (verified):** Neon/Render dashboards copy connection strings with the bare `postgresql://` scheme. SQLAlchemy maps that scheme to the **psycopg2** driver; the service ships only **psycopg 3** (`psycopg[binary]==3.2.3`), so the engine failed at import and uvicorn never bound a port.

**Fix:** `Settings.database_url` now normalises `postgres://`, `postgresql://` and `postgresql+psycopg2://` to `postgresql+psycopg://` (`services/api/app/core/config.py` validator), and every script that accepts a raw `--url` (`load_postgres`, `canonical_bootstrap`, `production_diagnostics`, `rehearse_release`) applies the same rewrite via `scripts/data/common.normalize_database_url`. Regression test: `test_canonical_mode.py::test_a_dashboard_pasted_postgresql_url_is_coerced_to_psycopg3`.

## 2. Production database identity (confirmed 2026-10-14)

| Property | Value |
|---|---|
| Hosting | Neon PostgreSQL 18.6 (aarch64) + PostGIS (installed) |
| Host | `ep-delicate-heart-b4z4yu6e-pooler.c-6.us-east-2.aws.neon.tech` |
| Database | `cropmatics_ci_canonical_test` — **this name IS production** (confirmed from the Render dashboard's `DATABASE_URL`; earlier audits' warning about the name was based on a separate CI database of the same name, not this instance) |
| Role | `neondb_owner`, TLS required |
| Consumed by | Render service `cropmatics-api` (Frankfurt), `DATABASE_URL` (dashboard-set) |
| Alembic | at head `d4b7c1e85a23` — no migration pending |

**Loaded state (read-only inspection, 2026-10-14):** exactly one `dataset_version` row: `0.2.0-f6005a7688f2b674`, git `1005ddca`, loaded 2026-10-12T09:03Z — **6,156 productivity rows across all 14 periods (2022A–2026B)**, 1,477 observations, 0 synthetic rows.

`1005ddca` is **before** the pipeline idempotency fix (`2a0f4a8`), so that build is not reproducible; its hash `f6005a…` cannot be regenerated and does not match the reproducible `646a72…` the deployed image expects. The row/period coverage is already complete — the remaining gap is content-hash reconciliation via upsert.

## 3–5. Expected vs loaded (summary)

Expected identity is **computed, not hardcoded**: `content_version(manifest)` over `pipeline_version` + every output/source/SAS-input SHA-256 + row counts (`services/api/app/data/versioning.py:29-56`). `build_timestamp` and `git_sha` are deliberately excluded, so the identity is content-addressed.

- Expected (reproducible build from current `main`): `0.2.0-646a72d53cd349df`, 6,156 productivity rows, 14 periods (2022A–2026B).
- Loaded (production, confirmed by direct SQL): `0.2.0-f6005a7688f2b674`, 6,156 rows, 14 periods — complete coverage, but built from pre-fix commit `1005ddca` (non-reproducible), so the hash differs and required-mode readiness correctly reports out-of-sync.
- Historic state on the previous `DATABASE_URL` target (probed earlier on 2026-10-14 before the dashboard switch): `0.2.0-535efe5d2bd75b51`, 3,738 rows, 8 periods.

## 6. Pipeline determinism (verified locally)

| Check | Result |
|---|---|
| `python scripts/data/run_all.py` (full 24-step build from current `main`) | **PASS** — completes, produces `0.2.0-646a72d53cd349df` |
| `python scripts/data/check_idempotent_build.py` | **PASS** — version before == version after rebuild |
| Panel contents | 6,156 rows, 14 distinct `period_code` values, matches manifest `row_counts.crop_productivity` |
| Working tree after rebuild | clean (`data/processed` gitignored, no drift) |

The deployed manifest's expected version therefore matches what this checkout builds. Any load derived from commit `ae29d28` (or its tree) will produce the identity the API expects.

## 7. Migration status

- Alembic head: `d4b7c1e85a23` (5-revision linear chain under `services/api/alembic/versions/`).
- **Production confirmed at head** by direct read-only SQL (`current=d4b7c1e85a23 head=d4b7c1e85a23`); the dry run reports "already at head". **No schema migration is needed — only the data reconciliation.**

## 8. Dry-run output (enhanced this session)

`canonical_bootstrap.py --dry-run` now additionally reports:

- the credential-free target identity (host:port/database),
- the expected panel size (rows × periods),
- the loaded panel size and missing periods,
- an explicit ordered plan ("apply alembic migrations -> upsert canonical data …").

Verified against an unreachable target it degrades gracefully (exit 1, no traceback). Run against production (2026-10-14, read-only):

```
expected dataset version: 0.2.0-646a72d53cd349df
expected panel: 6156 rows across 14 periods
target: ep-delicate-heart-b4z4yu6e-pooler.c-6.us-east-2.aws.neon.tech/cropmatics_ci_canonical_test
dry run: migrations NOT applied (current d4b7c1e85a23, head d4b7c1e85a23) - already at head
loaded dataset version:   0.2.0-f6005a7688f2b674
dry run: loaded panel 6156 rows across 14 periods
dry run: a canonical load would run here; nothing was written
dry run plan: upsert canonical data (6156 productivity rows, 14 periods) to reach 0.2.0-646a72d53cd349df
```

Loader dry-run (`load_postgres --dry-run`, read-only, rolled back) — the exact row-level plan:

| table | accepted | rejected | inserted | updated | unchanged |
|---|---|---|---|---|---|
| period | 14 | 0 | 0 | 0 | 14 |
| unit | 9 | 0 | 0 | 0 | 9 |
| indicator | 59 | 0 | 0 | 0 | 59 |
| data_source | 16 | 0 | 0 | 0 | 16 |
| dataset_version | 1 | 0 | **1** | 0 | 0 |
| source_table | 62 | 0 | 0 | 0 | 62 |
| crop_productivity | 6156 | 0 | 0 | **6156** | 0 |
| agricultural_observation | 1477 | 0 | 0 | **1477** | 0 |

Every productivity/observation row shows as *updated* because the pre-fix build (`1005ddca`) wrote different provenance metadata on every row; the upsert converges them to the reproducible build. No deletes, no truncates, no rejected rows.

## 9. Backup status

**Pending owner action.** Before any production write the owner must create a Neon restore point (branch or manual backup) on the production branch and record its timestamp. The release workflow now refuses `APPLY` unless the operator attests `BACKUP-AND-REHEARSAL-DONE`.

## 10. Isolated Neon rehearsal (tooling ready, execution pending)

New tool: `scripts/data/rehearse_release.py` (`make rehearse-release REHEARSAL_URL=…`).

1. **Refuses** any target whose host **and** database name match `PRODUCTION_DATABASE_URL`/`DATABASE_URL` — a mistyped URL cannot become a production write.
2. Runs the full bootstrap (migrate → load → verify).
3. Runs the bootstrap **a second time** (repeat-load idempotency proof).
4. Checks referential integrity: orphaned `period_id`, orphaned `source_id`, negative areas/production, synthetic-row count.
5. Finishes with the read-only diagnostics verdict.

**Execution is pending** an isolated Neon branch URL (owner creates the branch in the Neon console, then exports its connection string as `REHEARSAL_URL`).

## 11. Workflow fixes (`.github/workflows/release-database.yml`)

| Defect | Fix |
|---|---|
| `confirm_target` was printed but **never validated**; any text satisfied `required: true` | New step parses the host from `PRODUCTION_DATABASE_URL` (via `env:`, never shell-interpolated) and **hard-fails** unless `confirm_target` equals the host exactly. The database name is reported for the record but not name-gated: production is itself named `cropmatics_ci_canonical_test`, so identity is gated on the exact host |
| `${{ inputs.confirm_target }}` interpolated directly into `run:` (command injection in a job holding the secret) | Input reaches Python through `env:` only |
| Arbitrary `commit` could point at any branch | Checkout uses `fetch-depth: 0`; a new step requires the commit to be `origin/main` or an ancestor of it |
| `APPLY` needed nothing beyond typing the word | `APPLY` additionally requires `prerequisites_confirmed=BACKUP-AND-REHEARSAL-DONE` |
| Smoke verification ran (and failed the job) even on dry runs, conflating "plan OK" with "release blocked" | After `APPLY` the smoke is the release gate; after a plan it runs with `continue-on-error` as an informational report |
| No job timeout (default 360 min) | `timeout-minutes: 45` |
| Release identity not reported | New step reports checked-out SHA, mode, expected dataset version and row count (no secrets) |

`APPLY` remains non-default; `workflow_dispatch` remains the only trigger; `environment: production-database` remains the human-approval gate (owner must configure required reviewers in GitHub settings — not provable from the repo).

## 12. Code changes (this session)

| File | Change |
|---|---|
| `scripts/data/production_diagnostics.py` | **New** — read-only diagnostics: safe target identity, PostGIS, migrations, tables, version/rows/periods vs manifest, synthetic-row check, source/observation counts. Exit 0 in-sync / 1 out-of-sync / 2 unreachable. Reads `--url` → `PRODUCTION_DATABASE_URL` → `DATABASE_URL`. Never prints credentials. |
| `scripts/data/rehearse_release.py` | **New** — isolated-branch rehearsal (see §10). |
| `scripts/data/canonical_bootstrap.py` | Dry run now reports target identity, expected/loaded panel sizes, missing periods, and an explicit ordered plan. `_target_identity` and `_loaded_summary` are read-only. |
| `services/api/app/core/config.py` | **`DATABASE_URL` scheme normalisation** (§1b) — dashboard-pasted `postgresql://` is coerced to `postgresql+psycopg://`; fixes the deploy crash-loop. |
| `scripts/data/common.py` | `normalize_database_url()` shared by every script that accepts a raw `--url`. |
| `scripts/data/load_postgres.py` | Applies `normalize_database_url` to its `--url`/settings URL. |
| `scripts/tests/test_production_diagnostics.py` | **New** — tests pinning credential hygiene, URL precedence, scheme normalisation, production-refusal, and plan output. |
| `services/api/tests/test_canonical_mode.py` | Added the dashboard-URL coercion regression test. |
| `.github/workflows/release-database.yml` | Hardened per §11. |
| `render.yaml` | `plan: starter` → `plan: free` (matches the live service) with an explicit note that `preDeployCommand` is inert on Free and the manual workflow is the active release path. |
| `Makefile` | Added `diagnose-db` and `rehearse-release` targets. |

## 13. Test results (local, this session)

| Suite | Result |
|---|---|
| `ruff check` (API, scripts, ML) | **PASS** (0 findings) |
| `pytest services/api/tests` | **PASS** — 102 tests |
| `pytest scripts/tests` | **PASS** — 115+ tests (1 design-skip: canonical integration without `CANONICAL_TEST_DATABASE_URL`) |
| `pytest ml` | **PASS** — 39 tests |
| Web lint / typecheck | **PASS** |
| Web unit tests | **PASS** — 308 tests (23 files) |
| Web production build | **PASS** |
| Mobile lint / typecheck | **PASS** |
| Mobile unit tests | **PASS** — 335 tests (24 files) |
| Read-only production diagnostics | **PASS** (correctly reports OUT OF SYNC, exit 1) |
| Read-only production dry-run + loader plan | **PASS** (exit 0, nothing written) |

No test coverage was removed.

## 14–16. Commit, push, CI

- **Local commit:** `2cff010580ddc944f3440ff09dc55910db6ca474` — `fix(release): verify the confirmed production target and harden the canonical release path` (8 files, +1018/−11). Pre-commit hooks (trailing whitespace, YAML/JSON checks, `detect-private-key`, ruff, gitleaks) all passed.
- **Push:** normal push, `ae29d28..2cff010` to `origin/main`. No force-push. Remote had no new commits to reconcile.
- **GitHub Actions:** `ci.yml` re-runs web/mobile/api/ml/data-pipeline on this push. Status must be read in the GitHub UI (the repository is private and no `gh` CLI/token was available in this environment to query the API). Expected: all five jobs green, matching the local results in §13.
- **`release-database.yml`:** unchanged trigger posture — manual `workflow_dispatch` only; the push does **not** run it and does **not** write to the database.

## 17. Render deployment SHA

- `e2f98fa` deployed 2026-10-14 — **crash-looped** on `psycopg2` (§1b) because the new dashboard `DATABASE_URL` uses the bare `postgresql://` scheme. API fully down (HTTP 000).
- The fix commit (normalisation, below) restores startup. The image builds the canonical dataset at build time (`Dockerfile: RUN python scripts/data/run_all.py`), so the fixed image's expected version is `0.2.0-646a72d53cd349df`.

## 18. Production sync approval status

**NOT APPROVED — no production write attempted.** The exact plan (§8: upsert 6,156 productivity + 1,477 observation rows, insert 1 `dataset_version` row, no deletes) is presented for approval. Pushing the crash fix does **not** authorise a database write.

## 19. Production smoke-test results

- **Before this session (old database):** `8/12 required endpoints answered; release gate: FAILED` — loaded `0.2.0-535efe5d2bd75b51` (3,738 rows / 8 periods) vs expected `0.2.0-646a72d53cd349df`.
- **After the DATABASE_URL switch, before the crash fix:** API unreachable (HTTP 000) — crash-loop on `psycopg2`.
- **Expected after the crash fix deploys (no DB write yet):** API up; liveness 200; readiness 503 `not_ready` with `version_matches_manifest: false` (loaded `f6005a…` ≠ expected `646a72…`) — the honest out-of-sync state.
- **Expected after an approved sync:** **12/12, release gate: PASSED**, `version_matches_manifest: true`, `blocking: []`.

## 20. Remaining submission blockers

| # | Blocker | Owner action |
|---|---|---|
| 1 | Production content-hash out of sync (`f6005a…` → `646a72…`) | Approve the upsert plan (§8/§18); then release-workflow `APPLY` or an approved local load |
| 2 | Neon restore point not yet taken | Create a branch/backup in the Neon console before the write |
| 3 | Isolated rehearsal not yet run | Create an isolated Neon branch; `make rehearse-release REHEARSAL_URL=…` (host+database must differ from production — same host, different database name, is fine) |
| 4 | `PRODUCTION_DATABASE_URL` GitHub secret unconfirmed | Add the Neon connection string as the `PRODUCTION_DATABASE_URL` secret (Settings → Secrets → Actions) so the release workflow can verify the target |
| 5 | GitHub `production-database` environment reviewers unconfirmed | Configure required reviewers in repo Settings → Environments |
| 6 | **Credentials exposed in chat** (2026-10-14) | Rotate the Neon role password and the Render `JWT_SECRET`; update both dashboards |
| 7 | Android physical-device test | Samsung device not attached — **pending**, not claimed complete |
| 8 | Web production pages after sync | Re-verify `/dashboard`, `/crops`, `/productivity`, `/yield-intelligence`, `/interventions`, `/post-harvest`, `/storage` once readiness passes |

---

### Verified facts vs assumptions

**Verified:** pipeline determinism and idempotency at `0.2.0-646a72d53cd349df` (6,156 rows / 14 periods); all test suites green; production database identity, schema, migration state, loaded version/rows/periods via direct read-only SQL; the loader's exact upsert plan (rolled back); the `psycopg2` crash cause and fix; workflow/tooling safety properties (unit-tested).

**Assumed / pending confirmation:** GitHub environment reviewers; the Render plan/health-check path as configured in the dashboard; Vercel production branch settings; the owner's approval of the write plan.
