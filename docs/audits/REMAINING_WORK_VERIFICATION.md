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
| API | `services/api/.venv/bin/pytest services/api/tests` | **533 passed, 27 skipped** (was 519/27; +14 new) |
| Data | `services/api/.venv/bin/pytest scripts/tests` | **94 passed, 1 skipped** (was 83/1; +11 new) |
| ML | `services/api/.venv/bin/pytest ml` | **39 passed** (unmodified by this work) |
| Mobile | `npm --prefix apps/mobile test` | **267 passed** / 29 files |
| Mobile typecheck / lint | `npm run typecheck`, `npm run lint` | clean |

New tests: `services/api/tests/test_indicator_history.py` (14) and
`scripts/tests/test_indicator_exposure.py` (11). The pipeline test includes a
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

**Not started in this pass** (see the final report): Crops year/season filters,
Compare UX, Maps gesture work, web Interventions redesign, web filter pass.

---

## Milestone E — web Interventions

**Not started.** No web source file was modified in this pass. `apps/web` was
re-verified as unbroken (see below) but the redesign itself is outstanding.

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
* `Tables_2025_Season_B_0.xlsx` (33 sheets) remains the only wholly unmapped
  workbook; the precedence question is unresolved by design.
* No screenshot or recording of the mobile Analyze screen exists, because no
  device or emulator was available to render it.
