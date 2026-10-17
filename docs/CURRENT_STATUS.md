# Current Status

Reviewed: **2026-10-18**, latest working-tree changes after `48e55d6`.
Working branch: `review/latest-improvements-2026-10-17`.

**Verdict: the previously identified code defects are repaired locally, but this
is not yet a fully verified production release.** The remaining work is now
deployment/data-evidence/UX verification rather than the earlier ownership,
claim-binding, benchmark-KPI, sync-state or dataset-contract defects. The
remaining task is specified in
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
| Planning export | Python generates CSV with calculation ID, dataset/method versions, origin/targets, scope, assumptions and row kinds. Normal headers replace the old prose prefix. |
| AI district attribution | The earlier unknown-district and two-district swap reproductions now fall back; correctly attributed controls still pass. This does not establish full semantic safety. |
| Explorer | Indicator/domain filters reach the service; literal `[` search returns 200 instead of 500; filtered CSV uses the same selection path as JSON. |
| Maps | Negative interior values interpolate distinctly and diverging legend stops align with zero's position. Tests cover mixed, one-sided and asymmetric domains. |
| Sources | Cards permit shrinking and source text wraps. All four Dashboard source disclosures were expanded after requests settled at 1440, 1920, 768 and 390 px; document width matched each viewport. The old overflow reproduction is repaired. |
| Scenario explanations | `shortfall_pct`, `purpose`, `reference_n` and eligibility survive scenario row projection. API/ML parity tests include explanation fields. |
| Operational persistence | New farm upload route and migration persist farm identity and additional harvest fields. Queue entries wait for a server response; uploads arriving in either order can link. Authenticated ownership and entity-aware sync status are now implemented locally. |

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

- Share-plan helpers preserve partial cases, but the form restores them into
  fixed lower/main/higher controls. Browser coverage is needed to prove the
  restored request does not add or alter cases. Scope mismatches currently warn
  rather than restoring the page filters automatically.
- Python export recomputes the request against current data. It does not bind to
  an expected calculation/dataset version, so a data refresh between Calculate
  and Export can change the downloaded result. Add snapshot parity checks.
- Ownership and migration tests still need a disposable PostGIS rehearsal before
  deployment. The local SQLite fixture cannot prove PostgreSQL/PostGIS DDL.
- Physical Android restart/reconnect/idempotency testing is still required for
  the Expo app; unit tests cannot replace a device run.

## Data And Product Work Still Pending

No raw mappings or ETL builders changed in this increment. Source precedence for
the two standalone 2025B workbooks remains unresolved; the inventory still lists
134 used, 304 unmapped and two metadata sheets. Worksheet exclusions, national
subtotal interpretation, exact per-metric cell lineage and a reviewed issue
register remain open. All periods are not interchangeable and not every crop
exists in every release.

Dedicated Reports, Maps, Transparency and Settings pages have no page-level
redesign in this increment. Explorer adds appropriate controls but still lacks a
completed grouped catalog workflow. Native mobile gains API/queue changes, not
the full requested Analyze/Compare/Ask design pass or physical-device sign-off.
The complete EN/RW browser-state matrix, automated accessibility/keyboard review,
native-speaker Kinyarwanda review and approved APK/install artifact are pending.

Validated forecasts remain withheld when publication criteria fail. Missing
market prices and unverified storage capacity remain unavailable. Those are
correct boundaries, not reasons to invent numbers.

## Verification

Fresh checks against this increment:

| Check | Result |
|---|---|
| API + scripts + ML pytest | 988 passed, 28 skipped; exit 0 |
| Web Vitest | 444 passed in 31 files; exit 0 |
| Mobile Vitest | 347 passed in 26 files; exit 0 |
| Ruff | Passed; exit 0 |
| Web lint and production build | Passed; exit 0; 19 static pages generated |
| Mobile lint | Passed; exit 0 |
| Mobile TypeScript after fresh npm ci | Passed; exit 0 |
| Rendered Planning | Calculation passed at 1440x900, 1920x1080, 768x1024 and 390x844 without document overflow or uncaught page errors |
| Desktop plan workflow | Python CSV downloaded with normal metadata header; outdated-result notice and a full plan-link restoration passed |
| Expanded Dashboard sources | All four disclosures opened at all four viewports; no document overflow |
| Old reproduction suite | Projection empty-history/season/cutoff/case and district-attribution cases now behave correctly |
| New adversarial checks | Wrong crop and swapped periods rejected; peer KPI matches displayed row; every catalog filter accepted by JSON and CSV |

Focused checks in this pass:

| Check | Result |
|---|---|
| `pytest tests/test_ai_claim_guard.py` | 43 passed |
| `pytest tests/test_farm_sync.py` | 25 passed |
| `pytest tests/test_dataset_filters.py` | 17 passed |
| `pytest tests/test_yield_intelligence.py` | passed, including peer-headline regression |
| `npm test -- --run` in `apps/mobile` | 347 passed in 26 files |
| `npm run typecheck` in `apps/mobile` | passed |

An initial mobile typecheck used a stale installation and picked up React 18 DOM
types from the parent tree. `npm ci` restored the declared React 19 type package
and the check passed. No unsafe cast or dependency workaround was added.

Local skips include 27 database-backed API cases and one script case. A migration
file and SQLite persistence tests are not proof of PostGIS upgrade/rollback or
real Android behavior. Current CI and deployment must be verified for the actual
pushed revision; the earlier green run on `48e55d6` does not verify this increment.

The browser used the production web build with API requests explicitly proxied
to the temporary local file-mode API. This is rendered local evidence, not a
production API smoke test. The source-expansion run waited for every request to
settle before counting/opening all four disclosures. Screenshots and raw results
are temporary audit artifacts, not approved submission designs.

This increment is prepared on `review/latest-improvements-2026-10-17`. After
promotion, production must be verified against the exact deployed commit; a
green local suite does not prove Render, Vercel, or a physical APK is using it.

## Repository Hygiene

The earlier cleanup removed 27 superseded/generated files. This pass additionally
retires unreferenced prototype `ALGORITHM_DESIGN.md` and `BACKEND_FASTAPI.md`,
whose proposed contracts are superseded by the maintained domain guides. No
official input, migration, test suite or active source file is deleted. Generated
browser captures stay in temporary storage, not the GitHub source tree.
