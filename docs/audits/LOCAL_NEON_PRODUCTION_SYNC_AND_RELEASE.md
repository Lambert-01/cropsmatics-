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

## 2. Production database identity (no secrets)

| Property | Value |
|---|---|
| Hosting | Neon PostgreSQL + PostGIS |
| Consumed by | Render service `cropmatics-api` (Frankfurt), `DATABASE_URL` (dashboard-set, `sync: false`) |
| Local availability this session | **`PRODUCTION_DATABASE_URL` was not set in this environment**; `.env` points at `localhost:5432/cropmatics` (dev). Direct inspection therefore pending owner-provided secure URL. |
| Known identity from live API probes | loaded version `0.2.0-535efe5d2bd75b51`, built 2026-09-28 (git `c22f744`), loaded 2026-10-02 |
| Test database (never production) | `cropmatics_ci_canonical_test` — refused by the release workflow and the rehearsal tool |

**Assumption (flagged):** the Render dashboard's `DATABASE_URL` points at the Neon production branch. This must be confirmed with `make diagnose-db` once `PRODUCTION_DATABASE_URL` is exported.

## 3–5. Expected vs loaded (summary)

Expected identity is **computed, not hardcoded**: `content_version(manifest)` over `pipeline_version` + every output/source/SAS-input SHA-256 + row counts (`services/api/app/data/versioning.py:29-56`). `build_timestamp` and `git_sha` are deliberately excluded, so the identity is content-addressed.

- Expected: `0.2.0-646a72d53cd349df`, 6,156 productivity rows, 14 periods (2022A–2026B).
- Loaded (production): `0.2.0-535efe5d2bd75b51`, 3,738 rows, 8 periods.

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
- Production reports `migrations_applied: true` (readiness payload). Schema is current; **only the data load is outstanding**.
- The dry run reports the exact current-vs-head state when pointed at production.

## 8. Dry-run output (enhanced this session)

`canonical_bootstrap.py --dry-run` now additionally reports:

- the credential-free target identity (host:port/database),
- the expected panel size (rows × periods),
- the loaded panel size and missing periods,
- an explicit ordered plan ("apply alembic migrations -> upsert canonical data …").

Verified against an unreachable target it degrades gracefully (exit 1, no traceback). Full run against production pending `PRODUCTION_DATABASE_URL`.

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
| `confirm_target` was printed but **never validated**; any text satisfied `required: true` | New step parses host + database from `PRODUCTION_DATABASE_URL` (via `env:`, never shell-interpolated) and **hard-fails** unless `confirm_target` equals the host exactly; refuses `cropmatics_ci_canonical_test` |
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
| `scripts/tests/test_production_diagnostics.py` | **New** — 9 tests pinning credential hygiene, URL precedence, production-refusal, and plan output. |
| `.github/workflows/release-database.yml` | Hardened per §11. |
| `render.yaml` | `plan: starter` → `plan: free` (matches the live service) with an explicit note that `preDeployCommand` is inert on Free and the manual workflow is the active release path. |
| `Makefile` | Added `diagnose-db` and `rehearse-release` targets. |

## 13. Test results (local, this session)

| Suite | Result |
|---|---|
| `ruff check` (API, scripts, ML) | **PASS** (0 findings) |
| `pytest services/api/tests` | **PASS** — 101 tests |
| `pytest scripts/tests` | **PASS** — 114 tests (1 design-skip: canonical integration without `CANONICAL_TEST_DATABASE_URL`) |
| `pytest ml` | **PASS** — 39 tests |
| Web lint / typecheck | **PASS** |
| Web unit tests | **PASS** — 308 tests (23 files) |
| Web production build | **PASS** |
| Mobile lint / typecheck | **PASS** |
| Mobile unit tests | **PASS** — 335 tests (24 files) |

No test coverage was removed.

## 14–16. Commit, push, CI

- **Local commit:** `2cff010580ddc944f3440ff09dc55910db6ca474` — `fix(release): verify the confirmed production target and harden the canonical release path` (8 files, +1018/−11). Pre-commit hooks (trailing whitespace, YAML/JSON checks, `detect-private-key`, ruff, gitleaks) all passed.
- **Push:** normal push, `ae29d28..2cff010` to `origin/main`. No force-push. Remote had no new commits to reconcile.
- **GitHub Actions:** `ci.yml` re-runs web/mobile/api/ml/data-pipeline on this push. Status must be read in the GitHub UI (the repository is private and no `gh` CLI/token was available in this environment to query the API). Expected: all five jobs green, matching the local results in §13.
- **`release-database.yml`:** unchanged trigger posture — manual `workflow_dispatch` only; the push does **not** run it and does **not** write to the database.

## 17. Render deployment SHA

Pending: Render rebuilds on push to `main` (autoDeploy). The deployed SHA must be confirmed in the Render dashboard after the push. The image builds the canonical dataset at build time (`Dockerfile: RUN python scripts/data/run_all.py`), so the deployed image's expected version will be `0.2.0-646a72d53cd349df`.

## 18. Production sync approval status

**NOT APPROVED — no production write attempted.** The write plan is presented separately (Phase G) and awaits explicit owner approval. Pushing code does **not** authorise a database write.

## 19. Production smoke-test results (before this release)

```
8/12 required endpoints answered
release gate: FAILED - readiness, dashboard overview, input adoption, canonical trend
```

Loaded `0.2.0-535efe5d2bd75b51`; expected `0.2.0-646a72d53cd349df`. Expected after an approved sync: **12/12, release gate: PASSED**, `version_matches_manifest: true`, `blocking: []`.

## 20. Remaining submission blockers

| # | Blocker | Owner action |
|---|---|---|
| 1 | Production database out of sync | Approve the write plan (Phase G), then run the release workflow with `APPLY` |
| 2 | `PRODUCTION_DATABASE_URL` not available locally | `export PRODUCTION_DATABASE_URL=…` (from the Render dashboard) so `make diagnose-db` and the dry run can inspect production read-only |
| 3 | Neon restore point not yet taken | Create a branch/backup in the Neon console before `APPLY` |
| 4 | Isolated rehearsal not yet run | Create an isolated Neon branch; `make rehearse-release REHEARSAL_URL=…` |
| 5 | GitHub `production-database` environment reviewers unconfirmed | Configure required reviewers in repo Settings → Environments |
| 6 | Android physical-device test | Samsung device not attached — **pending**, not claimed complete |
| 7 | Web production pages after sync | Re-verify `/dashboard`, `/crops`, `/productivity`, `/yield-intelligence`, `/interventions`, `/post-harvest`, `/storage` once readiness passes |

---

### Verified facts vs assumptions

**Verified locally:** pipeline determinism and idempotency; expected version `0.2.0-646a72d53cd349df` and 6,156/14 panel; all test suites green; workflow/tooling safety properties (unit-tested); live production 503 state and loaded version/counts (read-only HTTP probes).

**Assumed / pending confirmation:** the exact Neon host/database Render points at (needs `PRODUCTION_DATABASE_URL`); the Render plan and health-check path as configured in the dashboard (repo `render.yaml` is a template, not live config); GitHub environment reviewers; Vercel production branch settings.
