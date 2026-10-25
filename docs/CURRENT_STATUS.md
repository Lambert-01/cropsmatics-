# Current Status

Reviewed: **2026-10-24**, latest working-tree changes after the mobile and
submission-readiness pass.
Working branch: `main`.

**Verdict: this is a strong release candidate, but not yet a fully verified
submission.** The latest dashboard refetch fix is on `main` at `2ef8219`.
Render is live on that revision, Vercel reports a successful deployment, and
readiness plus representative analytics smoke tests returned `200`. The
canonical database release is serving again. Remaining work is UX/device/demo
evidence rather than the earlier ownership, claim-binding, benchmark-KPI,
sync-state or dataset-contract defects. The remaining task is specified in
[REMAINING_BUILD_PROMPT.md](REMAINING_BUILD_PROMPT.md).

## Confirmed Improvements

| Area | Latest implementation and evidence |
|---|---|
| National benchmark scope | Productivity, overview, heatmap and scorecard compute reference gaps before district display filtering. Maize/Bugesera/2026B now retains benchmark 1159.1443 kg/ha and gap 17.8574%, rather than benchmarking against itself. |
| Same-season comparison | A frontend-style query containing year=2026, season=B and period=2026B now finds the previous 2025B value; Bugesera's change is -5.5%. |
| Projection empty history | The former Wheat/Bugesera/C personal-plan crash is repaired. An assumed 1000 kg/ha on 2 ha returns 2 metric tonnes without indexing missing history. |
| Projection season and cutoff | Personal Season C plans remain on C targets. A personal 2023B origin now restricts baseline observations to 2022B and 2023B. |
| Assumption cases | Inverted partial cases are rejected, including lower=30% with main=10%. Carry-forward refuses meaningless change cases. |
| Planning workflow | Origin-options endpoint, origin selection, lower/main/higher chart series, outdated-result messaging and versioned plan links are implemented. Browser acceptance is separate from helper-unit tests. |
| Partial plan restoration | Shared links with only some ordered assumption cases now restore and re-submit the exact present case rows; the web request builder omits an unrelated scalar main case. A regression test covers lower/higher-only plans. |
| Planning export | Python generates CSV with calculation ID, dataset/method versions, origin/targets, scope, assumptions and row kinds. Export requests now carry the displayed calculation/dataset identity and reject stale snapshots. |
| AI district attribution | The earlier unknown-district and two-district swap reproductions now fall back; correctly attributed controls still pass. This does not establish full semantic safety. |
| Explorer | Indicator/domain filters reach the service; literal `[` search returns 200 instead of 500; filtered CSV uses the same selection path as JSON. |
| Explorer grouping | The Data Explorer now groups the backend catalogue into current, archive, programme-context and reference evidence groups, with the active source and accepted filters visible before opening the table. |
| Mobile release helper | Both APK scripts now make standard macOS `git` locations available and fail early with an actionable Xcode Command Line Tools message instead of surfacing EAS `spawn git ENOENT` after upload preparation. |
| Maps | Negative interior values interpolate distinctly and diverging legend stops align with zero's position. Tests cover mixed, one-sided and asymmetric domains. |
| Maps route resilience | The dedicated Maps page now exposes the shared period/crop/province/district/benchmark filters, preserves a loaded map while a new selection refetches, and shows a recoverable Retry state for a first-load API failure. |
| Mobile planning projection | Analyze now includes a compact planning workspace backed by `/scenarios/manual-projection`: crop, scope, season, published origin, method, horizon and personal assumptions are sent to Python, with result units, planning-target labels and provenance rendered on-device. It remains separate from the validated forecast gate. |
| Transparency failure states | Data & Models now distinguishes failed source, coverage, manifest, algorithm and model requests from genuine empty datasets, with a recoverable Retry action. |
| Reports failure states | Reports now distinguishes a failed raw-dataset catalogue request from a catalogue with zero tables, with a recoverable Retry action. |
| Sources | Provenance is compact by default on every analytical card, opens per panel, and source text wraps without widening the document. Legacy saved source preferences no longer reopen every footer. |
| Scenario explanations | `shortfall_pct`, `purpose`, `reference_n` and eligibility survive scenario row projection. API/ML parity tests include explanation fields. |
| Operational persistence | New farm upload route and migration persist farm identity and additional harvest fields. Queue entries wait for a server response; uploads arriving in either order can link. Authenticated ownership and entity-aware sync status are now implemented locally. |
| Shared reference/filter failures | Settings and the shared analytics filter bar now surface failed period/crop/district catalogues with Retry instead of silently showing empty selectors; Settings also reports loaded reference counts. |
| Shared map failures | Dashboard/productivity and Storage map consumers now show a recoverable metric error and preserve an already-loaded map during a failed refresh. |
| Mobile secondary-query failures | Compare, Maps, District Detail, Crop Detail and Post-Harvest now expose retryable catalogue, period, chart, factor and post-harvest failures instead of collapsing them into empty states. |

## Latest repair pass

| Finding from the prior audit | Current result and evidence |
|---|---|
| Operational ownership | **Implemented locally.** Farm and harvest create/read/risk routes require an access token, scope records to the signed-in `FarmerProfile`, reject foreign idempotency keys and conflicting replays, and protect cross-account farm linking. `FarmerProfile.user_id` now has a unique database constraint; first-profile creation uses a savepoint for concurrent requests. |
| AI crop and period binding | **Implemented locally.** The claim guard uses the canonical crop dictionary and attaches crop/period mentions to each value-bearing comparison segment. Wrong-crop and swapped-period regressions are covered; the grounded-answer suite passes. |
| Peer benchmark headline | **Implemented locally.** The benchmark is still computed over the full reference cohort, while the KPI summarizes the benchmark values on the rows being displayed. A peer-group district-selection regression now pins KPI/row agreement. |
| Mobile local sync status | **Implemented locally.** Farm, harvest and outbox status transitions are entity-aware and transactional; queue flush is single-flight and only acknowledges a row after a complete server response. |
| Dataset catalog contract | **Implemented locally.** Every catalog-advertised filter is forwarded through both JSON and CSV routes and exercised by a contract test. Unsupported dataset-specific filters still return an explicit 400. |
| Ownership schema safety | **Implemented locally.** The new `9e8a2b4c7d1f_farmer_profile_ownership` migration adds the one-to-one profile constraint. The mobile-sync downgrade checks for anonymous farms before destructive DDL and fails closed. |

## Remaining Work

The earlier P1/P2 code findings are closed in the working tree. Remaining gaps
are verification or product-evidence work:

- Partial assumption cases now restore exactly in the form and request builder.
  Browser coverage is still needed to prove the real share-link journey does
  not add or alter cases. Scope mismatches currently warn rather than restoring
  the page filters automatically.
- Ownership and migration tests still need a disposable PostGIS rehearsal before
  deployment. The local SQLite fixture cannot prove PostgreSQL/PostGIS DDL.
- Physical Android restart/reconnect/idempotency testing is still required for
  the Expo app; unit tests cannot replace a device run.

## Data And Product Work Still Pending

No raw mappings or ETL builders changed in this increment. The 2025 annual
release is now explicitly documented as the serving authority for 2025B; both
standalone 2025B files remain archive-only. The inventory still lists 134 used,
304 unmapped and two metadata sheets. Worksheet exclusions, national subtotal
interpretation, exact per-metric cell lineage and a reviewed issue register
remain open. All periods are not interchangeable and not every crop exists in
every release.

Dedicated Reports and Transparency pages still need their full page-level visual
review and approved screenshots. Settings now has reference-data status and retry
states. Maps now has the shared filter, failure-state wiring and automated
keyboard/WCAG checks, but its full visual review is still pending. Explorer now has a grouped
catalog workflow, but exact per-metric lineage and a full researcher review
remain open. Native mobile now has the local planning workflow and API/queue
changes, but the full requested Analyze/Compare/Ask design pass and
physical-device sign-off remain open.
The complete EN/RW browser-state matrix, manual keyboard/drawer review,
native-speaker Kinyarwanda review and approved APK/install artifact are pending.

Validated forecasts remain withheld when publication criteria fail. Missing
market prices and unverified storage capacity remain unavailable. Those are
correct boundaries, not reasons to invent numbers.

## Verification

Fresh checks against this increment:

| Check | Result |
|---|---|
| API + scripts + ML pytest | 989 passed, 28 skipped; exit 0 |
| Web Vitest | 445 passed in 31 files; exit 0 |
| Mobile Vitest | 354 passed in 29 files; exit 0 (cache disabled because the sandbox cannot write `node_modules/.vite`) |
| Ruff | Passed; exit 0 |
| Web lint and production build | Passed; exit 0; 19 static pages generated |
| Mobile lint | Passed with no warnings or errors; exit 0 |
| Mobile TypeScript after fresh npm ci | Passed; exit 0 |
| Rendered Planning | Calculation passed at 1440x900, 1920x1080, 768x1024 and 390x844 without document overflow or uncaught page errors |
| Desktop plan workflow | Python CSV downloaded with normal metadata header; outdated-result notice and a full plan-link restoration passed |
| Expanded Dashboard sources | All four disclosures opened at all four viewports; no document overflow |
| Old reproduction suite | Projection empty-history/season/cutoff/case and district-attribution cases now behave correctly |
| New adversarial checks | Wrong crop and swapped periods rejected; peer KPI matches displayed row; every catalog filter accepted by JSON and CSV |
| Data rebuild determinism | `check_idempotent_build.py` passed; dataset identity stayed `0.2.0-0e76c4d8f79ee5fc` across two builds |
| APK helper syntax | `bash -n scripts/build-apk.sh scripts/build_mobile_apk.sh` passed; EAS/device execution remains external |
| Rendered Playwright matrix | 16 passed across 1440x900 desktop and 360x740 mobile-web; deterministic file-backed API, dashboard scope changes/reset, forecast withholding/retry and overflow checks passed |
| Populated-data accessibility | axe-core reported zero serious/critical WCAG 2A/2AA violations on ten key web routes; 390x844 map check found 30 labelled focusable district buttons |
| Live Render deployment | Render is live on `main` commit `2ef8219`; readiness, dashboard overview, input adoption, canonical trend and scoped Maize district metrics all returned 200 in the final smoke check. |

Focused checks in this pass:

| Check | Result |
|---|---|
| `pytest tests/test_ai_claim_guard.py` | 43 passed |
| `pytest tests/test_farm_sync.py` | 25 passed |
| `pytest tests/test_dataset_filters.py` | 17 passed |
| `pytest tests/test_yield_intelligence.py` | passed, including peer-headline regression |
| `npm test -- --run --no-cache` in `apps/mobile` | 354 passed in 29 files |
| `npm run typecheck` in `apps/mobile` | passed |
| `services/api/tests/test_manual_projection_export.py` | 9 passed; stale dataset/calculation snapshots rejected |
| Mobile planning payload tests | 3 passed in `tests/manual-projection.test.ts`; personal inputs and method-specific fields remain explicit |
| Mobile planning API contract tests | 2 passed in `tests/projection-api.test.ts`; origins query and scenario POST body are asserted |

An initial mobile typecheck used a stale installation and picked up React 18 DOM
types from the parent tree. `npm ci` restored the declared React 19 type package
and the check passed. No unsafe cast or dependency workaround was added.

Local skips include 27 database-backed API cases and one script case. A migration
file and SQLite persistence tests are not proof of PostGIS upgrade/rollback or
real Android behavior. Current CI and deployment must be verified for the actual
pushed revision; the earlier green run on `48e55d6` does not verify this increment.

The browser matrix used the production web build with requests explicitly
served by a temporary local file-mode API. Sixteen Playwright tests passed at
1440x900 and 360x740, including the dashboard scope/refetch/reset journey and
forecast retry/withholding states. This is rendered local evidence, not a
production API smoke test. The source-expansion run waited for every request to
settle before counting/opening all four disclosures. Screenshots and raw results
are temporary audit artifacts, not approved submission designs.

The latest dashboard fix is fast-forwarded onto `main`, and the final GitHub,
Render and representative API checks passed for `2ef8219`. Future code changes
must repeat the same deployed-SHA and production smoke checks.

Local debug and release APK files exist and were built against the hosted API.
The Gradle release variant currently uses the debug keystore, so it is suitable
for local installation but is not the final signed/shareable submission artifact.
EAS account authentication works, but the signed remote build was rejected by
the account's exhausted free-plan Android quota. Physical-device verification
and the signed shareable artifact remain open.

## Repository Hygiene

The earlier cleanup removed 27 superseded/generated files. This pass additionally
retires unreferenced prototype `ALGORITHM_DESIGN.md` and `BACKEND_FASTAPI.md`,
whose proposed contracts are superseded by the maintained domain guides. No
official input, migration, test suite or active source file is deleted. Generated
browser captures stay in temporary storage, not the GitHub source tree.
