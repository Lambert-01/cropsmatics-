# Cropmatics Latest Code Recheck

> Historical pre-repair findings. The subsequent implementation and current
> verification are in [FORECAST_INTEGRATION_REPAIR_REPORT.md](FORECAST_INTEGRATION_REPAIR_REPORT.md).

Date: 2026-10-15. Local checkout: "/Users/apple/Desktop/cropmatics " (trailing space).
Branch main; HEAD f56f76c3d7f2e275df8c9022adbc7179d196bd21.
Scope: refreshed source/test/build review after the user's new additions. No fresh deployment, database or physical-device certification. No commit, push or deployment performed.

## Verdict

Substantial progress, but not fully complete or release-verified. Newly added prediction sections show the existing publication decision, not newly validated forecasts. The new OpenAI Responses path needs integration repair. The current Python suite has one failed test.

## Findings

### P1: Responses tool continuation is incomplete

services/api/app/ai/providers/remote.py:372 passes chat-style history directly as Responses input. The agent at services/api/app/ai/agent.py:120 and :219 appends assistant tool_calls and role=tool results. Responses requires function_call and function_call_output items paired by call_id; required provider output/reasoning context must survive subsequent requests. First-turn mocked parser tests miss this normal second-request path. Remote failure can cause deterministic fallback rather than usable OpenAI tool-assisted answers.

Repair the full adapter contract and test the actual multi-turn agent flow. This conclusion is based on source/protocol comparison, not a live credentialed failure.

### P1: Documented OpenAI base produces the wrong endpoint

.env.example tells Responses users to omit /v1, but remote.py:389 appends only /responses. Following it constructs https://api.openai.com/responses instead of https://api.openai.com/v1/responses. Current tests use a /v1 base but only check the URL suffix, missing the documentation mismatch.

Official reference: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling).

### P2: Web prediction filtering is partial

apps/web/features/interventions/PredictionsWorkspace.tsx:39 reads filters.season; canonical filters can instead carry period=2026B without that legacy field. Season A targets can therefore match a Season B selection. Matched targets are counted, but :106 renders ForecastPanel without filtering its targets. District/province are not applied. An initial loading/error state can incorrectly say no target exists.

apps/web/app/interventions/page.tsx:79 hides all tabs when district overview coverage is unavailable, although national forecast status is independent.

Use typed target scope, shared period resolution, independent loading/error states and genuinely filtered presentation.

### P2: Assistant forecast evidence is incomplete

services/api/app/ai/tools/metadata.py:93 omits interval bounds and explicit crop/district/model attribution. agent._item_payload and RemoteProvider._messages omit note/method, hiding recorded withholding reasons from remote generation. grounded.py's published branch lists point values without actual interval bounds and uses a global no-argument forecast status rather than the requested scope.

Carry estimate, interval, level, period, scope, model and provenance throughout retrieval and validation. Current forecasts are all withheld, so published-value cases need synthetic fixtures; this is not evidence of a wrong forecast currently served.

### P2: Mobile forecast failure is hidden

apps/mobile/app/explore/analyze.tsx:275 passes only data/isLoading. src/components/analytics/PredictionsSection.tsx:47 returns null on an initial request error, without Retry or an offline explanation. It is not selection-scoped, labels intervals 80% regardless of backend policy and would turn null interval bounds into zero.

### P2: New Python test/contract mismatch

services/api/tests/test_ai_forecast.py:60 expects unsupported_topic=forecast for a weather question; the planner correctly returns weather. The weather request is still refused. Fix the assertion to protect intended refusal rather than changing correct behavior to make the test green.

### P3: Documentation and design remain partial

README, docs/11_INTERVENTION_ENGINE.md and the earlier implementation report still mention methodology 2.0.0 although current code is 2.0.1. Some production status statements contradict later dated checks; independent DNS success does not establish the affected user's root cause.

RW prediction strings remain English with a pending-native-review ledger. New panels contain substantial technical copy and raw target IDs. These additions do not complete the requested concise design/mobile pass. Rendered appearance has not been verified here.

## Newly Implemented

- Interventions Predictions tab, reusing the web forecast-status panel.
- Mobile Analyze forecast-status section, API call, query hook, types and translation keys.
- Forecast-status assistant routing, registered read-only tool and deterministic explanation.
- AI_*/OPENAI_* aliases with defined precedence.
- Initial Responses output parsing and tool-schema translation.
- New forecast-routing, provider-config and tool-denial/injection tests. Mocked/static boundary tests are not proof of live provider acceptance or arbitrary injection resistance.

## Earlier Repairs Now Verified In The Tree

The combined Python run passes the priority review regression cases for:
- Full-reference map benchmarks/scores matching the ranking under district selection.
- Scenario district-display filtering with stable scores and explicit province preserved.
- Independent scenario thresholds and explicit cross-purpose rejection.
- Harvest-coordination default weights across GET/POST/map/scenario.
- Constant-only or unavailable weighting returning PRIORITY_UNSCORABLE 422 instead of fabricated LOW rankings.
- Resolved-period priority provenance.
- Sensitivity narrowing displayed districts after full-reference calculations.
- API/offline engine parity and correct positive-shortfall threshold wording.

The production API URL guard also rejects missing/loopback bases unless intentional local preview is enabled. API/ML remain separate implementations with parity tests, not an extracted shared package. Missing-component presentation still needs reconciliation.

## Verification

| Check | Exit | Result |
| --- | --- | --- |
| Python API + scripts + ML | 1 | 824 passed, 1 failed, 28 skipped |
| Ruff API app/tests + ML + scripts, --no-cache | 0 | All checks passed |
| Web typecheck / lint | 0 | Clean |
| Web tests | 0 | 372 passed, 25 files |
| Web production build with hosted API base | 0 | 19 route entries |
| Mobile typecheck / lint | 0 | Clean |
| Mobile tests | 0 | 335 passed, 24 files |
| Production config import: missing API | 1 | Intended actionable rejection |
| Production config import: localhost API | 1 | Intended actionable rejection |
| git diff --check | 0 | Clean |

Python command:
.venv/bin/python -m pytest services/api/tests scripts/tests ml -q -o addopts='' -o cache_dir=/private/tmp/cropmatics-review-pytest-cache

Other commands:
- pnpm typecheck, pnpm test, pnpm lint at root (web workspace only).
- The same commands explicitly in apps/mobile.
- env NEXT_PUBLIC_API_BASE_URL=https://cropsmatics-api.onrender.com/api/v1 pnpm build:web
- .venv/bin/ruff check --no-cache services/api/app services/api/tests ml scripts

Initial sandboxed web test/lint attempts could not write normal caches; authorized reruns completed with true exit status 0. Python was rerun with its cache in /private/tmp and still reproduced the single test failure.

## Remaining Verification

The 28 skipped checks include DB-backed tests without a disposable database. No fresh production version/Render logs/GitHub Actions verification, credentialed provider request, rendered browser/mobile screenshots, EAS build, physical-device offline/restart/sync test, clean ETL rebuild, cell-level workbook reconciliation or native Kinyarwanda review was completed.

The checked-in ml/reports/forecast/backtest.json was generated 2026-10-12 and says serves_forecast=false. Do not lower publication gates simply to populate the new screens.

See REMAINING_BUILD_PROMPT.md for the updated completion brief, including concrete files and acceptance criteria. Preserve existing implementations; finish the gaps.
