# Forecast Integration Repair Plan

Date: 2026-10-15. Preserve the existing dirty working tree and offline architecture.

1. Provider: extend the internal turn contract to preserve Responses output; translate tool history correctly; fix the documented endpoint and test multi-turn execution. Files: ai/providers/base.py, remote.py, agent.py, .env.example, test_ai_provider_config.py.
2. Python scope: add explicit target metadata to the backtest output; scope forecast-status by crop, canonical season and district without inventing district estimates. Preserve per-series intervals and publication decisions. Extend schemas, route, metadata service and assistant tools/handlers/fallback. Add fixture-backed tests.
3. Clients: query the scoped endpoint, reuse one web forecast panel, make national prediction status independent of district overview, add mobile scope controls and error/offline/retry states, and shorten default copy. Preserve evidence through Details. Add presentation/component regression tests.
4. Verify: Python API/scripts/ML, Ruff, web/mobile lint/typecheck/tests, web build and available UI smoke checks. Report DB, provider, device and deployment gaps rather than claiming them passed.
5. Update current documentation and the remaining-build prompt to distinguish repaired issues from broader roadmap work. Do not deploy or push without authorization.
