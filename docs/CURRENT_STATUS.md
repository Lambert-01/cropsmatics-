# Current Status

Reviewed: **2026-10-17**, latest working-tree changes after `48e55d6`.

**Verdict: substantial repairs are implemented and tests pass, but this is not
yet a fully verified production release.** In particular, operational ownership
and AI claim binding remain release risks. This review did not change analytical
algorithms or operational data. The remaining task is specified in
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
| Operational persistence | New farm upload route and migration persist farm identity and additional harvest fields. Queue entries wait for a server response; uploads arriving in either order can link. Access control remains incomplete. |

## Open Findings

### P1: Operational APIs Lack Authentication And Ownership

`services/api/app/api/v1/farms.py:39` accepts a profile without a current-user
dependency, stores `farmer_id=None`, and looks up replays by a global client UUID.
`_link_pending_harvests` links any matching UUID without checking its owner.
Harvest create/read/risk routes likewise have no owner enforcement. Mobile's
legacy request helper sends no bearer token.

Tests demonstrate anonymous uploads succeed; hiding coordinates in responses is
not access control. Do not treat this as a safe multi-user collection service.
Require authenticated ownership (or a deliberately reviewed device identity
protocol), scoped idempotency and cross-account denial tests before collecting
real personal field records. Migrations must be rehearsed against disposable
PostGIS, never production test data.

### P1: AI Crop And Period Attribution Still Bypass Validation

The guard now recognizes all canonical district names, but crop vocabulary at
`services/api/app/ai/claim_guard.py:512` still comes only from evidence/request
scope. With evidence for Bugesera maize yield 952.2 kg/ha, this answer is accepted
as `mode=llm`, `used_fallback=false`: "Rice yield in Bugesera was 952.2 kg/ha in
2026B."

Period checks at `claim_guard.py:796` are still sentence-wide. Evidence for
2025B=952.2 and 2026B=1555.4 accepts: "In Bugesera maize yield was 1555.4 kg/ha
in 2025B and 952.2 kg/ha in 2026B." The correctly paired control also passes.
These are deterministic validator reproductions, not credentialed provider
tests or claims about observed production answers.

### P2: Peer Benchmark Headline Disagrees With Its District Row

`analytics_service.py:741` computes the benchmark headline median across the
whole reference frame. Under `agro_ecological_peer_group`, Maize/Bugesera/2026B
returns a headline benchmark of 1150.4 kg/ha, but that district's row uses
1185.630989 kg/ha and gap 19.6924%. Keep the reference cohort stable, but summarize
the benchmark values attached to displayed rows and expose each peer cohort.
The national median regression fix is real; it does not repair this strategy.

### P2: Farm Record Status Is Not Updated Locally

`apps/mobile/src/database/index.ts:414` marks the outbox and
`harvest_registration` synced, but never updates `local_farm.sync_status`.
The new queue calls this helper for a farm, leaving the stored farm PENDING after
a successful upload. The queue tests mock the helper and therefore do not test
the resulting SQLite row. Make completion/failure/conflict entity-aware and
transactional, and test the database changes after restart.

### P2: Dataset Catalog Advertises Unsupported HTTP Filters

The catalog advertises `geography_level`, `farmer_scale`, district/crop codes and
source identifiers, but the JSON/CSV routers do not declare all of them.
`GET /meta/dataset/crop_productivity?geography_level=DISTRICT` returns 400 while
the same catalog lists `geography_level` as accepted. Either support advertised
dimensions end to end or expose the actual HTTP contract only. Ordinary
indicator/domain filtering is repaired.

### Further Workflow Gaps

- Share-plan helpers preserve partial cases, but the form restores them into
  fixed lower/main/higher controls. Browser coverage is needed to prove the
  restored request does not add or alter cases. Scope mismatches currently warn
  rather than restoring the page filters automatically.
- Python export recomputes the request against current data. It does not bind to
  an expected calculation/dataset version, so a data refresh between Calculate
  and Export can change the downloaded result. Add snapshot parity checks.
- Sequential replay tests do not establish concurrent idempotency. The new farm
  route performs select-then-insert without handling a concurrent unique-key
  race, and queue flushing has no single-flight guard.
- The migration downgrade cannot restore a non-null farmer ID when newly created
  anonymous farms remain. Document/rehearse rollback and ownership backfill.

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
| Mobile Vitest | 346 passed in 26 files; exit 0 |
| Ruff | Passed; exit 0 |
| Web lint and production build | Passed; exit 0; 19 static pages generated |
| Mobile lint | Passed; exit 0 |
| Mobile TypeScript after fresh npm ci | Passed; exit 0 |
| Rendered Planning | Calculation passed at 1440x900, 1920x1080, 768x1024 and 390x844 without document overflow or uncaught page errors |
| Desktop plan workflow | Python CSV downloaded with normal metadata header; outdated-result notice and a full plan-link restoration passed |
| Expanded Dashboard sources | All four disclosures opened at all four viewports; no document overflow |
| Old reproduction suite | Projection empty-history/season/cutoff/case and district-attribution cases now behave correctly |
| New adversarial checks | Wrong crop and swapped periods still accepted; peer KPI and advertised-filter inconsistencies reproduced |

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

Pending an owner decision about promoting the unsecured operational routes,
this increment is prepared on `review/latest-improvements-2026-10-17` rather
than automatically changing the production branch.

## Repository Hygiene

The earlier cleanup removed 27 superseded/generated files. This pass additionally
retires unreferenced prototype `ALGORITHM_DESIGN.md` and `BACKEND_FASTAPI.md`,
whose proposed contracts are superseded by the maintained domain guides. No
official input, migration, test suite or active source file is deleted. Generated
browser captures stay in temporary storage, not the GitHub source tree.
