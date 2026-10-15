# 14. AI Assistant

## Role

The assistant explains retrieved agricultural evidence. It does not originate official statistics or forecast values. Deterministic answers work without a provider key; an optional remote provider can select allowlisted read-only tools and compose prose.

The current pipeline is route -> deterministic reference -> typed evidence -> optional provider/agent -> output validation -> response. Existing numeric/citation guards and deterministic fallback remain in place. These guards are not proof of complete claim-level semantic accuracy; further evaluation remains required.

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

For local rendered web checks:

```bash
cd apps/web
pnpm exec playwright test --config playwright.forecast.config.ts
```

That configuration uses installed Chrome, local test ports 3107/8007 and generated local data. It is not a production or Expo-device test.

See [FORECAST_INTEGRATION_REPAIR_REPORT.md](FORECAST_INTEGRATION_REPAIR_REPORT.md), [MODEL_INTERPRETATION_POLICY.md](MODEL_INTERPRETATION_POLICY.md) and the current remaining-build prompt.
