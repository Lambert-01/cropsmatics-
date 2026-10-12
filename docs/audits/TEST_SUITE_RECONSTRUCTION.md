# Test-suite reconstruction — 2026-10-12

Companion inventory: `docs/audits/TEST_SUITE_INVENTORY.json` (machine-readable,
one row per file). Regenerate with `python3 docs/audits/build_test_inventory.py`.

Scope: Phase 1 of the handoff — inventory, removal of obsolete/duplicated test
files, consolidation of the fragmented mobile suites, repair of the one failing
CI job, and a coherent four-layer strategy. **No coverage was deleted without a
replacement being committed first.**

---

## 1. Strategy

| Layer | What lives there | Where |
|---|---|---|
| Unit | pure transformations, selectors, calculations, component logic | `apps/web/tests`, `apps/mobile/tests`, `services/api/tests` (database-free) |
| Component | interactive controls, charts, empty states, navigation | `apps/web/tests`, `apps/mobile/tests` (logic-level; see §7 limits) |
| Integration | API contracts, migrations, loader, canonical reads | `services/api/tests/test_canonical_integration.py` + service tests |
| End-to-end | critical real workflows in a running app | **not yet automated** — §7 |

Rules applied:

* a test is only removed when its behaviour is covered elsewhere or proven
  unnecessary — never because it is old;
* a test that reads the developer's disk instead of a fixture is a bug, not a
  fixture (that is what the red CI job was);
* no assertion was weakened, no test was skipped to make a run green, and no CI
  job was disabled.

---

## 2. What was removed

| File | Kind | Why it was safe to remove |
|---|---|---|
| `scripts/test_mark_iso.py` | DELETE | Not a test at all: a throwaway image experiment that prints and writes `/tmp/clean_mark.png`. Fully superseded by `extract_mark_transparent()` in `scripts/branding/build_brand_assets.py`, and never collected by any runner (`pytest` `testpaths` does not include `scripts/`, and the file defines no test function). |
| `apps/web/tests/theme.test.ts` | MERGE | Its two `riskStyle` cases duplicated the `riskStyle` describe block already in `presentation.test.ts`. Both unique assertions (identity against `RISK`, case-insensitive fallback) were folded in before the file was deleted. |

## 3. What was consolidated

Fourteen fragmented mobile files became four domain files. Every case was moved
verbatim; `git mv`-style history remains reachable through the deleted paths.

| Merged into | From | Cases |
|---|---|---:|
| `apps/mobile/tests/compare.test.ts` (26) | `comparison-selection` (10), `comparison-alignment` (6), `compare-selection-merge` (10) | 26 |
| `apps/mobile/tests/maps.test.ts` (34) | `map-district-param` (4), `map-period-coverage` (11), `map-scale-consistency` (6), `map-transform` (13) | 34 |
| `apps/mobile/tests/navigation.test.ts` (22) | `navigation-state` (15), `onboarding-state` (7) | 22 |
| `apps/mobile/tests/charts.test.ts` (35) | `chart-gesture` (9), `chart-null-handling` (7), `chart-period-window` (7), `diverging` (9), `movers` (3) | 35 |

The merge was mechanical (imports unioned, bodies concatenated, no assertion
edited), then verified by typecheck, lint and a full run.

## 4. What was rewritten

| File | Why |
|---|---|
| `services/api/tests/test_scenario.py` → `test_model_scenario_stays_off_for_a_spatially_validated_model` + new `…_when_no_model_card_exists_at_all` | **This was the failing CI job.** The old test read `ml/reports/*.json` from the checkout. That directory is gitignored (a model card is a training artefact), so the test passed on the developer's machine and failed on a clean runner: with no card registered the reason never named a district-holdout model. It now writes its own card into `tmp_path` and points `meta_service.MODELS_DIR` at it, and a second case pins the clean-checkout behaviour. |
| `services/api/tests/test_canonical_integration.py` → `_refuse_production_target` | Write-based integration tests must never be able to target production. The fixture now refuses a `CANONICAL_TEST_DATABASE_URL` that matches the host **and** database of `DATABASE_URL` or of `.env`'s `DATABASE_URL`, raising before any migration runs. Verified both directions: production rejected, throwaway accepted. |

## 5. Contracts that must stay covered (and where they live)

| Contract | Test |
|---|---|
| production database version-read regression | `services/api/tests/test_canonical_row_handling.py` |
| canonical database foreign keys / schema drift | `services/api/tests/test_canonical_schema.py` |
| correct source catalogue | `services/api/tests/test_source_catalogue_consistency.py` |
| published period metadata | `services/api/tests/test_period_coverage_sources.py`, `test_periods.py` |
| SQLAlchemy Core result handling | `test_canonical_row_handling.py` |
| deterministic SAS ingestion | `scripts/tests/test_data_pipeline.py` |
| year/season normalization | `scripts/tests/test_multi_season.py` |
| 2022–2026 historical panel | `services/api/tests/test_periods.py` |
| source lineage | `scripts/tests/test_provenance_attribution.py` |
| null handling | `scripts/tests/test_observation_bounds.py` |
| yield consistency flags | `services/api/tests/test_loader_quality_flags.py` |
| national vs district scope | `services/api/tests/test_national_board_scope.py` |
| web filter reset | `apps/web/tests/preferences.test.ts` |
| chart disappearing after query refetch | `apps/web/tests/chart-state.test.ts` |
| request race conditions / query-key identity | `apps/web/tests/filters.test.ts` |
| comparison selection | `apps/mobile/tests/compare.test.ts` |
| map gesture calculations | `apps/mobile/tests/maps.test.ts` |
| forecast chronological validation + suppression | `ml/tests/test_forecast_backtest.py` |
| production/test database isolation | `services/api/tests/conftest.py` + `_refuse_production_target` above |

Every one of these files was retained. The inventory marks them
`protects_critical_regression: true`.

## 6. Counts

Baseline is the handoff commit `cf5e00f`. "Definitions" counts `def test_` /
`it(` in the files; "executed" is what the runner reported (pytest expands
parametrised cases, so API executed > definitions).

| | Files before | Files after | Definitions before | Definitions after | Executed before | Executed after |
|---|---:|---:|---:|---:|---:|---:|
| Web | 20 | **19** | 235 | 235 | 235 | 235 |
| Mobile | 31 | **21** | 296 | 296 | 296 | 296 |
| API | 51 | 51 | 510 | **511** | 552 passed, 27 skipped | **553 passed, 27 skipped** |
| Data | 9 | 9 | 94 | 94 | 95 (94 + 1 skip) | 95 |
| ML | 8 | 8 | 39 | 39 | 39 | 39 |
| Stray (`scripts/test_mark_iso.py`) | 1 | **0** | 0 | — | never collected | — |
| **Total** | **120** | **108** | **1174** | **1175** | **1217** | **1218** |

Files −12 (−1 obsolete script, −1 web duplicate, −14 mobile fragments, +4 merge
targets). Cases +1: the failing CI test was replaced by two hermetic cases.
**No case was deleted.**

## 7. Execution time (this machine, this checkout)

```
services/api/.venv/bin/pytest services/api/tests   553 passed, 27 skipped  in 117 s
services/api/.venv/bin/pytest services/api/tests/test_canonical_integration.py
                                                   26 passed, 1 skipped    in 192 s  (isolated Neon DB)
services/api/.venv/bin/pytest scripts/tests         94 passed, 1 skipped  in  23 s
services/api/.venv/bin/pytest ml                    39 passed             in   1.8 s
pnpm --filter cropmatics-web test                  235 passed / 19 files  in  10 s
npm --prefix apps/mobile test                      296 passed / 21 files  in 7.5 s
```

The 27 API skips are all `test_canonical_integration.py` waiting for
`CANONICAL_TEST_DATABASE_URL`; CI sets it, so they run there rather than being
silently lost.

## 8. Intentionally removed coverage

None. Every case that existed before this pass still exists after it, and the
two behaviours that were only reachable on a developer's machine are now
reachable everywhere.

Not added (stated, not hidden): there is still no DOM/browser harness in
`apps/web` and no end-to-end suite. Chart layout, focus rings and rendered
legends are verified by typecheck, lint, unit tests and a production build —
**not by rendering**. `BROWSER_VERIFIED` is not claimed anywhere in this
document.

## 9. CI changes

`.github/workflows/ci.yml`: the four `pytest … -q` invocations became
`pytest … --no-header -ra`. `addopts` already supplies `-q`, so the second `-q`
made the run `-qq` and hid the pass/fail/skip summary line that a release gate
should show. Gates are unchanged; the log now ends with the counts.
