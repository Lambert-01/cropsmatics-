# Remaining Implementation Report

> This report describes the earlier pass. Follow-up fixes and verification
> supersede its outstanding integration findings; see
> [FORECAST_INTEGRATION_REPAIR_REPORT.md](FORECAST_INTEGRATION_REPAIR_REPORT.md).

Companion to [REMAINING_IMPLEMENTATION_PLAN.md](REMAINING_IMPLEMENTATION_PLAN.md).
Baseline audit: 2026-10-15. Every command and result below was run in this
environment and is reported as observed, including what could not be verified.

> **Read "Deployment status" before judging any fix.** Several fixes are verified
> locally and are **not yet live**. The deployed API still serves pre-fix
> behaviour, and one of the unfixed behaviours is a silent wrong answer. Nothing
> in this document was deployed.

## 1. Repository state at the start

| Item | Observed |
|---|---|
| Branch | `main` |
| HEAD | `f56f76c fix(api,scripts): accept dashboard-pasted postgresql:// URLs and correct the production diagnostics` |
| Working tree | clean |
| `AGENTS.md` | **absent** — there are no repository agent instructions to follow |
| Package managers | pnpm 9.12.0 workspaces (`apps/web`); `apps/mobile` has its own npm lockfile (untouched, as the repo requires) |

Uncommitted work produced by this pass: see `git status` at the end of the
session. No commit was created, because the brief asks for changes and honest
documentation rather than a push.

## 2. Reported connection failures — diagnosis

**Every reported route answers HTTP 200 from this network.** The failures were
**not reproduced**, and the evidence points at the client's network stack rather
than the service.

Independent checks (2026-10-15):

```
system resolver   cropsmatics-api.onrender.com -> 216.24.57.16, 216.24.57.18
resolver 1.1.1.1  216.24.57.16, 216.24.57.18
resolver 8.8.8.8  216.24.57.16, 216.24.57.18
system resolver   cropsmatics-web.vercel.app  -> 216.198.79.67, 64.29.17.67
```

| Route | Status |
|---|---|
| `GET /health/readiness` | 200 `status: ready`, dataset `0.2.0-646a72d53cd349df` (3.75 s — cold start) |
| `GET /meta/periods` | 200, `count: 14`, `latest: 2026B` |
| `GET /dashboard/overview` | 200 |
| `GET /analytics/canonical-trend` | 200 |
| `GET /analytics/input-adoption` | 200 |
| `GET /analytics/intervention-priorities` | 200 |
| `GET /maps/district-metrics` | 200 |
| `GET /maps/district-metrics?metric=input_adoption` | 200 |
| `GET /maps/district-metrics?metric=yield` | 200, `requires_crop: true` with an explanatory message |
| `GET /facilities/context` | 200 |
| `POST /scenarios/priority` (default UI payload) | 200 |
| `POST /scenarios/priority` (one slider moved) | **422 — reproduced** |

`scripts/verify_production.py` reported **12/12 required endpoints answered,
release gate PASSED**.

### What the message actually means

`net::ERR_NAME_NOT_RESOLVED` is raised by the browser *before any HTTP request
exists*, so it cannot be caused by the API, its CORS policy or its database. With
the hostname resolving from the system resolver **and** from two public resolvers
while failing for the user, the cause is local: a VPN, a proxy, DNS filtering, a
captive/roaming network, or a stale negative cache. `ERR_CONNECTION_CLOSED`
against a Render Free instance is consistent with an idle instance being torn down
mid-request or a cold start exceeding the browser's patience.

**Unconfirmed, and marked as such:** whether a specific network the user was on
did any of those things. Only the user's affected network can confirm it. What
*is* confirmed here is that the published address is correct and the service
answers.

`scripts/verify_production.py` now separates the layers so this class of report is
not ambiguous in future: it resolves the host through the system resolver and two
public resolvers, then classifies the failure as `dns_failure`, `tls_failure`,
`timeout`, `connection_closed`, `connection_refused`, `http_error` or `reachable`,
and prints a `local_dns_or_network` verdict when the address resolves publicly but
not locally.

### Client hardening (local client only — no gateway added)

| File | Change |
|---|---|
| `apps/web/lib/apiUrl.ts` *(new)* | One resolver: trims, strips trailing slashes, collapses a repeated `/api/v1`, infers `/api/v1` from a bare origin or `/api`, and **refuses a production bundle with no configured address** instead of falling back to localhost. An explicitly configured loopback is normalized, not refused (a same-host sidecar is legitimate), and reported through `isLoopbackHost`. |
| `apps/web/lib/api.ts` | Requests go through one `request()` with a bounded 30 s `AbortSignal.timeout`, combined with any caller signal; a timeout and a configuration error both become typed `ApiFailure`s a panel already knows how to render. |
| `apps/web/lib/queryClient.ts` | Retries stay bounded at one, now **jittered** so a page of panels does not retry in lockstep against a degraded service; 4xx and configuration refusals are never retried. |
| `apps/web/next.config.mjs` | Build-time guard: **fails the build** on an unusable value, **warns** on an unset or loopback value. |
| `.github/workflows/ci.yml` | The web build now runs with the deployed API base, so CI exercises the production configuration instead of an unset variable. |

No same-origin gateway was added: no concrete benefit was established, and the
brief's own condition ("only if investigation establishes a concrete benefit")
is not met — the upstream resolves and answers 200 from an independent resolver.

**Not done:** disabling TLS verification, hardcoding IPs, or substituting datasets
— explicitly prohibited, and not needed.

## 3. `POST /scenarios/priority` — the 422, and a worse silent bug

### Reproduced

```
POST /api/v1/scenarios/priority
{"baseline":{"weights":{"gap":0.35,"vulnerability":0.2,"affected_scale":0.2,"readiness":0.2,"cost":0.1}},...}
-> 422 {"detail":[{"loc":["body","baseline","weights"],
        "msg":"Value error, weights must sum to ~1.0 (got 1.050)"}]}
```

**Root cause.** `WeightsIn` requires the five weights to total 1.0 ± 0.02.
`WeightsPanel` moved one slider by 0.05 per step and never rebalanced, so *any*
single adjustment produced 1.05 or 0.95 and the request was refused. The panel's
own copy claimed the values "will be normalised to 1.00", which the server never
did.

### A second defect, found while reproducing: a silent wrong answer

```
POST /api/v1/scenarios/priority {"baseline":{"weights":{"wg":0.5,"wv":0.15,...}}}
-> 200   (ranked with the DEFAULT weighting)
```

Pydantic ignored the unknown fields, so posting back the engine-keyed dictionary a
previous response had just returned answered **200 with a different weighting**.
An error is better than a plausible answer computed from assumptions the caller
explicitly replaced.

### Fixed (verified locally)

| File | Change |
|---|---|
| `services/api/app/schemas/analytics.py` | `WeightsIn` sets `extra="forbid"` and rejects the engine keys with a message naming both vocabularies (`wg -> gap`). The sum error now states the total and the tolerance. |
| `services/api/app/schemas/priority_scenario.py` | `PriorityScenarioParams` and `PriorityScenarioRequest` also forbid unknown fields, so a misspelled `benchmark` can no longer silently become the default scope. |
| `apps/web/lib/priority.ts` | `rebalanceWeights()` (deterministic, sum-preserving, proportional), `normalizeWeights()`, `weightsIssue()`, and **one** request builder `buildPriorityScenarioRequest()`. |
| `apps/web/features/interventions/WeightsPanel.tsx` | Moving one slider rebalances the others; the total is shown continuously; Run is disabled with a precise reason if the total is ever invalid. |
| `apps/web/features/interventions/PriorityScenarioLab.tsx` | Submits only through the builder and checks the weighting before sending. |
| `apps/web/features/interventions/PrioritiesWorkspace.tsx` | Uses the shared normalizer instead of its own inline one. |

### Cross-language contract test

`services/api/tests/fixtures/priority_scenario_contract.json` holds the request
shapes once. `apps/web/tests/priority-request.test.ts` requires the builder to
reproduce every accepted case exactly; `services/api/tests/test_priority_request_contract.py`
requires each accepted case to validate *and* be served 200, and each rejected case
to be refused with 422 by the schema or the service. A change on one side now
fails the other.

**Live confirmation of the accepted cases after the fix** (builder payloads posted
unchanged to production): all three returned 200, e.g. "crop and one published
period" re-ranks Maize 2026B 23 of 30 candidates between the balanced and
gap-focused weightings.

**Not yet live:** the two schema-level rejections still return 200 on production,
because production runs the pre-fix image. See §8.

## 4. Productivity-support eligibility (methodology 2.0.0)

### Root cause of the reported symptom

`Maize 2026B Nyagatare ranked HIGH while its yield was above the benchmark` had two
compounding causes:

1. **Signed gap normalized into a positive component.** `priority_frame` min-max
   normalized `gap_index` across the whole population. `gap_index` is *negative*
   above the benchmark, but normalization maps the lowest value to 0 and everything
   above it upwards — so a candidate with no shortfall still received a positive
   gap component. With a large harvested area it could reach HIGH.
2. **A one-candidate population.** The candidate frame was filtered by the
   request's district *before* normalizing, so inspecting one district normalized
   over that single candidate — which excludes every component (nothing to compare
   against) and builds a score from constants rather than from the data.

### What changed

| File | Change |
|---|---|
| `services/api/app/analytics/intervention_priority.py` | Now the single source of truth: `PURPOSES`, `eligibility()`, `shortfall_pct()`, `build_population()`, `effective_weights()`, `rank(purpose=...)`. Methodology `2.0.0`. |
| `services/api/app/services/analytics_service.py` | `reference_filters()` (drops the district inspection), `priority_population()`, `candidate_dicts()`, `_component_columns()`; `priority_frame` and `priorities()` delegate to the engine; `adjusted_weights` now delegates to `ip.effective_weights` so there is one redistribution rule. |
| `services/api/app/analytics/sensitivity.py`, `services/api/app/services/sensitivity_service.py` | The sweep is run over the same eligible candidates, for the same purpose. |
| `services/api/app/services/priority_scenario_service.py` | Both sides use the same eligibility and purpose; a side with candidates but none eligible is `missing` **with a reason naming eligibility**, not an empty ranking. |
| `services/api/app/api/v1/analytics.py` | `GET /analytics/intervention-priorities` accepts `purpose` and `threshold_pct`; the two routes share one response builder. |
| `services/api/app/schemas/analytics.py`, `…/priority_scenario.py`, `…/sensitivity.py` | `purpose`, `purpose_label`, `purpose_note`, `methodology_version`, `shortfall_threshold_pct`, `reference_population`, `reference_population_note`, `n_eligible`, `n_ineligible`, `ineligible[]`; `PriorityRow` gains `shortfall_pct`, `eligible`, `eligibility_reason`, `reference_n`. |
| `ml/src/models/intervention_priority.py` | Mirrors the rule (the ML pipeline installs without the API package). |
| `apps/web/features/interventions/EligibilityNotice.tsx` *(new)* | States the purpose, the threshold and how many candidates were excluded, with the per-candidate reasons one interaction away. |

### Before / after

| | Methodology 1.x (deployed) | Methodology 2.0.0 (this change) |
|---|---|---|
| Above-benchmark candidate | scored, can be HIGH | **ineligible**, excluded with a reason, no score |
| Gap component | signed `gap_index` | `max(gap_index, 0)` |
| Constant component | normalized to a neutral `0.5`, scored | excluded, weight redistributed |
| Reference population | whatever the request filtered to | the reference scope, stated in the response |
| District inspection | re-normalizes, can move the score | narrows the display only; the score is unchanged |
| Purpose | implicit | explicit, named, and served |

### Acceptance evidence

`services/api/tests/test_priority_eligibility.py` (24 tests, all pass):
above-benchmark ineligible, at-benchmark ineligible, missing benchmark ineligible,
non-negative shortfall, threshold honoured, monotonicity, a constant component
excluded and its weight redistributed, a missing component excluded, a
one-candidate population excluding everything, harvest coordination as a named
different question, and — through the real endpoint — **no above-benchmark
candidate served as a priority**, **the same district scoring identically with and
without a district filter**, and the map's coloured districts being a subset of
the eligible ones.

`ml/tests/test_intervention_priority.py` (47 tests in `ml`, all pass) pins the same
parity cases offline.

### Served behaviour, end to end, from the local (fixed) API

Observed on `Maize · 2026B` with `CANONICAL_DATA_MODE=file`:

```
purpose=productivity_support  version=2.0.0  threshold=0.0
n_eligible=15  n_ineligible=15
components_constant=['vulnerability']       # perishability is identical across a single crop
Bugesera  Maize band=HIGH score=0.6703 gap=17.8574 shortfall=17.8574 eligible=True ref_n=15
Ruhango   Maize band=HIGH score=0.6486 gap=39.2831 shortfall=39.2831 eligible=True ref_n=15
EXCLUDED RW-EA-KIR::Maize -> yield is 80.4% above the selected benchmark, so there is no
                             productivity shortfall to support

full     : Bugesera score=0.6703 band=HIGH ref_n=15 exposure=1.0
narrowed : Bugesera score=0.6703 band=HIGH ref_n=15 exposure=1.0
STABLE SCORE: True | STABLE POPULATION: True
map coloured: 15 | eligible districts: 15 | coloured subset of eligible: True
harvest_coordination: n_eligible=30 (a different, named question)
scenario: purpose=Productivity support v=2.0.0 baseline 15 eligible / 15 ineligible, moved=9
```

Every HIGH row rests on a positive shortfall; the half of districts above the
median are reported as excluded with their reason rather than as LOW priorities.
`vulnerability` is now correctly flagged constant *within a crop* — perishability
differs between crops, not between districts growing the same one, so it can no
longer manufacture a district-level difference.

**Known limitation, stated plainly:** the API engine and the ML mirror are two
implementations of one rule, because the ML pipeline must run without the API
package. They are held together by parallel test suites, not by an import. Moving
the rule into a small shared package is the correct follow-up.

## 5. Web UI (Interventions)

`EligibilityNotice` is rendered above the ranking; `WeightsPanel` and the Scenario
Lab use the shared rebalance/builder; the priorities workspace uses the shared
normalizer; harvested area is labelled an **exposure proxy** and "farmers/
beneficiaries" wording was removed from the weight hints.

**Not done:** the fuller §6 layout redesign (four KPIs, tabs, prediction tab,
drawer-based weights) and the §9/§10 copy pass across every route. The four
priority surfaces were made correct and self-explaining; the broader layout and
copy work is unfinished.

## 6. Verification actually run

| Command | Result |
|---|---|
| `pytest services/api/tests` | **PASS** — 619 passed, 27 skipped by design (174 s) |
| `pytest scripts/tests` | **PASS** — 114 passed, 1 skipped |
| `pytest ml` | **PASS** — 47 passed |
| `ruff check services/api/app services/api/tests scripts/data scripts/tests ml/src ml/tests` | **PASS** |
| `pnpm --filter cropmatics-web test` (vitest) | **PASS** (369 tests, 25 files) |
| `pnpm --filter cropmatics-web typecheck` (`tsc --noEmit`) | **PASS** |
| `pnpm --filter cropmatics-web lint` (`next lint`) | **PASS** — no warnings or errors |
| `next build` with the deployed API base | **PASS** (19 routes) |
| `next build` with a malformed base URL | **FAILS** with the actionable message (intended) |
| `apps/mobile`: `tsc --noEmit`, `vitest run` | **PASS** — typecheck clean, 335 tests in 24 files |
| `python scripts/verify_production.py` | **PASS** — 12/12 required endpoints, release gate PASSED |
| Live route probe (11 routes incl. the reported failures) | **200** on all |
| `next start` on the production build, `/interventions`, `/dashboard`, `/productivity`, `/yield-intelligence` | **200** on all. Note: these pages are client-rendered, so the served HTML is a shell — this proves the route renders, **not** that the rendered content is correct. |
| Local API (fixed code) queried for purpose/eligibility/stability/map/purpose-separation | **Observations in §4** — stable score, map subset of eligible, purposes separated |
| Live `POST /scenarios/priority` (3 accepted fixture payloads) | **200** on all |

Skipped by design and **not** counted as passing: the canonical integration suite
(needs `CANONICAL_TEST_DATABASE_URL`; no throwaway PostgreSQL available here) and
the 27 database-backed API tests that it covers.

**Not run:** browser automation and screenshots (no Playwright browser run was
performed), a physical-device or emulator mobile smoke test, an Expo/EAS build, and
the full `make data` pipeline rebuild from clean state. These are **unverified**
in this pass — not verified elsewhere, not passing.

## 7. Deployment status — read before trusting the live site

The deployed API and web app were **not** rebuilt from this working tree. The live
service still:

* answers **200** to engine-keyed weights instead of refusing them (the silent
  wrong answer in §3);
* ranks with methodology 1.x, so an above-benchmark candidate can still appear as a
  HIGH productivity-support priority;
* answers `scenarios/priority` with the old `got 1.050` message.

Two of these are behaviours this pass fixes in the repository. The live URLs are
unchanged and are still the ones recorded in §2.

### Owner actions (blocked here)

| # | Action | Why it is blocked |
|---|---|---|
| 1 | Deploy the API to Render (autoDeploy on `main`) | Requires the commit to be pushed; pushing is not authorized in this session |
| 2 | Deploy the web app to Vercel | Same; the build guard now requires `NEXT_PUBLIC_API_BASE_URL` to be set in the Vercel project |
| 3 | Confirm the Render service is synced to `render.yaml` | The blueprint is a template; on the Free plan `preDeployCommand` is inert, so the canonical release runs through the approval-gated workflow |
| 4 | Provide the Neon `DATABASE_URL` / `PRODUCTION_DATABASE_URL` | Not available in this environment |
| 5 | Run `pytest services/api/tests/test_canonical_integration.py` against a throwaway PostgreSQL | No throwaway database here (Docker not used) |

## 8. Remaining work, separated by kind

**Missing credentials / access**
- Render and Vercel deployment access (deploying the fixes above).
- An OpenAI/provider key — the assistant upgrade (§8 of the brief) could not be
  verified against the real provider; only the config path and the deterministic
  fallback are testable here.
- An Expo account and a device/emulator for the mobile pass and EAS builds.

**Missing data**
- No new forecast artifacts were produced, so the published rate stays "withheld".
  The §7 forecast path (artifact → API → web/mobile) was not implemented.

**Human validation**
- Stakeholder interviews, Kinyarwanda native review, consent records and the pilot
  KPI baselines require real people. None was fabricated.

**Unfinished implementation**
- The §6 layout redesign and the §9/§10 copy pass across all web routes.
- The §11 mobile design/interaction pass and offline-reconnect verification.
- The §12 data reconciliation (pipeline rebuilt twice and compared; the two 2025B
  workbooks reconciled; district-row counts re-derived).
- The §13 release-reliability additions beyond what already existed.
- The §14 submission documents (SOLUTION_BRIEF, DATA_CARD, AI_EVALUATION, …).
- Browser screenshots at desktop/tablet/phone widths.

The four functional items the brief put first — connectivity diagnosis, the 422
repair, priority eligibility, and the request contract — are implemented, tested
and documented here. The rest is listed above rather than implied to be complete.
