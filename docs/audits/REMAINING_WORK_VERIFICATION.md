# Remaining-work verification ledger — 2026-10-12

Branch: `milestone-1-2-readiness-reconciliation` (local HEAD `5121766` at start,
PR #3 head). This ledger is the running record the handoff asked for. Every
claim below names the command that produced it.

Legend: **Verified** (ran and passed) · **Pending** (needs device/deploy/approval)
· **Blocked** (external dependency) · **Not started**

---

## Baseline established before any edit

`git fetch origin --prune` was a no-op: the three remote heads are byte-identical
to the handoff's hashes, and `refs/pull/3/head` is `5121766`, i.e. PR #3's head is
exactly this branch tip. Nothing had advanced and no new work was merged, so the
milestone branch is the correct continuation baseline.

`gh` is not installed and the GitHub PR page is not publicly readable (the repo is
not public), so PR #3's *state* (open/merged) could not be read directly. What is
verifiable from the remote: `refs/pull/3/head` exists and equals HEAD, and
`refs/pull/3/merge` exists, which is what an open PR advertises. Recorded as
**partially verified** rather than claiming the merge state.

In-repo evidence that the previous milestones are real (not just documented):
`docs/audits/MILESTONE_1-2_2026-10-11.md` and `docs/audits/BASELINE_2026-10-11.md`
exist, `08bf913` untracks the 8 workbooks, and `data/*.xlsx` is gitignored.

---

## Milestone A — baseline and existing PR

| Item | Status | Evidence |
|---|---|---|
| Remote refs match the handoff | Verified | `git ls-remote origin` → `456667f`, `5121766`, `f7fdc4e` |
| PR #3 head is this branch | Verified | `refs/pull/3/head` = `5121766` |
| PR #3 open/merged state | Blocked | no `gh`; repo not publicly readable |
| Worktree clean before edits | Verified | `git status --short` empty |

---

## Milestone B — database / production readiness (read-only)

All production activity was read-only. No write, no migration, no load.

| Item | Status | Evidence |
|---|---|---|
| Neon reachable read-only | Verified | direct `SELECT` via the project's own settings loader |
| Deployed dataset version | Verified | `dataset_version` = `0.2.0-535efe5d2bd75b51`, git `c22f744`, loaded `2026-10-02` |
| Deployed panel size | Verified | `crop_productivity` = **3,738** rows; `agricultural_observation` = **1,477** |
| Repo is ahead of production | Verified | `python3 -m scripts.data.load_postgres --dry-run` |
| Reconciliation plan reproduced | Verified | dry run (below), production untouched afterwards |
| Production load applied | **Blocked — awaiting approval** | not executed; see below |

Dry-run plan (read-only; identical in shape to the 2026-10-11 record):

| table | source | inserted | updated | unchanged |
|---|---:|---:|---:|---:|
| period | 14 | 6 | 0 | 8 |
| crop_productivity | 6,156 | 2,418 | 3,738 | 0 |
| agricultural_observation | 1,495 | 0 | 1,477 | 0 |
| source_table | 62 | 24 | 0 | 38 |
| dataset_version | 1 | 1 | 0 | 0 |

Repo dataset version is now `0.2.0-6c2a6cd910d4596f`. **It changed during this
work** (it was `0.2.0-de5f544f78983671` on 2026-10-11) because two new processed
outputs enter the manifest hashed by the version. This is a real deployment
implication: an approved load now publishes a different dataset version than the
one the 2026-10-11 record anticipated, and the readiness endpoint will continue to
report `dataset_version_mismatch` (correctly) until the load runs.

---

## Milestone C — SAS indicator exposure

The audit's ordered next step #2 was to materialize the practice / irrigation /
water-source / erosion / post-harvest domains so 78 mapped sheets stop being
`mapped_not_exposed`. That is what landed.

### What was added

| File | Rows | Periods | Content |
|---|---:|---|---|
| `data/processed/agricultural_practice_observation.csv` | 9,468 | 2024A–2026B (8) | 30 districts × 28 indicators × 5 domains |
| `data/processed/crop_postharvest_use_multi_period.csv` | 1,573 | 2024A–2026B (8) | 17 crops × 11 indicators |

Both filenames were **already the declared contract** in
`inventory_sas_workbooks.DOMAIN_OUTPUTS` and `common.PROCESSED_FILES`; they were
not invented here. The builders are
`scripts/data/build_agricultural_practice_observation.py` and
`scripts/data/build_crop_postharvest_multi_period.py`, wired into
`scripts/data/run_all.py`.

### Exposure result

| Metric | Before | After |
|---|---:|---:|
| sheet instances `used` | 56 | **134** |
| `mapped_not_exposed` | 78 | **0** |
| `not_yet_mapped` | 271 | 271 |
| `duplicate` / `metadata` | 35 / 2 | 35 / 2 |

Recomputed by `python3 -m scripts.data.inventory_sas_workbooks`. The classifier is
not hand-edited: it marks a sheet `used` only when a processed dataset for its
domain exists, so this movement is caused by the files, not by a string.

### API exposure

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/analytics/practice-indicators` | multi-period district practice/irrigation/water/erosion observations, filterable by `domain`, `period_code`, `district`; reports per-indicator period availability |
| `GET /api/v1/analytics/postharvest-history` | multi-period crop post-harvest use shares with per-period share totals and an `off_total` count |

Existing endpoints are untouched: `/analytics/irrigation`, `/analytics/erosion`
and `/analytics/post-harvest` still serve the 2025B legacy tables exactly as
before, so no live answer changed.

`/api/v1/mobile/indicators` gained an additive `periods` field per indicator, and
its limitations are now derived from the coverage matrix
(`mobile_service.multi_period_indicator_range()`) instead of the literal claim
"district-level indicators exist only for 2025 Season B", which had become false.

### Data-integrity rules held

* **No imputation.** 306 published nulls in the practice table are preserved as
  null; the pipeline test asserts the count of non-null values equals the interim
  source exactly.
* **No rescaling.** 115 period × crop post-harvest share groups; the 15 that fall
  outside the ±1 point rounding tolerance are flagged, never adjusted.
* **No silent aggregation.** The five domains stay in one `domain` column and are
  never averaged together; national `Total` rows are kept but tagged
  `geography_level=NATIONAL` with an empty district and `district_code=RW`.
* **Full lineage.** Every row carries `source_id`, `source_release`,
  `source_sheet`, `source_row`, and the domain is re-derived from the reviewed
  `sas_table_map` at build time, so it cannot drift from the mapping.
* **Honest calendar.** The multi-period indicator domains cover 2024A–2026B, not
  2022A–2026B (2022/2023 are only mapped for productivity). The API reports this
  per indicator and explains a no-rows period instead of returning a silent empty
  page.

### Tests

| Suite | Command | Result |
|---|---|---|
| API | `services/api/.venv/bin/pytest services/api/tests` | **542 passed, 27 skipped** (was 519/27; +23 new) |
| Data | `services/api/.venv/bin/pytest scripts/tests` | **94 passed, 1 skipped** (was 83/1; +11 new) |
| ML | `services/api/.venv/bin/pytest ml` | **39 passed** (unmodified by this work) |
| Web | `pnpm --filter cropmatics-web test` | **182 passed** / 17 files (was 176/16) |
| Web typecheck / lint / build | `tsc --noEmit`, `next lint`, `next build` | clean, clean, **EXIT=0** |
| Mobile | `npm --prefix apps/mobile test` | **278 passed** / 30 files (was 267/29) |
| Mobile typecheck / lint | `npm run typecheck`, `npm run lint` | clean, clean |

New tests: `services/api/tests/test_indicator_history.py` (14),
`scripts/tests/test_indicator_exposure.py` (11),
`services/api/tests/test_national_board_scope.py` (9),
`apps/web/tests/priority-workspace.test.ts` (6) and
`apps/mobile/tests/period-scope.test.ts` (11). The pipeline test includes a
regression guard that fails if any mapped sheet ever loses its processed dataset
again, and both builders are asserted byte-deterministic against the committed
artefact.

---

## Milestone D — mobile Analyze

The Analyze tab previously opened on four navigation cards. It now opens on data:
context (latest published period + published range), a metric switch
(production / area / yield), the national published trend with same-season change,
and the top crops for the selected metric with per-crop change. The four routes
remain at the bottom, unchanged, so nothing became unreachable and no deep link
changed.

* Ranking logic extracted to `apps/mobile/src/utils/ranking.ts` and unit tested
  (`apps/mobile/tests/ranking.test.ts`, 6 cases). The key rule: a crop with
  nothing published for the metric is **excluded**, not ranked as zero, while a
  genuinely published `0` is kept.
* Added no new i18n keys — every string reused an existing English/Kinyarwanda
  key, so translation completeness is not degraded.
* Follows the existing chart/theme conventions; no new dependency.

### Crops catalogue — year and season filters

The catalogue had search, category and saved filters but no period control, which
the owner reported directly. A working year/season scope was added end to end:

* the server gained a published-period scope on `/analytics/national-board`
  (`period_code`, `year`, `season`), so the axis, each series, the latest published
  point and the same-season delta are all derived from the scoped axis. A filtered
  metric can therefore never sit next to an unfiltered change;
* a year resolves to the seasons that year really published, so a year selection is
  never an aggregate across incompatible observations;
* an unpublished period, an unmatched year or an invalid season is a **422 naming
  the available periods**, not a silently empty board;
* the client reconciles its scope against the returned axis
  (`src/utils/periodScope.ts`, 11 unit tests), so choosing a year clears a season it
  did not have instead of requesting a period that does not exist;
* the count row now names the active calendar, and a single pinned season states
  that there is no same-season predecessor rather than showing a blank change.

With no scope the endpoint response is unchanged, and the home screen, crop detail
and Analyze hub keep calling it unscoped.

**Not started in this pass** (see the final report): Compare UX and Maps gesture
work.

---

## Milestone E — web Interventions

**Implemented and verified (code and build level).**

The owner flagged this screen as poorly designed, and the root cause was concrete:
the workspace opened on a 300px weights panel, so a visitor met an advanced control
before a single ranked district, and two imported components were never rendered.

What changed:

* the page now **leads with the answer** — the ranked district × crop candidates and
  a one-line statement of the selection that produced them — so it is useful before
  any control is touched;
* the weighting moved behind an explicit **"Adjust weighting" disclosure**; the panel
  is fully mounted when opened, nothing was removed;
* an applied scenario is now **labelled as a scenario**, with a one-click return to
  the baseline. The warning reads "this is a reviewable what-if, not a prediction";
* `ComponentAvailabilityNotice` is now actually mounted, so which score components
  carry **no measured value for the selected period** is on the page instead of an
  unlabelled number;
* the five-line "what this page does not claim" paragraph became a `SourceNote`;
* `AIExplainPanel` is now rendered with a real assistant context (it had been
  imported and dropped).

Pure helpers `headlinePriorities` and `investigationAreas` were extracted into
`apps/web/lib/priority.ts` and unit tested (6 cases). The headline takes a prefix of
the **engine's** order — it deliberately does not re-sort, so the headline cannot
disagree with the table underneath it. Writing those tests found a real bug: a
`limit` of `0` still returned one row, which is fixed.

Verified: `tsc --noEmit` clean, `next lint` clean, `next build` **EXIT=0**, and
`vitest run` **182 passed / 17 files**.

Still open for this screen: no browser/DOM test harness exists in the repo (no
`@testing-library`/`jsdom`), so the layout and the scenario banner are verified by
typecheck, lint and build, **not by rendering**. That is stated as a limitation
rather than claiming visual confirmation.

---

## Milestone F — forecasting

**Not started.** No `ml/` file was modified. The ML suite was run to prove no
regression from the pipeline change and passes (39 passed).

---

## Milestone G — device and release verification

| Item | Status | Evidence |
|---|---|---|
| Android device smoke test | **Pending — no device access** | `adb` was not exercised; no Samsung handset is attached to this environment. Recorded as `DEVICE_VERIFICATION_PENDING`, not "passed". |
| Web typecheck / lint / tests | Verified | see command output in the final report |
| Vercel / Render production SHA | **Blocked** | requires dashboard access not available here |
| Production dataset load | **Blocked — explicit approval required** | not executed |
| Push / merge PR #3 | **Not done** | commits are local; the user asked for commits, not a push |

---

## Honest limitations of this ledger

* Test counts are from this machine and this checkout, on the current working
  tree, not from CI.
* The 15 off-total post-harvest groups are **flagged, not explained**; deciding
  whether they are source rounding or a real publication inconsistency is still
  open.
* The web redesign is verified by typecheck, lint and a production build, not by
  rendering: the repo has no DOM/component test harness, and no browser was driven
  against the page.
* `Tables_2025_Season_B_0.xlsx` (33 sheets) remains the only wholly unmapped
  workbook; the precedence question is unresolved by design.
* No screenshot or recording of the mobile Analyze screen exists, because no
  device or emulator was available to render it.

---

# Phase P1 — CI repair, disappearing charts, coverage labels, compact period scope

Session date 2026-10-12, branch `milestone-1-2-readiness-reconciliation`, baseline
commit `1005ddc`. Everything below names the command that produced it.

## P1.1 — The two red CI jobs, reproduced and fixed

The handoff listed `Data pipeline: Ruff` and `API: pytest unit/canonical
integration` as failing at `1005ddc`. Both were reproduced locally, and the API
one turned out to be **three** defects, not one.

| # | Failure | Root cause | Fix |
|---|---|---|---|
| 1 | `ruff check scripts/data` → `B905` | `build_agricultural_practice_observation.py:141` built a domain column with `zip()` and no `strict=` | added `strict=False` (the two frames are the same length by construction; the rule is about being explicit) |
| 2 | Canonical load rolled back → 17 DB tests failed | `data_source` is the FK target of `source_table.source_id`, but the 2022/2023 ingestion and the legacy district pack added `NISR_SAS_2022_ANNUAL`, `NISR_SAS_2023_ANNUAL` and `NISR_SAS_2025B_DISTRICT_CROP` to the panel **without** declaring them in `app.data.catalogue.SOURCES` | the three `SourceDef`s are declared; the loader now inserts 16 `data_source` rows and exits 0 |
| 3 | `test_periods_cover_every_published_release` asserted 8 periods | the literal set was written when the panel was 2024A–2026B; the panel is now 2022A–2026B, so the test failed on a *correct* panel | the expectation is derived from `data/processed/crop_productivity.csv` (the file the loader read), plus a multi-year guard |

Reproduction and proof:

```
.venv/bin/ruff check scripts/data scripts/tests          -> All checks passed!
.venv/bin/python -m scripts.data.load_postgres --url <test db>
    -> period 14 | data_source 16 | source_table 62 | crop_productivity 6156 | EXIT=0
    (before: ForeignKeyViolation source_table_source_id_fkey, whole run rolled back)
CANONICAL_TEST_DATABASE_URL=... pytest services/api/tests/test_canonical_integration.py
    -> 26 passed, 1 skipped   (before: 17 failed, 9 passed, 1 skipped)
```

The DB-backed suite was run for real, not skipped, against an **isolated Neon
database** (`cropmatics_ci_canonical_test`) created for the purpose and dropped
afterwards. Production was never written to; verified unchanged afterwards:
`crop_productivity = 3,738`, `dataset_version = 0.2.0-535efe5d2bd75b51`,
`loaded_at = 2026-10-02`.

Two new guards keep this class of failure in the fast suite instead of only in CI:

* `services/api/tests/test_source_catalogue_consistency.py` (4 tests) — every
  `source_id` cited by any processed artefact must be declared, ids must be
  unique, and a declared `registry_name` must resolve to a registry row.
* `services/api/tests/test_period_coverage_sources.py` (6 tests) — the period
  catalogue's coverage derivation (see P1.3).

## P1.2 — "Chart appears, then disappears"

**Root cause, traced and fixed.** Three independent defects combined:

1. `AnalyticsFilterBar` wrote the `year`/`season` pair *derived from* a selected
   period back into the URL. `lib/filters.ts` documents the opposite contract
   ("the canonical period wins in the URL; year/season are only written when no
   period code is selected"), and `filtersToApiQuery` already derives the pair, so
   the write changed **nothing the API saw** while changing the filter object.
2. Every analytical hook keyed on the raw filter object (`queryKey: ["overview",
   filters]`). Adding a derived field produced a *new key for the same release*,
   so React Query dropped the loaded response and refetched it — an
   already-rendered chart was replaced by a skeleton.
3. Charts used `if (isLoading) return <Skeleton/>`, which treats *any* in-flight
   request as "nothing to read", so the same symptom was reachable from a
   background refetch too.

Fixes:

* the filter bar no longer writes the derived pair; a stale legacy pair is cleared
  instead (one description of the scope in the URL);
* `lib/filters.ts` gains `scopeKey(filters)`, derived from `filtersToApiQuery`, so
  **the query key is exactly the request**: same query ⇒ same cache entry. All
  analytical hooks in `useAnalytics.ts` now key on it;
* the chart visibility decision moved to `lib/chartState.ts`
  (`chartDisplayState`), where "has data" always beats "is fetching" and beats
  "failed": a valid chart is never blanked by a later request. A separate
  `UpdatingPill` marks a substate update instead of a skeleton.

Regression tests: `apps/web/tests/chart-state.test.ts` (8 cases incl. "keeps a
loaded chart while a background refetch is in flight", "…when a later request
fails") and `apps/web/tests/filters.test.ts` → `scope identity (the query key)`
(5 cases incl. the exact period-vs-period+derived-pair regression).

## P1.3 — "Coverage unknown"

**Two causes, both fixed.**

*Backend*: `period_service.catalog()` took a period's `coverage_level` only from
the productivity panel and never from the coverage matrix. A period the serving
panel does not substantiate — exactly what a production database older than the
pipeline produces — ended up `coverage_level = None` even though the matrix
described it. `_strongest_level` now derives the level from every layer that
records one (district > national_crop > national), `None` is preserved when
nothing was recorded, and the catalogue notes now say which periods only the
matrix describes instead of asserting panel coverage that is absent.

*Frontend*: `PeriodTimeline`'s local `coverageText` recognised only two of the
three published levels and rendered `national_crop` as the literal string
"coverage unknown". It is now `coverageText()` in `lib/coverage.ts`, exported and
tested, with `national_crop` → "national · crop level", a district level with no
count → "district rows" (never a borrowed 30), and an unrecorded level →
"coverage not recorded".

## P1.4 — The oversized 14-period list

Replaced, not restyled. The Overview's opening element is now
`PeriodScopeControl`: an explicit **All published periods** scope, a **Year**
select, a **Season** select limited to the seasons that year really published, a
compact scope summary, a data-derived supporting line
("Historical data: 2022–2026 · Latest published season: 2026 Season B · 14
releases" — the latest is taken from the axis order, so it is not hardcoded), and
a **Coverage** popover holding the full per-release timeline one interaction away.
The default Overview no longer spends a screenful listing releases.

Helpers live in `lib/periodControl.ts` and are tested in
`apps/web/tests/period-control.test.ts` (14 cases).

## P1.5 — Verification actually run

```
ruff check scripts/data scripts/tests            All checks passed!
ruff check services/api/app services/api/tests   All checks passed!
ruff check ml/src ml/tests                       All checks passed!
pytest services/api/tests                        548 passed, 27 skipped   (was 542/27)
pytest services/api/tests (CANONICAL_TEST_DATABASE_URL=...)  26 passed, 1 skipped
pytest scripts/tests                             94 passed, 1 skipped
pytest ml                                        39 passed
pnpm --filter cropmatics-web typecheck           clean
pnpm --filter cropmatics-web lint                clean
pnpm --filter cropmatics-web test                235 passed / 20 files  (was 182/17)
pnpm --filter cropmatics-web build               EXIT=0
apps/mobile typecheck / lint                     clean
apps/mobile npm test                             296 passed / 31 files
python -m scripts.data.run_all.py                EXIT=0
```

`ortools==9.11.4210` was installed into the local venv (it is pinned in
`services/api/requirements-ml.txt`) so the three optimisation tests run locally
instead of skipping; that is why the local API baseline is 542 passed / 27 skipped
here rather than 542 / 30.

## P1.6 — Known non-claims for this phase

* No DOM/browser harness was added. The web tests are pure-function tests; the
  period control and the chart panels are verified by typecheck, lint, unit tests
  and a production build, **not by rendering**. `BROWSER_VERIFIED` is not claimed.
* The mobile app was not modified in this phase.
* Productivity, Yield Intelligence, Interventions, Post-Harvest, Storage, Crops
  catalogue and crop-detail pages were **not** redesigned in this phase.
* Forecasting was not revalidated; the 271 unmapped SAS sheets were not reviewed.
* Production was not loaded; `production load` remains **blocked on explicit
  approval**, unchanged from the previous record.

## P1.7 — Environment note for the next agent

Stale `__pycache__` bytecode in this checkout embeds the path
`/Users/apple/Desktop/AgriNexus_Rwanda_Starter_Package` (the directory the repo
was previously called). Pytest therefore *prints* skip locations under that old
path. The results are correct; only the displayed path is stale. A dangling
`git worktree` registration for the same old path remains listed as `prunable`.
