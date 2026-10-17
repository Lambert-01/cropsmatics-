# Cropmatics Rwanda: Updated Remaining-Work Prompt

Use this brief with a coding agent in `Lambert-01/cropsmatics-`. It replaces the
previous brief whose benchmark, projection and Explorer findings are now partly
repaired. Read the current code rather than replaying old fixes.

---

You are the principal engineer for Cropmatics Rwanda. Finish the remaining work
incrementally in the existing repository. Do not rebuild the app from scratch,
delete working tests or raw sources, invent statistics, or claim production
completion from a green unit suite.

## 1. Audit And Preserve The New Baseline

Read `README.md`, `DOCUMENTATION_INDEX.md`, `docs/CURRENT_STATUS.md`,
`.github/workflows/ci.yml`, the relevant domain documentation and current Git
status. Write a short file-level execution plan before code edits. Reproduce
the findings below and update their status only with evidence.

Preserve these newly implemented repairs:

- Reference-before-display filtering for national median benchmarks across
  productivity, overview, heatmap and scorecard.
- Correct previous-year probes when current year/season query fields exist.
- Empty-history personal plans, same-season origins and restricted historical
  evidence windows; validation of inverted partial assumption cases.
- Origin-options API, planning origin selector, assumption-band chart series,
  outdated-result warnings, versioned plan links and Python CSV generation.
- Canonical district recognition and rejection of the previous district swaps.
- Literal Explorer search, indicator/domain HTTP filters and shared JSON/CSV
  selection logic.
- Negative gap interpolation and zero-positioned diverging legend stops.
- Scenario explanation fields and API/ML explanation parity tests.
- New farm upload, additional harvest persistence, additive migration and queue
  acknowledgment after server response.

Preserve official/operational data separation, priority methodology 2.0.1
eligibility, missing-component weight redistribution, OR-Tools constraints,
offline UUIDs, SQLite, EN/RW architecture, canonical dataset-version enforcement
and honest forecast publication policy. Mobile uses its own npm lockfile, not
the pnpm web workspace. Its declared React DOM types must not be removed.

## 2. Release Blocker: Secure Operational Ownership

Inspect and modify:

- `services/api/app/api/v1/farms.py`
- `services/api/app/api/v1/harvests.py`
- `services/api/app/api/deps.py`
- `services/api/app/models/farm.py`, `models/harvest.py`, relevant user models
- `services/api/app/schemas/farm.py`, `schemas/harvest.py`
- `services/api/alembic/versions/` and existing migration
  `f1c9d4a7e2b6_mobile_offline_sync_fields.py`
- `apps/mobile/src/services/api.ts`, shared client and secure credential storage
- `apps/mobile/src/sync/queue.ts` and registration/account flows
- `services/api/tests/test_farm_sync.py` and database-backed security tests

The new farm route accepts uploads without login, stores `farmer_id=None`,
replays records through a globally supplied client UUID and links matching
harvests without ownership. Harvest read/risk routes are also unscoped. The
mobile request helper sends no bearer token. Not returning coordinates does not
make anonymous storage and cross-record linking safe.

Implement authenticated ownership end to end, or explicitly design and review a
device-identity protocol with equivalent isolation. Do not merely add backend
authentication and leave mobile unable to sync. Keep public aggregate analytical
reads available; individual farms and harvests require appropriate access.
Enforce ownership during create, lookup, replay, linking and risk access. Do not
accept another account's farm UUID. Scope idempotency to identity and validate
that a repeated UUID describes the same intended record; conflicting payloads
must not silently receive a successful acknowledgment for different data.

Use protected mobile credential storage and explicit expired-session states.
Keep GPS optional and consent-aware. Reject unsupported field names instead of
silently discarding them. Define whether a photograph is device-only, queued or
actually uploaded; never label local files as cloud-backed.

Test anonymous requests, account A/B isolation, unauthorized farm references,
expired credentials, retry after a lost response and concurrent duplicate
requests. Handle unique-key races with transactional upsert or safe recovery;
select-then-insert alone does not prove concurrent idempotency. Rehearse the
migration and ownership backfill in disposable PostGIS. The downgrade currently
cannot restore NOT NULL while anonymous farms remain; provide a documented,
tested rollback strategy without deleting real records casually.

## 3. Release Blocker: Bind AI Claims To Crop And Period

Inspect and modify:

- `services/api/app/ai/claim_guard.py`
- `services/api/app/ai/output_validator.py`
- `services/api/app/ai/evidence.py`, `evidence_builder.py`, `entity_resolver.py`
- `services/api/app/ai/schemas.py`, `grounded.py`
- `services/api/app/api/v1/assistant.py`
- `services/api/tests/test_ai_claim_guard.py`, `test_ai_claim_eval.py`
- `docs/14_AI_ASSISTANT.md`, `docs/submission/AI_EVALUATION.md`

The earlier district cases are fixed. Add these newly reproduced failures:

1. Evidence: Bugesera, Maize, 2026B, yield 952.2 kg/ha. Wrong answer: "Rice yield
   in Bugesera was 952.2 kg/ha in 2026B." Current validation accepts it because
   crop vocabulary comes only from the evidence/request.
2. Evidence: Bugesera maize yield 952.2 in 2025B and 1555.4 in 2026B. Wrong
   answer: "In Bugesera maize yield was 1555.4 kg/ha in 2025B and 952.2 kg/ha in
   2026B." Current sentence-wide period membership accepts the swapped pairs.

Recognize crops against the full canonical dictionary and bind each claim to
its specific crop, geography, metric, period, unit and evidence ID. Prefer
structured claims and deterministic rendering where prose cannot be validated
reliably. Adding another sentence-wide vocabulary check is not sufficient.
Reject or fall back on ambiguous pairings; preserve positive controls so
rejecting everything cannot count as success. Include aliases, multi-clause
statements, translated answers and missing dictionary behavior. Do not fail open
silently when a required dictionary cannot be loaded.

Keep provider access backend-only, tools read-only and allowlisted, citations
retrieved, budgets bounded and fallback observable. Verify provider contracts
against current official documentation when changing them. Do not claim actual
provider quality from mocked transports or Kinyarwanda semantic accuracy from
digit checks. Never invent yields, prices, capacity, accuracy or future outcomes.

## 4. Make Peer Benchmark Headlines Match Displayed Rows

Modify `services/api/app/services/analytics_service.py`, relevant response
models and tests in `test_yield_intelligence.py`, `test_productivity_gap.py` and
report/map contracts.

With Maize/Bugesera/2026B and `agro_ecological_peer_group`, the district row's
benchmark is 1185.630989 kg/ha and its gap is 19.6924%, but the benchmark KPI is
1150.4 because it takes a median over the entire reference population.

Keep gap calculation on the full declared reference cohort, then summarize the
benchmark attached to the displayed district(s). Do not reintroduce the original
self-benchmark bug to make the KPI match. Return cohort metadata that accurately
describes each strategy, including peer groups. Test all benchmark strategies,
province filtering, selected districts, missing rows, maps, exports and assistant
evidence. Preserve the corrected national median and year-on-year regressions.

## 5. Complete Real SQLite Sync State

Modify `apps/mobile/src/database/index.ts`, relevant database/schema helpers,
`apps/mobile/src/sync/queue.ts` and mobile sync/database tests.

`markSynced` currently updates outbox and harvest rows only. A farm upload calls
it, but the persisted `local_farm.sync_status` remains PENDING. Make successful,
failed and conflict completion entity-aware and transactional. Test actual SQL
state, not only mocked calls to `markSynced`. Restart and reload the farm after
upload; it must retain the correct status. Add a single-flight flush guard and
reconnect tests so background and manual flushes cannot race blindly. Never
acknowledge cloud persistence without the complete server acknowledgment.

## 6. Align Dataset Metadata With The Actual HTTP Contract

Modify `services/api/app/services/dataset_service.py`,
`services/api/app/api/v1/data.py`, `api/v1/reports.py`, dataset schemas,
`apps/web/features/data-explorer/DataTable.tsx`, catalog UI and related tests.

The catalog advertises geography level, farmer scale, codes and source filters
that HTTP rejects as unknown. Either support each advertised dimension in JSON
and CSV or advertise only the dimensions that actually work. Add a contract test
for every advertised filter, not just indicator/domain. Keep unsupported filters
explicit, literal punctuation safe and CSV scope/sort identical to JSON.

Complete grouped current/archive/program/reference browsing, meaningful selector
options and metadata. Free-text boxes with unknown exact codes are not a finished
researcher workflow. Keep every source dataset reachable without creating one
primary navigation tab per release.

## 7. Finish Plan Restoration And Export Integrity

Inspect `apps/web/features/yield-intelligence/ManualProjectionWorkspace.tsx`,
`apps/web/lib/manualProjection.ts`, API hooks/types and the projection service,
schema and report exporter.

Test real browser restoration, including partial assumption cases. The parser
accepts partial sets, but the form uses a fixed three-case builder; either restore
the exact cases or explicitly refuse an unsupported form without adding defaults
silently. Handle share-link/page-scope mismatches predictably, and do not replace
a restored origin without an explicit decision when it changes the plan.

Export currently recomputes the saved request against whatever dataset is current.
Bind exports to the displayed calculation ID/dataset version or explicitly reject
a changed snapshot and request recalculation. Test Calculate, a controlled data
version change, and Export; it must not silently download different values.
Preserve the new Python-generated header, complete assumptions and value kinds.
Keep assumptions separate from observed baselines and validated forecasts.

Refine the Planning screen's density: avoid stacking a complete intervention lab,
forecast explanations and all methodology under a simple assumption builder.
Keep optional detail discoverable, concise and accessible. Finish EN/RW copy.

## 8. Finish The Data Evidence, Not Just Its Documentation

Inspect the existing pipeline, source registry, inventory and canonical loader.
Relevant files include `scripts/data/inventory_sas_workbooks.py`,
`ingest_sas_tables.py`, `sas_table_map.py`, productivity/national builders,
`build_manifest.py`, repository adapters and canonical models.

Resolve the two standalone 2025B workbook variants against annual sources using
hashes, overlapping keys and machine-readable differences. Add
`docs/data/SAS_SOURCE_PRECEDENCE.md` only after a real review. If workbooks are
unavailable, record the blocker rather than inventing a decision.

Review worksheet dispositions (currently 134 used, 304 unmapped, two metadata),
justify exclusions and national subtotal semantics, and add per-metric cell/row
lineage or a stable sidecar resolver. A minimum row number is not exact lineage
for values combined from several tables. Connect UI metric IDs through API,
Python, canonical/processed observations and source workbook/table/cell.

Keep all source quality flags, affected keys and review status visible in
Transparency and appropriate exports. Do not edit raw official values to make
warnings disappear. Rebuild twice to prove determinism. Update the coverage
audit, data card and traceability evidence honestly. The corrected coverage
matrix distinguishes 2022-2026 productivity, 2024-2026 long-form practice and
post-harvest data, and legacy 2025B factors; preserve that distinction.

## 9. Finish Web And Native UX Acceptance

Dedicated `/maps`, `/reports`, `/transparency` and `/settings` workflows still
need the requested page-level refinement. Inspect existing components before
adding abstractions. Reports needs previews, applied filters and self-describing
downloads; Maps needs coverage-aware controls, clickable districts and keyboard
alternatives; Transparency needs compact source/quality/method/model sections;
Settings needs clear groups, real effects and service/data status.

Keep Overview focused, four Yield Intelligence workspaces shareable and one
authoritative period control per page. Use short user-facing labels, chart units,
geography/period/source context and optional technical disclosures. Preserve
loaded content during refetch. Test slow, error, empty and partial coverage
states. Wrapping must work with sources expanded, not via global clipping.

Complete native Analyze, Compare, Maps and Ask design/filters without breaking
SQLite or query contracts. Native mobile still lacks manual planning integration
and a complete device-tested synchronization journey. Tap selection and
accessible alternatives must work on a phone. Do not confuse mobile-web captures
with native evidence. Obtain a real approved APK link only after an authorized
EAS build against the hosted API and device verification.

## 10. Verification And Release Rules

Run focused regressions after each work package and then full lint, TypeScript,
pytest, Vitest, data rebuild/idempotency and Next.js production build. Use true
exit codes; do not mask failures with output filters. Run mobile from its own
fresh `npm ci` installation. Keep the full CI job matrix and verify the exact
GitHub commit, not an earlier green baseline.

Canonical and migration tests require disposable PostGIS through
`CANONICAL_TEST_DATABASE_URL`; never use production. Test ownership and sync
against real constraints, not only SQLite geometry stubs. Preserve all tests.

Exercise important routes at 1440x900, 1920x1080, 768x1024 and 390x844 in EN/RW,
including expanded sources, downloads, URL restoration, keyboard journeys and
accessibility scans. Record a real Android model/OS/build/network for map,
Compare, Ask, offline registration, restart and reconnect tests. Obtain native
Kinyarwanda review. Missing reviewers/devices are explicit blockers, not passes.

Do not auto-promote an unsafe operational change merely to obtain a main-branch
CI run. Use the owner's selected branch/deployment policy, disclose known risks
and distinguish pushed, CI-verified and deployed. Do not change visibility,
production data, secrets or paid build settings without approval.

Maintain `docs/CURRENT_STATUS.md`, this remaining brief, the release checklist
and relevant domain/submission documents. Do not create overlapping session
reports or commit generated test snapshots. Finish with exact files, commands,
true results, unresolved blockers and deployment evidence. No invented judging
score, causal gains or 100% completion claim.
