# Cropmatics Rwanda: Complete the Remaining Implementation

You are the principal engineer, agricultural data scientist, product designer, and release engineer for Cropmatics Rwanda.

Repository: https://github.com/Lambert-01/cropsmatics-

Competition: https://statistics.gov.rw/about/hackathon/2026-hackathon-competition

Implement the remaining work described below in the existing repository. Inspect the current branch and code first, then implement and verify incrementally. Produce working changes, tests, screenshots where possible, and honest completion documentation. Do not stop after writing recommendations.

## Updated Baseline After Integration Repairs: 2026-10-15

Read docs/FORECAST_INTEGRATION_REPAIR_REPORT.md first. Earlier audits record the pre-repair state and are not a list of current defects.

Preserve the existing dirty working tree. Quote the checkout path "/Users/apple/Desktop/cropmatics " because it has a trailing space. Do not rename it or revert unrelated changes.

Already implemented and tested:
- Methodology 2.0.1 priority scoring fixes and strict scenario/slider request contracts.
- Production API URL validation and recoverable request errors.
- Request-local OpenAI Responses function-call/output history translation, preserved native reasoning output, bounded tool execution and existing deterministic fallback.
- Correct /v1 endpoint instructions and runtime httpx dependency.
- Scoped Python forecast-status by crop, canonical season, district and province consistency; per-district values never fall back to target medians or national values.
- Explicit target metadata in regenerated backtest reports. Older known reports are read through a server-side compatibility adapter; clients no longer parse target IDs.
- Forecast intervals, model/source/scope and withholding reasons travel through assistant evidence; evidence IDs remain distinct across district lookups.
- Web forecast filters drive real requests and visible results; forecast access is independent of district overview success.
- Mobile forecast filters, initial error/retry and offline/cached states, backend interval levels, concise copy and source details.
- New Python regression, web/mobile rendered-component and desktop/mobile-web Playwright coverage.
- Docker/CI generate the forecast publication report. A fresh Docker build and actual GitHub execution still need external verification.

Verification is recorded with exact results in the repair report. Do not copy old failing-test counts from the pre-repair audit. The checked-in/generated scientific decision remains serves_forecast=false; no forecast target was made publishable by relaxing a gate.

Do not recreate the fixes above. Sections 3-5 and already implemented portions of 7-8 below are regression criteria, not instructions to build duplicate systems.

Prioritize genuinely remaining work:
1. Credentialed provider smoke tests and model-option compatibility using protected backend configuration, never client secrets or keys pasted into chat.
2. Complete claim-level semantic validation (metric, unit, crop, geography, period, direction and citations); an allowlist of digits alone is not complete factual validation.
3. Disposable PostGIS integration tests, fresh Docker build/runtime verification, clean ETL idempotency and actual GitHub Actions evidence.
4. Artifact/dataset version compatibility and appropriately attributable historical extension if future forecasting is pursued; preserve current suppression.
5. Remaining compact web/mobile visual work, real-phone/emulator interaction and offline restart/reconnect sync verification. Native Kinyarwanda review remains pending.
6. Authorized release to Render/Vercel and a fresh EAS build, followed by live version/behavior checks. Do not push or deploy without permission.
7. Remaining operational, stakeholder/demo and documentation requirements from the detailed brief.

Use existing modules including ForecastWorkspace.tsx, PredictionsSection.tsx, PredictionsWorkspace.tsx, ForecastPanel.tsx, meta_service.py and the existing AI provider/agent/evidence pipeline. Mark each requirement implemented, needs repair, unimplemented or externally unverified before editing. Deliver focused code and evidence, not a blanket "100% complete" claim.

## 1. Product Objective and Working Rules

Build a reliable, visually polished agricultural decision tool for NISR Track 1: Agricultural Productivity.

The central user journey is:

1. A planner selects a crop and season.
2. Cropmatics identifies districts with productivity shortfalls.
3. The planner examines trends, associated practices, and evidence quality.
4. The planner compares transparent investigation priorities.
5. A cooperative or farmer registers a harvest through the offline mobile app.
6. Python returns a transparent risk assessment and, where inputs support it, a storage allocation scenario.
7. OpenAI explains the retrieved evidence in concise, accessible language.
8. Validated predictive models supply forecast values and uncertainty when the evidence supports publication.

Primary users: agricultural planners, extension teams, and cooperative coordinators. Farmer-facing operational features must use simple language and avoid treating district aggregates as personalized farm advice.

Rules:

- Extend existing modules and established contracts. Preserve working architecture.
- Follow repository instructions and preserve unrelated user changes.
- Do not replace the current data pipeline, SQLite sync architecture, GIS boundaries, analytical algorithms, or evidence system without a demonstrated defect and focused migration.
- Python computes statistical results, model predictions, priorities, and optimization outputs. Clients render and interact.
- Never hardcode believable demonstration statistics into production interfaces.
- Keep official statistics, derived analytics, predictions, user inputs, and hypothetical scenarios distinguishable.
- Keep missing data null. Capacity unknown is not zero.
- Use association language for observational results. Benchmark shortfalls are not guaranteed recoverable yield.
- Write concise product copy. Retain information needed to interpret evidence correctly.
- Finish independent work when credentials, devices, or stakeholder participation are unavailable. Record exact external blockers.
- A high judging score cannot be guaranteed. Deliver evidence against each published criterion.

## 2. Audit Before Editing

Read AGENTS.md and inspect:

```text
README.md
DOCUMENTATION_INDEX.md
Makefile
package.json
pnpm-workspace.yaml
apps/web/
apps/mobile/
services/api/
ml/
scripts/data/
scripts/verify_production.py
data/source_registry/
data/raw/nisr/sas/
data/dictionaries/
docs/
infra/
.github/workflows/
render.yaml
.env.example
```

Record branch, commit, dirty files, production URLs, package manager boundaries, existing AI provider settings, current API contracts, data authority, and tests. Do not print secrets.

The prior assessment found a synchronized production dataset with 14 productivity periods, 6,156 panel rows, 30 districts, and content version 0.2.0-646a72d53cd349df. These are dated baseline observations, not constants to bake into code. Recheck current data and derive counts from the manifest and database.

Known live URLs, subject to verification:

```text
Web: https://cropsmatics-web.vercel.app
API: https://cropsmatics-api.onrender.com/api/v1
Install: https://cropsmatics-web.vercel.app/install
```

Read and update the existing docs/REMAINING_IMPLEMENTATION_PLAN.md before new code changes. Map each requirement to existing files, proposed edits, dependencies, tests, and acceptance conditions. Then continue implementation without repeated requests for routine confirmation.

## 3. Fix Reported Connection Failures First

User-observed errors:

```text
net::ERR_NAME_NOT_RESOLVED
  /analytics/canonical-trend
  /analytics/input-adoption
  /maps/district-metrics
  /facilities/context
  /dashboard/overview
  /analytics/intervention-priorities

net::ERR_CONNECTION_CLOSED
  /maps/district-metrics?metric=input_adoption

HTTP 422
  POST /scenarios/priority
```

DNS resolution failure occurs before an HTTP response. These messages alone do not establish a backend bug, CORS failure, or database mismatch. Diagnose each failure independently.

Inspect and extend:

```text
apps/web/lib/api.ts
apps/web/services/hooks/useAnalytics.ts
apps/web/next.config.mjs
apps/web/components/ui/States.tsx
apps/mobile/src/services/api/client.ts
apps/mobile/src/services/queryPolicy.ts
apps/mobile/src/hooks/queries.ts
apps/mobile/eas.json
scripts/build-apk.sh
scripts/verify_production.py
services/api/app/api/v1/health.py
services/api/app/services/meta_service.py
services/api/app/core/config.py
render.yaml
.env.example
docs/17_DEPLOYMENT.md
docs/19_PRODUCTION_INCIDENT_RUNBOOK.md
```

Required diagnostics and fixes:

1. Verify the actual API hostname against current Render configuration and public DNS. Check client, system, and an independent resolver where available; record timestamps and results.
2. Compare a failing browser request with curl from the same network. Check VPN, proxy, DNS filtering, network switching, and IPv4/IPv6 behavior if relevant.
3. Inspect Render deploy events and logs when accessible. Distinguish DNS failure, TLS failure, cold start, process restart, timeout, connection closure, and a real HTTP 503.
4. Verify Vercel Production/Preview API configuration and EAS build-profile overrides. Public environment variables are built into clients; explain when a new deployment or APK is necessary.
5. Centralize URL normalization. Prevent duplicate /api/v1 segments and accidental production localhost fallback.
6. Validate production API configuration during builds with a precise actionable error. Preserve intentional development LAN URLs.
7. Add bounded timeouts, cancellation, and limited retries for retryable reads. Do not retry 422 or authentication failures automatically.
8. Preserve the last successful result while updating. Cached content must show its period and freshness. An initial failure must never look like an empty official dataset.
9. Use concise error messages and a Retry action. Developer diagnostics may expose sanitized request IDs and route names, not stack traces or credentials.
10. Avoid synchronized retry storms across all dashboard panels. Use the shared query policy and bounded backoff.
11. Implement a same-origin web gateway only if investigation establishes a concrete benefit. It must have a fixed upstream, bounded timeouts, correct cache behavior, and support the required response modes. It cannot fix upstream DNS and is not an open proxy. Mobile still needs direct connectivity.
12. Do not disable TLS verification, hardcode Render IP addresses, substitute unrelated datasets, or silently change API domains.

Acceptance: critical routes load on a functioning network; offline, server-unavailable, and configuration failures have recoverable states; the report identifies which observed failures were reproduced and which require the user's affected network to confirm.

## 4. Reproduce and Repair Priority Scenario 422 Errors

Inspect these existing files together:

```text
services/api/app/api/v1/scenarios.py
services/api/app/schemas/priority_scenario.py
services/api/app/schemas/analytics.py
services/api/app/services/priority_scenario_service.py
services/api/app/analytics/priority_scenario.py
apps/web/features/interventions/PriorityScenarioLab.tsx
apps/web/features/interventions/WeightsPanel.tsx
apps/web/lib/api.ts
apps/web/lib/priority.ts
apps/web/types/index.ts
apps/web/services/hooks/useAnalytics.ts
services/api/tests/test_priority_scenario.py
apps/web/tests/priority-workspace.test.ts
```

The existing request contract uses baseline and scenario objects. Their weights use the public field names gap, vulnerability, affected_scale, readiness, and cost. The scoring engine uses wg/wv/wf/wr/wc internally. Inspect the real schema before changing anything.

- Capture the actual browser payload and FastAPI validation detail locally.
- Reproduce through the API with the same selection and weights.
- Test 0..1 versus 0..100 slider conversion, floating-point totals, all-zero weights, invalid periods, unsupported benchmark strategies, crop/district identifiers, and stale persisted selection state.
- Use one explicit request builder and corresponding server validation. Never send the response's internal engine-weight dictionary as the public input shape.
- A slider change must either rebalance deterministically or show a precise invalid-total message before submission. The displayed values must match the submitted values.
- Validate baseline and scenario independently. Echo effective periods, benchmark choices, eligibility, and redistributed weights in results.
- Render field errors beside the relevant control. Retain the user's settings and the last valid comparison.
- Do not convert every 422 into an empty success or loosen validation just to hide the error.

Acceptance: the scenario generated by the real UI succeeds; intentional invalid input returns readable field errors; a request-builder-to-FastAPI contract test prevents recurrence.

## 5. Correct Intervention Priority Meaning

The previous assessment observed Maize 2026B Nyagatare ranked HIGH despite yield above the selected benchmark. Reproduce with current data before patching.

Inspect:

```text
services/api/app/services/analytics_service.py
services/api/app/analytics/intervention_priority.py
services/api/app/services/map_service.py
services/api/app/services/priority_scenario_service.py
services/api/app/services/sensitivity_service.py
ml/src/models/intervention_priority.py
docs/11_INTERVENTION_ENGINE.md
```

Implement two clear planning purposes when justified:

- Productivity support: candidates must have a valid positive yield shortfall, with a transparent threshold defaulting to above zero. Above-benchmark candidates are ineligible, not artificially LOW or assigned a fabricated score.
- Harvest coordination: production/area scale and perishability may identify operational importance, with a distinct name and methodology. Do not call this a productivity-shortfall ranking.

Additional requirements:

- For productivity support use nonnegative shortfall, explicit eligibility reasons, and a documented normalization population.
- Handle constant and unavailable components deliberately. A constant perishability value within a crop should not manufacture evidence of different district vulnerability.
- Keep the scoring reference population stable when a user clicks one district for inspection. Filtering the display must not silently redefine its benchmark or score.
- Label harvested area as an exposure proxy. Do not claim measured beneficiary counts.
- Review whether erosion adoption is a defensible readiness proxy and land share a defensible cost proxy. Rename/remove components where the label suggests a measured concept the data do not support.
- Review the newly exposed practice tables for verified replacements, including matched period, geography, indicator definition, and units. Do not join different seasons silently.
- Apply identical eligibility/scoring semantics to API ranking, maps, scenario comparison, sensitivity, mobile, assistant tools, and exports.
- Version methodology changes and retain reproducibility.
- Explain that ranks are relative planning scores rather than probabilities or estimated intervention effects.

Acceptance: no ineligible above-benchmark candidate appears as HIGH productivity-support priority; all consumers agree; valid monotonicity, constant-series, missing-component, and stable-population cases have tests.

## 6. Redesign Web Interventions

Modify the existing route and components:

```text
apps/web/app/interventions/page.tsx
apps/web/features/interventions/PrioritiesWorkspace.tsx
apps/web/features/interventions/WeightsPanel.tsx
apps/web/features/interventions/PriorityRanking.tsx
apps/web/features/interventions/DistrictExplorer.tsx
apps/web/features/interventions/DistrictRationale.tsx
apps/web/features/interventions/ScoreComponentChart.tsx
apps/web/features/interventions/PriorityScenarioLab.tsx
apps/web/features/interventions/ScenarioComparison.tsx
apps/web/features/interventions/PriorityMovement.tsx
apps/web/features/interventions/SensitivityLab.tsx
apps/web/features/interventions/ComponentAvailabilityNotice.tsx
apps/web/features/dashboard/ProductivityRiskMap.tsx
```

Desktop hierarchy:

1. Compact page title and one filter row.
2. Up to four comparable KPIs for the active purpose and selection.
3. Main district map beside a selected-district evidence panel.
4. Ranked shortlist with search/sort and a concise row rationale.
5. Tabs: Priorities, Compare Plans, Predictions, Evidence.
6. Adjustable weights in a compact panel or drawer; sensitivity and full methods in advanced details.

The selected-district panel shows crop, period, observed yield, benchmark, shortfall, eligibility, score components, evidence freshness, and an appropriate investigation action. Add an Ask AI action that passes the exact scope.

Use selection-linked highlighting across map and table. Preserve filters while switching tabs. Show which assumptions changed in a scenario, and identify when its candidate universe changed.

Make mobile web stacked and usable. Maps and controls need stable dimensions. Charts should occupy real analytical frames, with clear units and short titles. Avoid page sections styled as nested cards. Use existing tokens, Lucide icons, tooltips, visible focus, and restrained borders. Keep repeated-item cards at 8px radius unless the established system dictates otherwise.

Acceptance: first viewport gives a useful answer with clear selection; the user can select a district, inspect evidence, compare a valid scenario, open forecasts, and export Python-generated results without losing context.

## 7. Build and Surface Defensible Predictions

Predictions are explicitly requested in Interventions, Yield Intelligence, and mobile Analyze. Implement the complete prediction path, including an honest unavailable state for unsupported selections.

Extend:

```text
ml/src/forecast/backtest.py
ml/src/forecast/targets.py
ml/src/pipelines/run_forecast_backtest.py
ml/src/models/yield_model.py
ml/src/features/build_features.py
ml/src/evaluation/validation.py
ml/tests/test_forecast_backtest.py
services/api/app/services/meta_service.py
services/api/app/api/v1/analytics.py
services/api/app/schemas/dashboard.py
services/api/tests/test_forecast_status.py
apps/web/app/yield-intelligence/page.tsx
apps/web/lib/forecast.ts
apps/web/features/interventions/
apps/mobile/app/explore/analyze.tsx
apps/mobile/src/hooks/queries.ts
apps/mobile/src/services/api/analytics.ts
docs/forecasting/FORECAST_VALIDATION.md
```

Create narrowly scoped forecast service/schema/view components only where existing modules cannot accommodate them cleanly.

Scientific requirements:

1. Inventory the available history by crop, district, and same season. Fourteen seasonal releases do not mean fourteen independent observations for each annual season.
2. Separate explanatory associations, retrospective yield models, future forecasts, and hypothetical intervention scenarios in schema and presentation.
3. Use chronological evaluation, same-season baselines, and leakage-safe feature availability. Never use future production or contemporaneous target-derived values to predict yield.
4. Compare simple baselines and suitable candidate models using proven libraries. More complex models require evidence of improvement.
5. Retain the existing publication policy. Inspect it for scientific correctness; do not reduce required folds, coverage, or reliability simply to publish a prediction.
6. Report target period, training window, horizon, unit, validation method, sample size, MAE/RMSE, baseline comparison, and supported uncertainty intervals.
7. Respect data-quality flags. Exclusions and sensitivity runs must be reproducible and visible.
8. Never present historical fit or cross-validation across the same season as proof of future generalization.
9. If a simple baseline satisfies the policy, it may be published as such. Do not claim improvement from AI when the baseline is the selected model.
10. Persist versioned artifacts through the real build/deploy path, with input dataset version, model identity, artifact hashes, and runtime compatibility checks. A model card alone is insufficient for inference.
11. If history is inadequate, investigate an attributable compatible historical extension. Do not fabricate rows, repeat observations, interpolate missing targets as truth, or scramble seasons.

UI requirements:

- A Predictions tab is discoverable on Interventions and an equivalent section exists on mobile Analyze.
- Show observed history and a clearly separated forecast segment when available.
- Show uncertainty as an actual interval generated by the backend, with its meaning stated briefly.
- Display "Not enough reliable history for this prediction" when withheld, with the specific reason behind Details.
- Do not relabel scenario ranking movement as a forecast.
- Do not claim a predicted fertilizer/irrigation yield gain from correlations. A causal intervention-response model would require separate defensible evidence.

Acceptance: qualified outputs can travel from artifact to API to web/mobile; insufficient evidence remains withheld; missing artifacts and dataset mismatch are tested; the final report states exactly which targets are available and why others are not.

## 8. Upgrade Existing OpenAI Integration

OpenAI will help explain data, identify evidence-backed insights, and respond naturally in English or Kinyarwanda. It must not invent agricultural statistics or generate forecast numbers from language alone.

The repository already has an extensive assistant pipeline. Inspect and extend:

```text
services/api/app/ai/orchestrator.py
services/api/app/ai/agent.py
services/api/app/ai/planner.py
services/api/app/ai/tool_registry.py
services/api/app/ai/tools/
services/api/app/ai/providers/base.py
services/api/app/ai/providers/remote.py
services/api/app/ai/providers/deterministic.py
services/api/app/ai/prompting.py
services/api/app/ai/evidence.py
services/api/app/ai/evidence_builder.py
services/api/app/ai/output_validator.py
services/api/app/ai/numeric_guard.py
services/api/app/ai/citation_guard.py
services/api/app/ai/language.py
services/api/app/ai/schemas.py
services/api/app/api/v1/assistant.py
services/api/app/core/config.py
services/api/requirements.txt
apps/web/app/assistant/page.tsx
apps/web/features/dashboard/InsightPanel.tsx
apps/mobile/app/ask/index.tsx
apps/mobile/app/ask/history.tsx
apps/mobile/src/services/api/ask.ts
.env.example
docs/14_AI_ASSISTANT.md
docs/20_AI_USAGE_DISCLOSURE.md
```

Implementation:

- Audit the current OpenAI-compatible chat provider and preserve its working contract. Preserve the existing Responses adapter and its tested multi-turn continuation; verify it against the configured provider/model without breaking chat-compatible providers.
- Use current official SDK documentation and a configurable supported model. Do not hardcode a guessed "latest" model or promise account access.
- Reconcile existing AI_ENABLED, AI_PROVIDER, AI_MODEL, AI_BASE_URL, AI_API_KEY and budget settings with any OPENAI_API_KEY/OPENAI_MODEL aliases. Document precedence and validate server-side. Preserve backward compatibility.
- Never put a vendor secret in web/mobile bundles. Do not ask the user to paste a key into chat. Read it from a protected backend environment.
- Reuse allowlisted analytics tools and typed schemas. The LLM cannot run arbitrary SQL, execute shell commands, access arbitrary URLs, or write operational records through explanation tools.
- Include exact crop, geography, period, benchmark, planning purpose, language, and audience in requests. Prevent stale conversation context overriding the current filter selection.
- Retrieve only evidence relevant to the requested scope. Include source identifiers and publication/model status.
- Use structured outputs for machine-readable answer fields and tool calling for data retrieval. Schema validity is not proof of factual accuracy: retain claim validation.
- Validate each numerical claim against the cited evidence's value, unit, period, crop, district, and metric. Finding the same digits elsewhere is insufficient grounding.
- Validate paraphrased qualitative claims too: positive/negative association, rank direction, national versus district scope, missing capacity, and causal wording.
- Permit explanation of qualified model forecasts only when the forecast tool supplies a published artifact, target period, estimate, interval, and limitations. Revise the existing blanket "never predict" prompt narrowly; the LLM still cannot invent or extrapolate values.
- Treat retrieved text and user questions as untrusted input. Add prompt-injection and unauthorized-tool tests.
- Default to quick answers: one direct sentence and up to three findings. Offer More detail, Sources, and Methods as progressive disclosure.
- Return structured fields for summary, findings, investigation_actions, evidence references, limitations, and follow-up suggestions using existing response types where possible.
- Bound latency, output length, tool calls, input size, and spend. Handle rate limits, unavailable models, timeouts, and cancellations without breaking data views.
- Fall back to the existing deterministic provider when remote generation fails or validation rejects the answer. Label the active mode honestly.
- Cache by evidence/dataset/model/prompt version, normalized scope, audience, and language. Respect authorization scope for private operational data.
- Avoid sending farmer identity, precise GPS, photos, tokens, or unrestricted conversation history to OpenAI by default.
- For streaming, do not show unvalidated factual fragments as final insights. Buffer validated messages or stream status events followed by a validated answer. Preserve evidence references through the actual mobile transport.
- Improve Kinyarwanda through glossary consistency and bilingual evaluation; do not claim native review unless performed.

Suggested evidence-backed questions:

- Which districts have the largest maize shortfalls in the selected season?
- Why is this district on the productivity-support shortlist?
- Compare the same crop and season across two districts.
- How has this district changed across the same season over time?
- Which practices are associated with yield, and what cannot be concluded?
- What changed when these planning weights changed?
- What does the published forecast interval mean?
- Why is a prediction or storage recommendation unavailable?

Acceptance: an evaluation set covers normal questions, missing evidence, changed filters, EN/RW, unsupported claims, prompt injection, wrong citations, wrong units, provider failures, and forecast suppression. Real provider verification is reported separately from mocked tests.

Official references to check during implementation:

- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses

## 9. Reduce Text Across the Product

"Too many stories" means the default experience is overloaded. Keep one central decision journey and shorten explanatory copy throughout web and mobile.

Inspect all app routes, shared headings, chart footnotes, error panels, and translations. Modify shared components first where that removes duplication.

Targets:

- Titles: literal, brief, usually 2-6 words.
- Supporting page sentence: optional, usually under 18 words.
- KPI note: one short phrase.
- Initial AI summary: one sentence plus at most three findings.
- Show one concise caveat near the relevant figure; place full methodology and provenance behind Details or Sources.
- Replace repeated explanatory paragraphs with labelled controls, concise section headings, clear legends, and appropriate tooltips.
- Preserve visible crop, geography, period, unit, estimate/scenario status, and material limitations.
- Keep empty/error states actionable. Do not display paragraphs describing the page's features or design.
- Do not truncate essential table headers or source labels; allow intentional wrapping and responsive layouts.
- Update EN and RW keys together and keep the pending-human-review ledger accurate.

Acceptance: every primary screen can be scanned for its main answer within a few seconds; detailed evidence remains accessible with one deliberate interaction.

## 10. Web Consistency Pass

Inspect and improve:

```text
apps/web/app/dashboard/page.tsx
apps/web/app/crops/page.tsx
apps/web/app/productivity/page.tsx
apps/web/app/yield-intelligence/page.tsx
apps/web/app/post-harvest/page.tsx
apps/web/app/storage/page.tsx
apps/web/app/maps/page.tsx
apps/web/app/reports/page.tsx
apps/web/app/transparency/page.tsx
apps/web/app/settings/page.tsx
apps/web/components/layout/
apps/web/components/filters/
apps/web/components/table/
apps/web/lib/filters.ts
apps/web/lib/preferences.ts
apps/web/services/hooks/useFilters.ts
apps/web/app/globals.css
```

Preserve the refined Overview. Verify the current compare-crops control actually drives a visible supported comparison; remove or reroute it if the canonical trend intentionally ignores it. Prevent controls that change the URL but do nothing visible.

On every analytical page:

- State effective selection once.
- Distinguish historical range from the map's single-period snapshot.
- Use URL-backed filters, one period control, reproducible deep links, and reset behavior that does not reapply hidden saved defaults.
- For unsupported data selections, explain the actual dataset coverage; do not silently change seasons.
- Separate contextual national series from district-selected results.
- Keep loading/error/refresh states independent for independent panels.
- Charts use clear units, real tooltips, limited series, and accessible alternatives.
- Export the current backend selection and methodology, not an unrelated default release.
- Keep unavailable Markets data honest. Do not manufacture a feed just to populate navigation.

## 11. Mobile: Full Design and Interaction Pass

Inspect and extend the current routes, not obsolete root-level farmer routes:

```text
apps/mobile/app/index.tsx
apps/mobile/app/_layout.tsx
apps/mobile/app/explore/analyze.tsx
apps/mobile/app/explore/compare.tsx
apps/mobile/app/explore/crops.tsx
apps/mobile/app/explore/crop/[cropCode].tsx
apps/mobile/app/explore/districts.tsx
apps/mobile/app/explore/district/[districtCode].tsx
apps/mobile/app/explore/indicators.tsx
apps/mobile/app/explore/post-harvest.tsx
apps/mobile/app/maps/index.tsx
apps/mobile/app/maps/district/[districtCode].tsx
apps/mobile/app/ask/index.tsx
apps/mobile/app/ask/history.tsx
apps/mobile/app/field-operations/
apps/mobile/src/components/RwandaMap.tsx
apps/mobile/src/components/BottomNav.tsx
apps/mobile/src/theme/
apps/mobile/src/i18n/en.ts
apps/mobile/src/i18n/rw.ts
apps/mobile/src/i18n/pending-review.ts
apps/mobile/src/hooks/queries.ts
apps/mobile/src/services/api/
apps/mobile/src/cache/offline.ts
apps/mobile/src/database/
apps/mobile/src/sync/
```

Design:

- Keep a predictable bottom navigation with a direct Ask entry, reusing the existing navigation architecture.
- Compact headers, clear section hierarchy, stable chart sizes, readable tables, safe-area padding, and touch targets of at least 44 logical pixels.
- Use the existing crop imagery and approved branding. Avoid generic illustrations that imply unsupported data.
- Use filter sheets for crop, period/year/season, province/district, metric, benchmark, and planning purpose where supported.
- Retain scope through map, district detail, Analyze, Compare, and Ask navigation.
- Every filter must affect a corresponding server query or a documented small view selection. Never calculate official scores on the device.
- For cached results, show timestamp/period and offline state. Ask must explain when fresh generation is unavailable offline.

Map:

- Preserve real district geometry and canonical district identifiers.
- District tap opens a selected panel with name, period, crop, metric, unit, source, and availability.
- Provide View district, Compare, and Ask actions carrying the selected scope.
- Support pinch/zoom/pan/reset with accessible buttons and a district-list alternative.
- Keep the legend visible and metric-specific. Missing data must have a distinct legend entry.
- Ensure gestures do not trap page scrolling. Test selection near boundaries and small districts on a real phone.

Compare:

- Searchable district selection and a compact selected-district tray, preferably 2-4 districts on a phone.
- One common crop/period/metric for comparable results.
- Stable side-by-side summaries and aligned units; horizontally scroll only genuine comparison tables.
- Same-crop yield comparisons only. Cross-crop views use supported additive or indexed metrics.
- Backend-generated differences, ranks, and insights. Do not reuse a district's result as another district's result.
- Empty, partial, loading, offline, and error states.
- Quick links back to map and Ask with the comparison scope.

Analyze and field operations:

- Show a concise answer, suitable chart, ranking, predictions, and optional evidence detail.
- Preserve local UUID, additive SQLite migrations, durable queued writes, offline creation, idempotent server sync, and user-visible conflict handling.
- Harvest risk remains server-produced. A rule score is not a calibrated probability.
- Attachments stored only locally must say so. Add server upload only if required for the completed workflow, with ownership, size/type validation, and durable storage.
- No unimplemented action may look like a successful server operation.

Acceptance: map selection, Compare, filters, Ask, predictions, offline save, app restart, reconnect, and sync work on a physical device or emulator; report the exact tested platform and which checks still need a physical device.

## 12. Data Coverage, Quality, and Source Reconciliation

Extend existing scripts and inventory rather than adding a second ETL path:

```text
scripts/data/run_all.py
scripts/data/sas_table_map.py
scripts/data/inventory_sas_workbooks.py
scripts/data/build_manifest.py
scripts/data/check_idempotent_build.py
scripts/data/build_agricultural_practice_observation.py
scripts/data/build_crop_postharvest_multi_period.py
scripts/data/canonical_bootstrap.py
scripts/data/load_postgres.py
data/source_registry/sas_sheet_inventory.csv
services/api/app/repositories/dataset_repository.py
services/api/app/services/period_service.py
services/api/app/services/canonical_trend_service.py
docs/data/SAS_COVERAGE_AUDIT.md
docs/FEATURE_DATA_COVERAGE.md
docs/DATA_TO_UI_MATRIX.md
docs/MOBILE_DATA_TO_UI_MATRIX.md
```

- Reproduce the pipeline twice from clean generated state and compare content identities.
- Reconcile the two standalone 2025B workbooks against the annual 2025 Season B tables, documenting actual differences and precedence. Preserve original source files.
- Do not say unprocessed indicators were not published. Distinguish absent from source, extracted but unmapped, mapped, processed, and served in UI.
- Recheck the 2022/2023 workbooks before stating that they contain productivity only; the existing pipeline previously mapped only productivity for those years.
- Resolve the audit's inconsistent district-row counts for later periods by counting actual geography_level values. Distinguish panel rows from district rows and national/aggregate rows.
- Trace national production gaps in canonical trends to the raw tables and mapping. Repair a proven extraction omission; do not infer a published national total by silently summing district estimates.
- Surface yield/area/production inconsistencies and post-harvest share totals as flags, without rewriting official values.
- Verify every processed source identifier resolves to the source registry.
- Update stale API limitation strings when the multi-period practice tables support more periods than legacy factor tables.
- Audit null/zero behavior, geographic joins, crop aliases, unit conversion, season-C crop availability, and double counting of aggregate crop categories.
- Expose only data needed for the product; all 440 sheets need not be used to make the solution valid.

## 13. Release Reliability and Operational Basics

Inspect:

```text
.github/workflows/ci.yml
.github/workflows/release-database.yml
services/api/Dockerfile
services/api/app/main.py
services/api/app/api/v1/auth.py
services/api/app/api/v1/harvests.py
services/api/app/db/
scripts/verify_production.py
scripts/data/production_diagnostics.py
scripts/data/rehearse_release.py
docs/17_DEPLOYMENT.md
```

- Preserve readiness HTTP 503 when canonical data are not ready and 200 when ready.
- Confirm database content identity and critical routes in smoke tests, including forecasts/AI status without disclosing secrets.
- Verify fresh clone installs using the repository's actual package-manager boundaries. Mobile may have a separate npm lockfile; do not force it into pnpm.
- Ensure CI runs API integration tests against isolated PostgreSQL/PostGIS, never production.
- Keep production data loading as a reviewed release step compatible with the actual Render plan. A Free plan must not rely on an unavailable pre-deploy feature.
- Include build/commit identity and safe data/model status in operational diagnostics.
- Add request correlation, bounded logs, and proportional abuse protection for public AI endpoints. Protect harvest ownership where operational records are accessed.
- Make client-visible errors consistent and redact credentials, private prompts, and farmer identifiers from logs.
- Document backup/recovery and dataset rollback verification for the real database host.
- Stage deployment commands and exact configuration changes when account access is missing. Never mark a local fix as deployed without live verification.
- Do not change repository visibility, publish new restricted datasets, rewrite Git history, or load a production database merely because this prompt asks for implementation. Prepare a concrete diff and identify the specific owner action for those consequential steps.

## 14. Hackathon Evidence and Documentation

Update the current README and docs index to reflect verified implementation. Preserve historical audits as dated records, clearly marked superseded where necessary; fix incoming links if relocating them.

Create or update:

```text
SUBMISSION.md
docs/submission/SOLUTION_BRIEF.md
docs/submission/DATA_CARD.md
docs/submission/METHODS_AND_LIMITATIONS.md
docs/submission/UX_VERIFICATION.md
docs/submission/AI_EVALUATION.md
docs/submission/USER_VALIDATION_REPORT.md
docs/submission/PILOT_PROTOCOL.md
docs/submission/IMPACT_FRAMEWORK.md
docs/submission/SUBMISSION_CHECKLIST.md
docs/20_AI_USAGE_DISCLOSURE.md
docs/REMAINING_IMPLEMENTATION_REPORT.md
THIRD_PARTY_DATA.md
```

Align the solution brief with all five official criteria: problem relevance, data/methodology, technology, usability/design, and tangible impact. Verify the current competition page and deadlines rather than trusting an old audit.

Prepare a concise three-minute demo: select crop/season -> inspect a shortfall -> explain evidence -> compare priorities -> register/sync harvest -> inspect risk/storage scenario -> show sources and validated forecast status.

Provide stakeholder interview tasks, consent wording, and a structured results template. Measure completion time, task success, interpretation errors, and intended planning action. User interviews, Kinyarwanda review, eligibility, and IP acknowledgement require real humans; do not manufacture participation, quotations, signatures, measured loss reductions, or feedback.

Provide pilot KPIs with a baseline and measurement method: time to produce district comparisons, priority areas field-verified, harvest quantity coordinated, recommendation adoption, and observed loss outcomes. Mark these as proposed until measured.

Prepare the public-release inventory and source permissions record. Do not guess a code/data licence on the owner's behalf or declare permission merely because attribution exists. Distinguish a standard public Android debug keystore from a private release-signing secret. Never remove required native files indiscriminately.

## 15. Verification That Must Accompany the Work

Run commands from the current repo scripts and installed toolchain, not guessed paths. Required coverage includes:

1. Full data pipeline and reproducible rebuild.
2. Python lint; API, data, and ML test suites.
3. Web lint, typecheck, unit tests, and production build.
4. Mobile lint, typecheck, tests, and Expo config/build-profile validation.
5. Browser automation on desktop, tablet, and narrow phone widths with screenshots.
6. Functional scenario submission from the actual UI; valid and invalid request contract cases.
7. Map selections, filters, reset, deep links, exports, and preserved charts during refetch.
8. AI grounded-answer evaluations, provider-failure fallback, scoped citations, EN/RW, and prompt-injection cases.
9. Forecast artifact loading, publication gates, null history, incompatible dataset, and unsupported-target cases.
10. Simulated network failure recovery; DNS/configuration diagnostics documented separately.
11. Native mobile smoke test where a device/emulator is available, with restart and offline/reconnect cases.
12. GitHub Actions on the resulting commit and production smoke tests when authorized deployment access exists.

Use outcome-focused tests. Do not inflate counts with duplicate tests, remove failing checks, weaken validation gates, or treat test presence as proof it ran. A build does not verify rendered layout; a mocked OpenAI response does not verify real provider connectivity.

## 16. Execution Order and Completion Report

Implement in this sequence:

1. Audit, baseline verification, and written file-level plan.
2. Connectivity diagnosis, client configuration/error handling, and scenario 422 repair.
3. Productivity-priority eligibility, methodology, and shared contract corrections.
4. Intervention redesign and concise web copy.
5. Forecast evidence/artifacts/API and web/mobile prediction views.
6. Existing assistant upgrade for OpenAI, grounded contextual insights, and evaluation.
7. Mobile map, Compare, Analyze, Ask, filters, and offline verification.
8. Data reconciliation, current documentation, and submission evidence.
9. Integrated testing, screenshots, CI verification, and release preparation.

After each phase, run relevant checks, fix failures caused by the changes, and update the progress document. Continue through independent phases when an external dependency blocks one item.

The final report must contain:

- Feature and exact files changed.
- Root cause and reproduction evidence for DNS/connection errors and the 422 errors; mark unconfirmed causes explicitly.
- Before/after priority behavior and methodology version.
- Forecast targets supported, suppressed, or awaiting artifacts, with reasons.
- OpenAI configuration names, verified active provider, evaluation outcomes, and fallback behavior.
- Web/mobile screenshots and viewport/device evidence.
- Exact commands run and pass/fail/skip results.
- Current commit, working-tree state, CI run links, and deployed identity where verified.
- Remaining work separated into missing credentials/access, missing data, human validation, and unfinished implementation.
- Precise owner actions for any blocked deployment, public release, provider configuration, or stakeholder review.

Completion means a requirement is implemented and exercised through its actual user flow, or is explicitly blocked by unavailable evidence, data, credentials, or human participation. Do not declare 100% complete while hiding such items.

Start by inspecting the latest repository, writing the implementation plan, reproducing the reported failures, and then completing the changes.
