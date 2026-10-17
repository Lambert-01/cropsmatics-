# Implementation Evidence

Status: **in progress** · Session date: 2026-10-16
Baseline commit at session start: `cdffdf7` (`main`, clean working tree)

This document distinguishes five things that are easy to conflate. A claim in
this file belongs to exactly one of them:

| State | Meaning |
|---|---|
| **Implemented** | the code exists in the tree |
| **Locally verified** | a command in this document was run here and passed |
| **CI verified** | a GitHub Actions run on the commit passed |
| **Deployed** | the behaviour was observed on a live URL |
| **Externally reviewed** | a human signed off (native Kinyarwanda, device, legal) |

Nothing in this session reaches **CI verified**, **Deployed** or **Externally
reviewed**: no push, deploy or paid build was performed.

## 1. What this session changed

### 1.1 Manual projection engine — the "Plan next season" capability

The brief's central new product ask (§14-§21) — a user-controlled projection that
is visibly *not* an official statistic and *not* a validated forecast. It did not
exist before this session (`rg -i 'manual.?projection'` returned no matches).

New files:

| File | Responsibility |
|---|---|
| `services/api/app/analytics/manual_projection.py` | pure arithmetic: season stepping, carry-forward, once-vs-per-step change, unit conversion, guards |
| `services/api/app/schemas/manual_projection.py` | strict request (`extra="forbid"`) and response models |
| `services/api/app/services/manual_projection_service.py` | orchestration over the canonical panel |
| `apps/web/lib/manualProjection.ts` | the one request builder, shared by the form and the contract test |
| `apps/web/features/yield-intelligence/ManualProjectionWorkspace.tsx` | the compact assumptions form, chart and export |

Changed files:

| File | Change |
|---|---|
| `services/api/app/api/v1/scenarios.py` | `POST /api/v1/scenarios/manual-projection`, mapping refusals to a structured 422 |
| `apps/web/lib/api.ts` | `api.manualProjection` |
| `apps/web/types/index.ts` | projection request/response types |
| `apps/web/services/hooks/useAnalytics.ts` | `useManualProjection` (a mutation, so a slider never silently recomputes) |
| `apps/web/app/yield-intelligence/page.tsx` | surfaces the workspace in the Forecast area |

Design decisions that the brief required, and where they live:

* **Three value kinds kept apart.** Every response carries
  `value_kind = "planning_projection"` and the export rows carry
  `row_kind ∈ {observed_baseline, assumption, projection}`.
* **Same-season stepping only.** `next_same_season_codes` steps `2026B → 2027B`,
  `2028B` and never rolls through A/B/C.
* **The change mode is stated, not implied.** `compounding` is `once` (level
  shift) or `per_step` (compounds), echoed with the result.
* **Bands are cases, not intervals.** `lower`/`main`/`higher` are three
  assumption cases; the API calls them that and validates their ordering.
* **No causal claims.** No irrigation/fertilizer/weather response exists in the
  engine; the limitations say so.
* **Stateless.** Nothing is written to any observation or canonical table.

### 1.2 Data explorer exposure (§30)

`agricultural_practice_observation()` and `postharvest_use_multi_period()` were
already exposed by `repositories/dataset_repository.py`, but the explorer
whitelist in `services/api/app/services/dataset_service.py` did not register them,
so the newest legitimate datasets were unreachable while their legacy 2025
Season B predecessors were not. They are now registered, filterable, and grouped
(`current` / `archive` / `program` / `reference`) so a client does not maintain a
tab per release.

### 1.3 All-crop yield wording (§43)

Total production ÷ harvested area is **area-weighted** output per harvested
hectare, not production-weighted (total ÷ area = area-weighted mean of per-crop
yields). Corrected in `canonical_trend_service.py`, `dashboard_service.py`,
`apps/web/types/index.ts` and `CanonicalTrendChart.tsx`, with a note that the
aggregate moves with crop mix.

### 1.4 Compact provenance default (§25)

`showSources` now defaults to `false` (compact, with a reachable control).
`PREFERENCES_VERSION` is 3. v2 entries are **migrated** field by field so a
deliberate "expand sources" choice and unrelated theme/filter preferences
survive; v1 is still discarded because it could carry the landing-scope default
that broke `/dashboard`.

## 2. Local verification actually run

| Command | Result |
|---|---|
| `PYTHONPATH=. .venv/bin/pytest services/api/tests -o addopts="" -q` | **717 passed, 27 skipped** (skips are PostGIS integration tests with no `DATABASE_URL`) |
| `.venv/bin/pytest services/api/tests/test_manual_projection.py -q` | 19 passed |
| `.venv/bin/pytest services/api/tests/test_manual_projection_contract.py -q` | 8 passed |
| `.venv/bin/pytest services/api/tests/test_dataset_multi_period.py` | 8 passed |
| `.venv/bin/ruff check services/api/app services/api/tests` | All checks passed |
| `.venv/bin/ruff format --check <changed files>` | clean |
| `cd apps/web && npx tsc --noEmit` | exit 0 |
| `cd apps/web && npx next lint` | No ESLint warnings or errors |
| `cd apps/web && npx vitest run` | **392 passed (27 files)** |
| `cd apps/web && NEXT_PUBLIC_API_BASE_URL=… npx next build` | succeeded |

Not run here: **Mobile** (lint/typecheck/tests/Expo config) — the mobile app was
not touched this session. **Playwright browser matrix** and **physical Android
device** — not run. **Full data pipeline rebuild** — not run; the processed
artefacts are the ones already in the tree (see the data card's freshness note).

## 3. What is *not* done

The brief is a 43-section programme. Part 1 of this session (sections 1-2 above)
and part 2 (section 5 below) completed a coherent slice between them. As of part
2, these remain, in the brief's own dependency order:

1. **§4/§5** — source precedence resolution (`SAS_SOURCE_PRECEDENCE.md`) and the
   worksheet-coverage disposition of the unmapped instances.
2. **§6** — national metric coverage repair in the extraction pipeline.
3. **§28/§29** — the dedicated `/maps` and `/reports` workflows beyond what the
   existing routes already do.
4. **§31/§32** — Transparency restructure and Settings regrouping.
5. **§33/§34** — the mobile clarity pass and the harvest/farm sync repair (the
   payload-vs-backend schema mismatch the brief describes). The mobile toolchain
   itself is now verified clean (section 5.4), which is a precondition for
   repairing behaviour on a device.
6. **§36/§37** — the browser/device QA matrix and Kinyarwanda review (**blocked
   on a device and a native speaker**).

Completed since part 1 wrote its own list: §21 claim-level grounding (section 5),
§23 navigation simplification (5.2), §27 map legend semantics (5.3).

External blockers, stated exactly: a physical Android device or emulator; a
native Kinyarwanda reviewer; authorization for push/deploy/EAS builds; an AI
provider key for credentialed assistant testing.

## 4. Reproduce this session's verification

```bash
# Python
PYTHONPATH=. .venv/bin/pytest services/api/tests -o addopts="" -q

# Web
cd apps/web && npx tsc --noEmit && npx next lint && npx vitest run
NEXT_PUBLIC_API_BASE_URL=https://cropsmatics-api.onrender.com/api/v1 npx next build
```

No test total from the brief was copied into this document; the counts above are
what the commands printed here.

---

# Part 2 — claim-level grounding, navigation, mobile verification

Same session date, after part 1. Baseline at the start of part 2: the working tree
as part 1 left it (uncommitted). Nothing here is pushed, deployed or reviewed by a
human.

## 5. What changed in part 2

### 5.1 Claim-level grounding in the AI layer (§21)

The gap part 1 recorded honestly: `numeric_guard` proved the digits existed
*somewhere* in the evidence, so a sentence could move a figure to another unit,
metric, crop, district or period and still pass. That is now closed by a second
guard, and both run on every answer including the deterministic fallback text.

| File | Change |
|---|---|
| `services/api/app/ai/claim_guard.py` *(new)* | unit → canonical-unit matching, per-clause metric-word check, crop/district/province/period scope, comparison direction (districts, crops, periods), percentage-change sign, effect-asserting wording over observational evidence, unknown capacity not asserted as zero, and sign-insensitive acceptance of figures quoted from evidence prose |
| `services/api/app/ai/output_validator.py` | runs `claim_guard` after `numeric_guard`; a rejected claim returns the deterministic answer and records `validation.claims` plus the reason |
| `services/api/app/api/v1/assistant.py` | the translated rendering is re-checked for claims as well as figures |
| `services/api/app/ai/tools/metadata.py` | **defect**: the source tools read columns the registry does not publish (`source_id`, `title`, `dataset`), so every provenance answer cited empty evidence with colliding ids |
| `services/api/app/ai/evidence.py` | **defect**: the numeric allow-list ignored numbers in a string `value` and never matched a published negative figure quoted unsigned, so the platform's own coverage and withholding summaries were rejected by its own guard |
| `services/api/app/ai/tools/analysis.py` | the coverage tool now carries the period count the coverage answer states |

Tests: `tests/test_ai_claim_guard.py` (35) — the rules and, as importantly, the
cases that must **not** be rejected; `tests/test_ai_claim_eval.py` (10) — five
adversarial answer shapes and two injection cases driven through the real request
path, plus controls that require a correct restatement to be accepted and 12 real
questions to pass both guards with no fallback. The evaluation set is written up
in [AI_EVALUATION.md](AI_EVALUATION.md), including what it does not prove (no
credentialed provider was exercised, and paraphrase-level evasion is not covered).

Two findings are recorded as defects found *by* the evaluation rather than as
caveats, because both were repaired.

### 5.2 Yield Intelligence: four workspaces, legacy links preserved (§23)

`apps/web/lib/yield-workspaces.ts` collapses nine workspaces to four - Overview,
Trends, Drivers, Forecast - with `LEGACY_WORKSPACE_ALIASES` mapping every id that
was ever published (`ai`→overview, `spatial`→trends, `gaps`→drivers,
`scenarios`/`methodology`→forecast) so a copied link still opens the analysis it
pointed at. Nothing was deleted: the AI explanation moved next to the headline
figures it explains, the map and ranking joined the trend question, the gap
distribution joined the drivers, and the model cards and provenance joined the
modelled layer they qualify. `apps/web/tests/yield.test.ts` asserts the four ids,
the alias table (no alias points at a deleted id or at itself) and the fallbacks.

### 5.3 Map legend semantics (§27)

`makeScale` silently turned a missing published range into `0 → 1`, so a metric
with no value for the selection rendered a legend full of invented endpoints. The
scale now reports `published`, the legend states "No published range for this
selection" instead of printing one, and the no-data swatch and the map fill share
one exported `NO_DATA_COLOR` constant rather than two copies of a hex value.
`apps/web/tests/map-legend.test.ts` covers the scale and the rendered legend.

### 5.4 Mobile toolchain and CI (precondition for §33-§35)

Mobile was reported as untested in part 1. It is now verified from this checkout
with the same commands CI runs: `npm run typecheck` (exit 0), `npm run lint`
(exit 0), `npm run test` (**341 passed, 25 files**), `npx expo config --type
public` (exit 0). No mobile source file was changed; this establishes that the
mobile job in `.github/workflows/ci.yml` has a clean baseline, and that the
remaining mobile work is behavioural (clarity, sync repair) rather than
build-breaking.

## 6. Part 2 verification

| Check | Command | Result |
|---|---|---|
| API tests | `pytest tests` | **762 passed, 27 skipped** (skips = PostGIS/canonical, no `DATABASE_URL`) |
| API lint | `ruff check app tests` | All checks passed |
| Web typecheck | `npx tsc --noEmit` | exit 0 |
| Web lint | `npx next lint` | No ESLint warnings or errors |
| Web unit tests | `npx vitest run` | **403 passed (28 files)** |
| Web build | `NEXT_PUBLIC_API_BASE_URL=… npx next build` | succeeded |
| Mobile typecheck / lint | `npm run typecheck && npm run lint` | exit 0 / exit 0 |
| Mobile tests | `npm run test` | **341 passed (25 files)** |
| Mobile config | `npx expo config --type public` | exit 0 |

Exit statuses were preserved (`set -o pipefail` / `${PIPESTATUS[0]}`). No test was
disabled, weakened or suppressed to make these numbers pass: the 27 skips are the
pre-existing PostGIS/canonical tests that need `DATABASE_URL`, the same 27 that
were skipped before this session, and the claim evaluation sets skip with a stated
reason only when the processed tables are missing (they did not skip here). The
one check that was *changed* is the Yield Intelligence workspace test, which now
asserts the four workspaces the brief asks for instead of the nine it previously
asserted - a change required by the requested behaviour, not a relaxation.

`ruff format --check` reports repo-wide reformatting (93 files, including files
untouched here) and `black --check` agrees, so neither formatter is the enforced
standard in this repository; `ruff check` - which CI runs - passes on the new and
changed files, and no new line exceeds the configured 100-column width.

**Not run in part 2:** the Playwright browser matrix, any physical Android device
or emulator, a native Kinyarwanda review, a credentialed AI provider, and a full
data pipeline rebuild. These remain `NOT RUN` / `BLOCKED` exactly as part 1
recorded them.
