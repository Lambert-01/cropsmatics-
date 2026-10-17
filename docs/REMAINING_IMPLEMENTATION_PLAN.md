# Remaining Implementation Plan

Status: **active** · Written before code changes, per the brief.
Baseline audit date: 2026-10-15.

This document maps the remaining work to concrete files, dependencies, tests and
acceptance conditions. It is the working plan of record; the *result* of the work
is recorded separately in
[REMAINING_IMPLEMENTATION_REPORT.md](REMAINING_IMPLEMENTATION_REPORT.md).

## 1. Baseline audit (verified, not assumed)

| Item | Observed value |
|---|---|
| Branch | `main` |
| HEAD | `f56f76c fix(api,scripts): accept dashboard-pasted postgresql:// URLs and correct the production diagnostics` |
| Working tree | clean |
| Remote | `https://github.com/Lambert-01/cropsmatics-.git` |
| Package manager | pnpm 9.12.0 workspaces (`apps/web`, `apps/mobile`); API venv at `services/api/.venv` |
| Node | v20.20.2 |
| `AGENTS.md` | **absent** — no repository agent instructions exist to follow |
| API tests (baseline) | `pytest services/api/tests -q` → pass, 29 skipped |

### Live production probe (2026-10-15, this network)

| Check | Result |
|---|---|
| `nslookup cropsmatics-api.onrender.com` | resolves → `gcp-us-west1-1.origin.onrender.com` → Cloudflare `216.24.57.16`, `216.24.57.18` |
| `nslookup cropsmatics-web.vercel.app` | resolves → `216.198.79.67`, `64.29.17.67` |
| `GET /api/v1/health/readiness` | HTTP 200 `status: "ready"` (3.75 s — cold start) |
| `GET /api/v1/meta/periods` | HTTP 200, `count: 14`, `latest: 2026B` |
| `GET /api/v1/dashboard/overview` | HTTP 200 |
| `GET /api/v1/analytics/canonical-trend` | HTTP 200 |
| `GET /api/v1/analytics/input-adoption` | HTTP 200 |
| `GET /api/v1/analytics/intervention-priorities` | HTTP 200 |
| `GET /api/v1/maps/district-metrics` | HTTP 200 |
| `GET /api/v1/maps/district-metrics?metric=input_adoption` | HTTP 200 |
| `GET /api/v1/facilities/context` | HTTP 200 |
| `POST /api/v1/scenarios/priority` (default UI payload) | HTTP 200 |
| `POST /api/v1/scenarios/priority` (one slider moved) | **HTTP 422** — reproduced |

Counts above are derived from the manifest and the live API, never hardcoded in
application code.

## 2. Reproduced defects

### D1 — `POST /scenarios/priority` returns 422 when a slider moves

*Cause (confirmed).* `WeightsIn._sum_to_one` (services/api/app/schemas/analytics.py)
requires the five weights to total 1.0 ± 0.02. `WeightsPanel` moves one slider by
0.05 per step and never rebalances, so any single adjustment pushes the total to
1.05 or 0.95 and the request is refused. The panel's own copy claimed the values
"will be normalised to 1.00", which the server never did.

*Reproduction.* `{"gap":0.35,"vulnerability":0.2,"affected_scale":0.2,"readiness":0.2,"cost":0.1}`
→ `422 value_error … "weights must sum to ~1.0 (got 1.050)"`, `loc: body.baseline.weights`.

### D2 — engine-keyed weights are silently accepted and ignored

*Cause (confirmed).* Pydantic ignores unknown fields by default, so
`{"weights": {"wg":0.5, …}}` returns **HTTP 200** and ranks with the *default*
weighting. A caller sending the response's own engine-keyed dictionary gets a
plausible answer computed from different assumptions — worse than an error.

### D3 — above-benchmark candidates can rank HIGH productivity priority

*Cause (confirmed by inspection).* `priority_frame` /
`analytics.intervention_priority.rank` min-max normalize `gap_index` across the
**whole** population, including candidates whose yield is *above* their
benchmark (`gap_index < 0`). A district-crop with no shortfall still receives a
positive normalized gap component, and with high `affected_scale` /
`vulnerability` can reach the HIGH band. Nothing in the contract makes
"above benchmark" ineligible for a *productivity-support* ranking.

*Secondary.* `ip.normalize` maps a constant series to `0.5`, so a perishability
value that is constant within a crop still contributes a manufactured 0.5
"vulnerability" component with no discriminating information.

### D4 — client configuration is not validated or normalized

`apps/web/lib/api.ts` uses `process.env.NEXT_PUBLIC_API_BASE_URL ?? localhost`
verbatim, with no trailing-slash normalization and no duplicate `/api/v1` guard.
A misconfigured production build silently points at `localhost`. `next.config.mjs`
repeats the same unnormalized fallback.

## 3. Work packages

### WP-A · Connectivity diagnosis and client hardening

| File | Change |
|---|---|
| `apps/web/lib/apiUrl.ts` *(new)* | Single `resolveApiBaseUrl()`: trim, strip trailing slashes, collapse a duplicated `/api/v1`, refuse a `localhost` base in a production bundle, preserve LAN/emulator URLs in development. |
| `apps/web/lib/api.ts` | Use the resolver; add `AbortSignal.timeout` bounded per-request timeout; keep typed failures. |
| `apps/web/lib/queryClient.ts` | Jittered bounded backoff; never retry 4xx; cap attempts. |
| `apps/web/next.config.mjs` | Build-time validation that fails with an actionable message when a production build has no usable API base. |
| `apps/web/components/ui/States.tsx` | Error state keeps a Retry action; no developer hints in production. |
| `apps/web/tests/api-url.test.ts` *(new)* | Normalization, duplicate-segment, localhost-in-production and LAN-preservation cases. |

*Not doing:* no same-origin gateway (no concrete benefit established — the
upstream resolves and answers 200 from an independent resolver), no TLS
verification changes, no hardcoded IPs.

*Acceptance.* Unit tests cover the resolver; the web production build fails loudly
on an unusable base URL; reported DNS failures are documented as **not
reproducible** from this network.

### WP-B · Scenario 422 repair and request contract

| File | Change |
|---|---|
| `services/api/app/schemas/analytics.py` | `WeightsIn` forbids unknown keys with a message that names the public shape when engine keys are sent. |
| `apps/web/lib/priority.ts` | `rebalanceWeights()` (deterministic, sum-preserving) and `buildPriorityScenarioRequest()` — the single request builder. |
| `apps/web/features/interventions/WeightsPanel.tsx` | Move a slider → rebalance the others; show the exact running total; disable Run with a precise reason when the total is invalid. |
| `apps/web/features/interventions/PriorityScenarioLab.tsx` | Submit only through the builder. |
| `apps/web/tests/priority-request.test.ts` *(new)* | Builder → FastAPI-contract cases: 0..1 slider space, float sums, all-zero weights, invalid period, unsupported benchmark, engine-keyed rejection. |
| `services/api/tests/test_priority_scenario.py` | Unknown/engine weight keys → 422; valid payload → 200. |

*Acceptance.* The payload the real UI produces returns 200; intentionally invalid
input returns a readable field error; a contract test prevents recurrence.

### WP-C · Productivity-support eligibility and planning purpose

| File | Change |
|---|---|
| `services/api/app/analytics/intervention_priority.py` | Single source of truth: `PURPOSES`, `eligibility()`, non-negative `shortfall`, constant-series handling, stable normalization population. |
| `services/api/app/services/analytics_service.py` | `priority_frame` / `candidate_frame` / `priorities` apply the shared eligibility and expose `purpose`, `eligible`, `eligibility_reason`, `shortfall`. |
| `services/api/app/schemas/analytics.py` | `PriorityRow` gains `purpose`, `eligible`, `eligibility_reason`, `shortfall_pct`; `PriorityResponse` echoes `purpose` and eligibility counts. |
| `services/api/app/schemas/priority_scenario.py` | `PriorityCandidateRow` and `PriorityView` carry the same fields so scenario sides agree with the ranking. |
| `services/api/app/services/priority_scenario_service.py` | Pass the purpose through; report ineligible candidates as ineligible, not as LOW. |
| `ml/src/models/intervention_priority.py` | Mirror the eligibility rule so the offline module cannot disagree. |
| `docs/11_INTERVENTION_ENGINE.md` | Methodology version + the two purposes documented. |
| `services/api/tests/test_priority_eligibility.py` *(new)* | Above-benchmark ineligible; monotonicity; constant series; missing component; stable population when one district is inspected. |

*Acceptance.* No above-benchmark candidate can appear as HIGH productivity-support
priority; every consumer reads one shared rule; the listed cases are tested.

### WP-D · Interventions workspace surfacing and copy

| File | Change |
|---|---|
| `apps/web/features/interventions/*` | Show purpose, eligibility and reason; keep the display population's score stable when one district is selected; compact copy. |
| `apps/web/lib/priority.ts` | Label harvested area as an exposure proxy; drop copy that implies measured beneficiary counts. |

### WP-E · Documentation

`docs/REMAINING_IMPLEMENTATION_REPORT.md` and `DOCUMENTATION_INDEX.md`.

## 4. Explicitly out of scope for this pass (and why)

Recorded honestly rather than silently dropped; see the final report for the
blocker on each.

* **Real OpenAI provider verification** — requires a provider key. Only
  configuration, the deterministic fallback and mocked tests can be verified here.
* **New forecast artifacts** — requires the ML build to publish a qualifying
  backtest; without new evidence the honest state stays "withheld".
* **Physical-device mobile and EAS builds** — requires an Expo account/device.
* **Stakeholder interviews, Kinyarwanda native review, live deployment actions** —
  require humans, credentials or authorization.

---

## 5. Session 2026-10-16 — evidence-first completion pass (part 1)

Baseline at start: `cdffdf7`, `main`, clean working tree. The 2026-10-16 brief was
re-audited against the tree before editing. Several of its items were already
implemented and are **regression criteria, not build instructions**:

* Methodology **2.0.1** productivity-support eligibility, named planning purposes,
  constant-component exclusion, weight redistribution and a stable reference
  population (`analytics/intervention_priority.py`) — present and tested.
* Canonical database authority with an out-of-sync refusal
  (`repositories/dataset_repository.py`) — present.
* Scoped forecast publication gates — present and withheld.

### Work landed in this session

| # | Item | Files | Verified |
|---|---|---|---|
| 1 | **Manual projection engine** (brief §14–§21): pure arithmetic, strict schema, service, `POST /scenarios/manual-projection`, web builder + workspace, shared Python/TS contract fixture | `app/analytics/manual_projection.py`, `app/schemas/manual_projection.py`, `app/services/manual_projection_service.py`, `app/api/v1/scenarios.py`, `apps/web/lib/manualProjection.ts`, `apps/web/features/yield-intelligence/ManualProjectionWorkspace.tsx`, `apps/web/lib/api.ts`, `apps/web/types/index.ts`, `apps/web/services/hooks/useAnalytics.ts`, `apps/web/app/yield-intelligence/page.tsx`, fixture + 2 test files | 19 + 8 Python tests, 8 TS tests |
| 2 | **Explorer exposure** (§30): register `agricultural_practice_observation` and `postharvest_use_multi_period`, grouped current/archive | `services/api/app/services/dataset_service.py`, `app/schemas/dataset.py` | 8 tests |
| 3 | **All-crop yield wording** (§43): area-weighted aggregate, not production-weighted | `canonical_trend_service.py`, `dashboard_service.py`, `apps/web/types/index.ts`, `CanonicalTrendChart.tsx` | dashboard + provenance suites |
| 4 | **Compact provenance default + v3 migration** (§25) | `apps/web/lib/preferences.ts`, `tests/preferences.test.ts` | 42 preference tests |

Full results are in [submission/IMPLEMENTATION_EVIDENCE.md](submission/IMPLEMENTATION_EVIDENCE.md).

### Dependency-ordered remaining work

1. Source precedence (`docs/data/SAS_SOURCE_PRECEDENCE.md`, §4) and worksheet
   coverage disposition (§5).
2. National metric coverage repair + fixtures (§6).
3. ~~Claim-level grounding repair in the AI layer (§21).~~ **Done in part 2**
   (§6 below).
4. ~~Yield Intelligence navigation simplification to four workspaces with legacy
   aliases (§23)~~ **Done in part 2** (§6 below); ~~map legends (§27)~~ **Done in
   part 2**. Remaining in this group: `/maps` (§28) and `/reports` (§29).
5. Transparency (§31) and Settings (§32) restructure.
6. Mobile clarity (§33) and harvest/farm sync repair (§34) — the mobile toolchain
   itself is verified clean as of part 2 (§35), so these are behavioural.
7. Browser matrix, accessibility, Kinyarwanda review and device verification
   (§36–§37) — **blocked on a device and a native speaker**.

## 6. Session 2026-10-16 — part 2

Planned before the code, as the brief requires. Part 1's honest gap list named
§21 (claim-level grounding) as the largest unfinished AI item and §23/§27 as the
navigation and map items; part 2 took those three plus a precondition check on
mobile.

| # | Item | Files | Verified |
|---|---|---|---|
| 1 | **Claim-level grounding** (§21): unit, metric, crop/district/province/period scope, comparison and change direction, causal wording, unknown capacity | `app/ai/claim_guard.py` (new), `output_validator.py`, `api/v1/assistant.py`, `ai/tools/metadata.py`, `ai/tools/analysis.py`, `ai/evidence.py` | 35 rule tests + 10 end-to-end cases; 12 grounded questions pass both guards with no fallback |
| 2 | **Two grounding defects found by the evaluations**: registry tools reading columns that do not exist (empty, colliding evidence for every provenance answer); the numeric allow-list missing string values and unsigned quotes of a published negative figure | `ai/tools/metadata.py`, `ai/evidence.py`, `ai/tools/analysis.py` | provenance/coverage/forecast answers now pass their own guards |
| 3 | **Yield Intelligence to four workspaces with legacy aliases** (§23) | `apps/web/lib/yield-workspaces.ts`, `app/yield-intelligence/page.tsx` | 16 web unit tests |
| 4 | **Map legend honesty** (§27): a null published range is no longer rendered as `0 → 1`; one shared no-data colour | `features/maps/colors.ts`, `MapLegend.tsx`, `RwandaDistrictMap.tsx` | new `tests/map-legend.test.ts` (7 tests) |
| 5 | **Mobile toolchain baseline** (§35 precondition) | none (verification only) | typecheck, lint, 341 tests, `expo config` all pass |

Full results: [submission/IMPLEMENTATION_EVIDENCE.md](submission/IMPLEMENTATION_EVIDENCE.md)
part 2, and [submission/AI_EVALUATION.md](submission/AI_EVALUATION.md) for what the
claim evaluation does and does not prove.

### Dependency-ordered remaining work (updated after part 2)

1. Source precedence (§4) and worksheet coverage disposition (§5).
2. National metric coverage repair + fixtures (§6).
3. `/maps` (§28) and `/reports` (§29) workflows.
4. Transparency (§31) and Settings (§32) restructure.
5. Mobile clarity (§33) and harvest/farm sync repair (§34).
6. Browser matrix, accessibility, Kinyarwanda review and device verification
   (§36–§37) — **blocked on a device and a native speaker**.
