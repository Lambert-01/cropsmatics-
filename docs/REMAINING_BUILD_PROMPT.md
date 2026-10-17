# Cropmatics Rwanda: Remaining Implementation Prompt

Paste the brief below into the coding agent working in this repository. This is
a remaining-work brief, not an instruction to rebuild working modules.

---

You are the principal engineer for **Cropmatics Rwanda**, an agricultural
decision-support platform for the NISR agricultural productivity challenge.
Work inside the existing repository `Lambert-01/cropsmatics-`.

## 1. Establish The Current Baseline

Read `README.md`, `DOCUMENTATION_INDEX.md`, `docs/CURRENT_STATUS.md`, the existing
domain documentation and `.github/workflows/ci.yml`. Inspect current Git status,
recent commits and all affected code before editing. The latest cleanup replaced
overlapping session reports; do not recreate a pile of competing status files.

The existing system includes real NISR SAS extracts, deterministic ETL,
PostgreSQL/PostGIS canonical analytics, FastAPI services, an intervention engine,
OR-Tools optimization, Next.js dashboards, manual planning, a grounded assistant
and Expo/SQLite offline capture. Preserve these capabilities and existing tests.

First provide a short implementation plan mapping each work package to current
files, acceptance tests and dependencies. Then implement incrementally without
repeated routine confirmation. Recheck the findings below against the current
checkout: a later commit may already have repaired something. Mark each item
implemented, locally verified, CI verified, deployed or externally reviewed only
when evidence supports that specific state.

Do not change production data, repository visibility, licensing or paid build
settings without owner approval. Do not expose secrets in logs or artifacts.
Do not delete official inputs, maintained regression suites or useful
architecture. Avoid unrelated refactors and dependency churn.

## 2. Correct Benchmark And Comparison Scope First

Inspect and modify:

- `services/api/app/services/analytics_service.py`
- `services/api/app/analytics/productivity_gap.py`
- `services/api/app/services/map_service.py`
- `services/api/app/services/dashboard_service.py`
- Related productivity, reports and assistant adapters if they transform values
- `services/api/tests/test_productivity_gap.py`
- `services/api/tests/test_yield_intelligence.py`
- `services/api/tests/test_provenance_and_availability.py`

Reproduce the confirmed maize/2026B defect: all-district results give Bugesera
observed yield about 952.1516 kg/ha, national benchmark about 1159.1443 and gap
about 17.8574%. Selecting Bugesera in `productivity()` changes its benchmark to
its own yield and its gap to zero. The map and priority engine still use the
larger reference population. These are conflicting answers to the same question.

Separate reference-population filters from display filters. Compute each named
benchmark over its declared comparable crop/period/geography cohort, then apply
the district inspection filter. Respect intentional province/cohort strategies;
do not simply remove every geography filter. Return reference scope and sample
size in a consistent contract. Keep single-crop yield distinct from crop-mix
aggregate output per harvested hectare.

Also fix `_mean_yield_for`: replacing period 2026B with 2025B while retaining
`year=2026` drops valid previous-year observations. Derive a coherent tuple or
use a single authoritative period selector for the comparison query.

Acceptance tests must use HTTP query strings the frontend actually emits,
including `year`, `season` and `period_code`. Verify stable benchmarks when
inspecting one district; observed/benchmark/gap agreement across KPI, map,
ranking, report and assistant; previous-year availability with year+season
present; and explicit missing comparisons when the source really lacks data.
Use source-derived expected values in tests, not hardcoded UI statistics.

## 3. Repair Manual Projection Edge Cases

Modify:

- `services/api/app/services/manual_projection_service.py`
- `services/api/app/analytics/manual_projection.py`
- `services/api/app/schemas/manual_projection.py`
- `services/api/app/api/v1/scenarios.py`
- `services/api/tests/test_manual_projection.py`
- `services/api/tests/test_manual_projection_contract.py`
- `services/api/tests/fixtures/manual_projection_contract.json`

Repair all of these confirmed cases:

1. A Wheat/Bugesera/Season C personal production plan, origin 2025C, assumed
   yield 1000 kg/ha and area 2 ha can index `observations[-1]` on empty history
   and return HTTP 500. Handle the absent history explicitly: either permit a
   clearly assumed origin or return a structured validation refusal.
2. Without an origin, the same Season C plan can choose globally latest 2026B
   and project 2027B while echoing season C. Origins and targets must agree with
   the requested season. Distinguish a user planning period from a published
   observation period; do not imply unpublished observations exist.
3. A personal plan anchored in 2023B includes later observations in its evidence
   window despite a cutoff warning. Restrict computation/evidence/export to the
   declared cutoff, or explicitly label any separate later context so it cannot
   masquerade as contemporaneous evidence.
4. Case ordering is checked only when lower/main/higher all exist. Validate
   every present ordered pair, reject misleading partial cases, and test negative
   assumptions and zero baselines.

Keep strict request schemas, finite-number checks, unit conversion, deterministic
arithmetic and stateless operation. Test every edge through the real route as
well as pure arithmetic. No supported input may produce an unhandled 500.

## 4. Finish The User Planning Workflow

Modify:

- `apps/web/features/yield-intelligence/ManualProjectionWorkspace.tsx`
- `apps/web/lib/manualProjection.ts`
- `apps/web/lib/api.ts`
- `apps/web/services/hooks/useAnalytics.ts`
- `apps/web/types/index.ts`
- `apps/web/app/yield-intelligence/page.tsx`
- Relevant web tests and backend report/export services

Add an origin selector based on actual coverage, clear planning target controls
and lower/main/higher comparison when requested. Show observed baseline and
user-assumption projections as distinct series. Mark old results outdated when
inputs change; show the applied scope and assumptions of the displayed result.
Keep initial content compact and move optional detail into disclosures.

Implement save/restore/share in a documented, privacy-conscious manner. A
stateless share URL or versioned local plan is acceptable for an MVP; do not
pretend local storage is cross-device server persistence. Validate restored
plans and reject unsupported versions rather than silently changing their
meaning. Never store a personal plan in official observation tables.

Provide a Python-generated export using the existing report architecture.
Include calculation/plan identifier, dataset and method versions, crop,
geography, origin/target, metric, unit, assumption case, compounding choice,
value kind, source and complete assumptions. Use a normal CSV header, not a
prose comment before the header. Test the downloaded content and filter parity.

No forecast should be invented. Label the workflow **Plan next season** or
**Your assumptions**. A validated model forecast remains a separate product and
stays withheld when its publication criteria fail. Do not weaken validation to
make a forecast card look populated.

## 5. Close AI Attribution Bypasses

Inspect and modify:

- `services/api/app/ai/claim_guard.py`
- `services/api/app/ai/output_validator.py`
- `services/api/app/ai/evidence.py`
- `services/api/app/ai/evidence_builder.py`
- `services/api/app/ai/entity_resolver.py`
- `services/api/app/ai/grounded.py`
- `services/api/app/ai/schemas.py`
- `services/api/app/api/v1/assistant.py`
- `services/api/tests/test_ai_claim_guard.py`
- `services/api/tests/test_ai_claim_eval.py`
- `docs/14_AI_ASSISTANT.md` and `docs/submission/AI_EVALUATION.md`

The current heuristic guard is useful but not complete. Add regression cases:

- Evidence contains only Bugesera maize yield 952.2; an answer assigns 952.2 to
  Nyagatare. Unknown-in-evidence does not mean a recognized district may escape
  validation. Resolve entities against the full canonical geography dictionary.
- Evidence contains Bugesera 952.2 and Nyagatare 1555.4; one sentence swaps both
  values. Sentence-wide membership must not validate either wrong pairing.

Bind each quantitative claim to entity, crop, metric, period, unit and a specific
retrieved evidence item. Prefer structured claims with evidence IDs and
deterministic rendering where reliable prose extraction is not feasible. Merely
adding more words to a regex or accepting any matching entity in a sentence is
not sufficient. Reject or safely fall back on ambiguous or unverifiable claims.
Retain tests requiring correct claims to pass, so rejecting everything is not
mistaken for safety.

Keep optional OpenAI/provider access backend-only. Check current official API
documentation when changing provider contracts. Preserve read-only tool
allowlists, citations, rate/time/tool budgets, deterministic fallback and
validation after translation. Do not claim Kinyarwanda semantic validation from
digit checks. Credentialed model tests, when authorized, must record results and
cost/latency without exposing keys or private operational records.

## 6. Make Mobile Synchronization Lossless

Inspect and modify:

- `apps/mobile/src/sync/queue.ts`
- `apps/mobile/src/database/` schemas, repository and outbox code
- Harvest/farm request types and registration screens under `apps/mobile/`
- `services/api/app/schemas/harvest.py`
- `services/api/app/api/v1/harvests.py`
- `services/api/app/models/harvest.py` and `models/farm.py`
- Farm routes/schemas/services as required by the existing architecture
- `services/api/alembic/versions/` with a new additive migration
- Mobile sync tests and API database-backed contract tests

The client sends farm UUID, harvest start/end, latitude/longitude, notes and
storage-assistance intent that the current backend can silently discard. The
farm queue branch marks a record synced without uploading it. Repair the whole
contract, not just the client status text.

Require server acknowledgment before marking cloud persistence. Sync farms
before dependent harvests; preserve local UUIDs; enforce authenticated ownership;
upsert/retry idempotently; and retain failed work in the queue. Unsupported
fields should trigger an explicit contract error rather than disappearing.
Preserve supported quantities, units, dates, location, notes and assistance intent
through a database round trip. Define photo/attachment status honestly: a local
file is not a server-uploaded photo.

Test offline creation, app restart, network interruption after server write,
retry, duplicate UUID, unauthorized farm reference, partial failure and reconnect.
Never run those writes against production test accounts without approval.

## 7. Complete Source Decisions And Number Traceability

Inspect and modify the relevant builders, not raw sources:

- `scripts/data/inventory_sas_workbooks.py`
- `scripts/data/ingest_sas_tables.py`
- `scripts/data/sas_table_map.py`
- `scripts/data/build_crop_productivity.py`
- `scripts/data/build_national_trends.py`
- `scripts/data/build_manifest.py`
- Existing practice/post-harvest builders and validation reports
- `services/api/app/repositories/canonical_repository.py`
- Canonical models/loader only if lineage storage requires it
- `docs/data/SAS_COVERAGE_AUDIT.md`
- New `docs/data/SAS_SOURCE_PRECEDENCE.md`
- `docs/submission/DATA_CARD.md`
- `docs/submission/DATA_TO_NUMBER_TRACEABILITY.md`

Compare the two distinct standalone 2025B workbooks with the annual release.
Record hashes, overlapping keys, differences and the defensible precedence
decision. Do not silently discard conflicts or edit official values. If original
workbooks are unavailable in the agent environment, state the blocker and retain
the unresolved decision rather than inventing a review.

Review all worksheet dispositions. The existing inventory records 134 used,
304 unmapped and two metadata entries: justify exclusions individually or in
well-defined source families; not every sheet belongs in the analytical panel.
Investigate national subtotal semantics before mapping labels such as S/Total
to a national total. Never mix district sums and official national observations
without documenting comparability and the aggregation rule.

Implement per-metric lineage or a deterministic sidecar resolver: source
workbook/release, sheet/table, row/cell, source value/unit, transformation,
processed observation and API metric. A row-minimum field alone is not exact
cell lineage. Expose a compact identifier in normal UI, with the full evidence
reachable in Transparency and exports.

Publish all relevant quality issue types with affected observations and review
status. Existing warnings, including yield/area discrepancies, must not disappear
because a page prefers fewer words. Distinguish source rounding, parser errors,
known methodological differences and unresolved issues. Rebuild twice and prove
determinism. Do not change raw files or manufacture missing records.

## 8. Preserve Intervention Methodology And Explanations

Inspect:

- `services/api/app/analytics/intervention_priority.py`
- `services/api/app/analytics/priority_scenario.py`
- `services/api/app/services/analytics_service.py`
- `ml/src/models/intervention_priority.py`
- `apps/web/features/interventions/PriorityRanking.tsx`
- Existing priority, eligibility, scenario and component tests
- `docs/11_INTERVENTION_ENGINE.md`

Methodology 2.0.1 eligibility is already implemented. Preserve the distinction
between productivity-shortfall support and production-scale importance. An
above-benchmark district must not become a high productivity-shortfall priority.
Missing readiness/cost stay unavailable; redistributed weights remain visible.

Carry explanation fields such as `shortfall_pct`, `purpose` and `reference_n`
through scenario ranking projections rather than dropping them in `_rank_rows`.
Keep rank determinism, positive-gap monotonicity and reference invariance tested.
Keep API and standalone ML behavior aligned; extract a shared package only if
the repository structure can support it without unnecessary migration risk.

## 9. Repair Maps, Sources And Explorer HTTP Contracts

Modify:

- `apps/web/features/maps/colors.ts`, `MapLegend.tsx`, `RwandaDistrictMap.tsx`
- `apps/web/components/ui/SourceDisclosure.tsx`
- `apps/web/features/dashboard/CanonicalTrendChart.tsx`
- `apps/web/lib/preferences.ts` where migration policy needs clarification
- `services/api/app/api/v1/data.py`
- `services/api/app/services/dataset_service.py`
- `apps/web/features/data-explorer/DataTable.tsx`
- Related hooks/types and route-level tests

Fix negative-side interpolation: under domain [-50,20], -40 and -10 must not
collapse to the same green. Test multiple interior values, zero continuity,
asymmetric and one-sided domains. Make legend stop positions match the actual
fill normalization. Keep no-data and flat-range states explicit, units visible
and metric semantics correct; quantity is not automatically good or bad.

Expanded source detail must wrap without increasing document width. Test long
source identifiers at every viewport with every disclosure open. Use readable
short labels and accessible full detail, not global overflow clipping. Preserve
deliberate user preferences; document uncertainty around inherited old defaults.

The Explorer router currently ignores supported service dimensions. Expose
dataset-appropriate indicator/domain filters end to end, reject or explicitly
handle unsupported parameters, and test a nonexistent indicator through HTTP.
Ordinary text search must be literal: searching `[` must never become a regex
server error. Test punctuation, Unicode, empty results, sort, pagination and
full filtered CSV exports.

## 10. Finish The Dedicated Web Workflows

Inspect and refine:

- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/yield-intelligence/page.tsx`
- `apps/web/app/interventions/page.tsx`
- `apps/web/app/maps/page.tsx`
- `apps/web/app/reports/page.tsx`
- `apps/web/app/data-explorer/page.tsx`
- `apps/web/app/transparency/page.tsx`
- `apps/web/app/settings/page.tsx`
- Existing feature components, layout, filters and translations

Keep Overview focused on a map, top findings, a ranking and a trend. Move detailed
analysis to dedicated pages. Keep Yield Intelligence's four current workspaces
and working legacy aliases unless usability evidence supports another change;
do not restore a long strip of overlapping tabs. Separate manual planning from
the full intervention scenario lab instead of stacking everything on one page.

Use one authoritative period control per page. Offer all available history
where meaningful, but never add production across seasons and label it a single
season or average unrelated crop yields. Missing district coverage must explain
the limitation before any explicit national fallback.

Maps needs coverage-aware controls, meaningful legends, clickable districts,
keyboard-accessible list/table alternatives and synchronized inspection/report
links. Reports needs preview, scope/period/source metadata, Python-generated
downloads and clear separation between official analytics and user plans.
Explorer needs grouped current/archive/program/reference datasets, supported
filters and current-data metadata. Transparency needs compact Sources, Coverage,
Quality, Methods and Models sections with every warning reachable. Settings
needs meaningful grouping, tested preference effects and dataset/service status.

Use existing semantic design tokens and components. Keep the work-focused layout
dense but organized, chart frames stable and text short. Show metric, unit,
geography, period and source for each chart without dumping technical paragraphs
into the first viewport. Put methodology in accessible disclosures rather than
deleting it. Use icons, tooltips, semantic controls and responsive table layouts.
Preserve already loaded charts during background refetch while showing a small
refresh state. Include retryable error, no-data, partial-coverage and slow states.
Keep Markets out of the primary demo flow while attributable prices are absent.

## 11. Finish Native Mobile, Not Just Mobile Web

Inspect `apps/mobile/app/`, `src/components/`, `src/services/`, `src/database/`,
`src/sync/`, translations, navigation and tests. Follow the existing Expo Router
architecture. Mobile uses its own `package-lock.json` and `npm ci`, not the pnpm
web workspace. The cleanup already declared `@types/react-dom`; preserve that
clean-install fix instead of relying on root dependencies.

Refine Home, Analyze, Compare, Maps, Ask, harvest registration and sync status.
Maps must support district tap selection and an accessible alternative. Compare
must align crop/period/metric selections and missing coverage before showing
charts. Keep Ask reachable in bottom navigation without crowding tab targets.
Use understandable labels in EN/RW, stable loading layouts and filters wherever
the backend supports them. Manual plans on mobile must call Python rather than
reimplement the engine in React Native.

Do not claim an APK exists merely because EAS configuration exists. With owner
authorization, build the `release-apk` profile against the hosted Render API,
verify the embedded base URL, record the artifact/build identifier and publish
only an approved install link. Never place credentials in public Expo variables.

## 12. Verification And Evidence

Run focused tests after each package, then the complete gates. Use the actual
installed virtual environment; do not assume every developer uses a root
`.venv`. Preserve true exit codes and do not hide failures with `tail` or `grep`.

```bash
python scripts/data/run_all.py
python scripts/data/check_idempotent_build.py
ruff check services/api/app services/api/tests ml scripts
pytest services/api/tests scripts/tests ml -q
pnpm --filter cropmatics-web lint
pnpm --filter cropmatics-web typecheck
pnpm --filter cropmatics-web test
npm --prefix apps/mobile ci
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile test
NEXT_PUBLIC_API_BASE_URL=https://cropsmatics-api.onrender.com/api/v1 pnpm --filter cropmatics-web build
python scripts/verify_production.py
```

Also run canonical integration against a disposable PostGIS database using
`CANONICAL_TEST_DATABASE_URL`. Never substitute the production database. Keep
GitHub's full job matrix; verify the actual run and exact commit SHA after an
authorized push. Do not mark a run passed while it is queued or incomplete.

Exercise `/dashboard`, `/productivity`, `/interventions`, `/post-harvest`,
`/storage`, `/maps`, `/yield-intelligence`, `/reports`, `/data-explorer`,
`/transparency`, `/settings`, `/assistant` and `/install` at 1440x900,
1920x1080, 768x1024 and 390x844. Include normal, slow, error, empty and partial
coverage states in EN and RW. Test expanded disclosures, chart resize, real
downloads, URL restoration, filter propagation and keyboard journeys. Run
automated accessibility checks and examine screenshots, not just HTTP 200 HTML.

Physical Android verification must include maps, Compare, Ask, offline harvest,
restart and reconnect-to-server persistence. Record device/OS/network/build and
actual pass/fail evidence. Obtain native-speaker Kinyarwanda review. Mark external
review blocked if no reviewer or device is available; do not simulate a sign-off.

Update only the authoritative documents and relevant domain/submission evidence:

- `docs/CURRENT_STATUS.md`
- `docs/REMAINING_BUILD_PROMPT.md` as work is completed
- `docs/PRODUCTION_READINESS.md`
- `docs/submission/UX_VERIFICATION.md`
- `docs/submission/DATA_CARD.md`
- `docs/submission/DATA_TO_NUMBER_TRACEABILITY.md`
- `docs/submission/AI_EVALUATION.md`
- Domain methods and data coverage docs when contracts change

Generated test reports belong in ignored artifact directories or CI artifacts,
not committed one-off snapshots. Keep maintained tests in version control.

## Definition Of Done

No reproduced correctness defect above remains without an explicit unresolved
status. Each repaired issue has a focused regression test and passing relevant
integration checks. Every displayed analytical figure can be traced from UI to
API, Python service, canonical/processed row and source table. Every user plan
carries assumptions, scope and versions and cannot be mistaken for official data
or a validated forecast. Mobile synced status means the complete supported
record actually exists on the server. The assistant cannot pass the demonstrated
wrong-entity cases. Maps, filters, exports and error states work in a rendered
browser and on the claimed device targets.

Finish with a concise report of files changed, commands and true results,
remaining blockers, exact CI/deployment status and required owner actions. Do not
invent judging scores, 100% completion, native review or deployment success.
