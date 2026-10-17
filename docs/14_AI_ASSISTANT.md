# 14. AI Assistant

## Role

The assistant explains retrieved agricultural evidence. It does not originate official statistics or forecast values. Deterministic answers work without a provider key; an optional remote provider can select allowlisted read-only tools and compose prose.

The current pipeline is route -> deterministic reference -> typed evidence -> optional provider/agent -> output validation -> response. Validation is three independent guards, and a provider's answer is returned only if all three pass:

| Guard | What it proves |
|---|---|
| `numeric_guard` | Every figure in the answer appears somewhere in the retrieved evidence, at the precision it was written. |
| `claim_guard` | Every figure is attributable *in its own scope*: the unit the sentence gives it, the metric word it is attached to, and the crop, district, province and period the sentence places it in. Comparison direction, percentage-change direction, effect-asserting wording over observational evidence, and a capacity asserted as zero are checked too. |
| `citation_guard` | Every cited evidence id was actually retrieved, so provenance cannot be fabricated into existence. |

A failed guard returns the deterministic answer instead - which is correct by construction - and records which guard failed and why in `validation`. The guards are a floor, not a proof of semantic accuracy: they are limited to English (or language-neutral) unit and scope vocabulary; a credentialed provider has still not been exercised from this environment; and adaptive-style evasion (paraphrase that moves a claim without moving a number) is only partly addressed. The evaluation set that measures them is documented in [submission/AI_EVALUATION.md](submission/AI_EVALUATION.md).

## Provider Configuration

Configure only in the backend's protected environment:

```dotenv
AI_ENABLED=true
AI_PROVIDER=openai_responses
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=<model available to your account>
AI_API_KEY=<backend secret>
```

Never put the provider key in NEXT_PUBLIC_* or EXPO_PUBLIC_* variables. AI_* names take precedence; OPENAI_MODEL, OPENAI_BASE_URL and OPENAI_API_KEY fill empty values. Keep the key out of chat, logs, screenshots and commits.

AI_PROVIDER=openai_compatible retains the chat-completions contract. The Responses path uses request-local native output and function_call_output items, retaining call IDs and encrypted reasoning context. It does not store conversation state on the shared provider object, and remote storage is disabled. Optional sampling settings are omitted for Responses to avoid imposing unsupported temperature options.

See [official function calling documentation](https://developers.openai.com/api/docs/guides/function-calling).

## Forecast Evidence

GET /api/v1/analytics/forecast-status accepts crop, season, period_code, district and province. A canonical historical period selects its season, not a historical forecast origin. Forecast horizons follow the latest training history.

The service reads the default-policy backtest report; it never estimates a missing forecast. A district result must exist in the report's per-series forecasts. A national value or the median across districts cannot replace it. Province-only targets do not exist and return an explicit uncovered selection.

The assistant can explain a published modelled estimate or why a target is withheld. Evidence carries source/model, scope, period, unit, interval bounds/level and reasons. Current real-data backtests withhold every target. Forecast statements are not observations, guarantees or causal intervention effects.

## Verification And Limits

Run provider/parser and scoped evidence tests with:

```bash
.venv/bin/python -m pytest services/api/tests/test_ai_provider_config.py \
  services/api/tests/test_ai_forecast.py services/api/tests/test_forecast_scope.py
```

Mocked multi-turn tests cover tool results, unknown tools, exhausted budgets and request isolation. They do not prove credentialed provider connectivity, account/model availability, cost behavior or resistance to every prompt injection.

Claim-level validation and its evaluation set run through the real request path:

```bash
.venv/bin/python -m pytest services/api/tests/test_ai_claim_guard.py \
  services/api/tests/test_ai_claim_eval.py
```

The evaluation set drives adversarial providers (a figure moved to another unit, another district, another period; a reversed comparison; an effect asserted over association; a figure from an injected instruction) and requires each to be rejected, with a control case that requires a correct restatement to be **accepted**.

For local rendered web checks:

```bash
cd apps/web
pnpm exec playwright test --config playwright.forecast.config.ts
```

That configuration uses installed Chrome, local test ports 3107/8007 and generated local data. It is not a production or Expo-device test.

See [FORECAST_INTEGRATION_REPAIR_REPORT.md](FORECAST_INTEGRATION_REPAIR_REPORT.md), [MODEL_INTERPRETATION_POLICY.md](MODEL_INTERPRETATION_POLICY.md) and the current remaining-build prompt.
