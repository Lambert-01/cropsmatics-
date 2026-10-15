# Forecast And AI Integration Repair Report

Date: 2026-10-15.
Checkout: "/Users/apple/Desktop/cropmatics " (trailing space), branch main.
This report supersedes the outstanding integration findings in LATEST_CODE_RECHECK_2026-10-15.md.
Existing user/AI work was preserved. No commit, push, deployment or EAS build was performed.

## Scope And Result

The remaining issues from the recheck are repaired locally: provider continuation, endpoint instructions, forecast scope/evidence, web filtering/independence, mobile failure states, the failed weather-refusal test and stale methodology documentation.

This completes the audited integration repair pass, not every item in the broader product roadmap. It does not make a scientifically unqualified forecast publishable or certify production/mobile-device readiness.

## Implemented

### OpenAI Provider

- ChatResponse can carry native provider output inside a single request's agent history.
- Responses input replays native output/reasoning and converts tool results to function_call_output with the original call_id.
- The shared provider has no mutable per-request conversation state. Tests cover a second request using the same provider without leaking history.
- Multiple calls, unknown tools and exhausted budgets are covered by mocked agent-loop tests.
- Remote response storage is disabled; encrypted reasoning context is requested for stateless continuation.
- Responses does not impose a fixed temperature on models that reject that option.
- The existing chat-compatible provider and deterministic fallback are preserved.
- .env.example now documents the correct official base, https://api.openai.com/v1.
- The existing pinned httpx dependency moved from test-only to runtime requirements so a clean API image can import the remote adapter.

Protocol reference: [official OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling). Mocked protocol tests are not live provider certification.

### Python Forecast Scope And Evidence

- GET /api/v1/analytics/forecast-status accepts crop, season, canonical period_code, district and province.
- Canonical period season takes precedence over a contradictory legacy season.
- A selected historical period chooses the same-season target; it does not pretend to be a historical forecast origin.
- District values come only from their recorded series_forecasts entry, never a national value or the median across districts.
- Missing per-district forecasts and contradictory province/district selections remain unavailable.
- The report-wide publication gate and default-policy flag cannot be bypassed by target status or client filtering.
- New reports include explicit crop/season/metric/geography metadata. Legacy known target IDs have a server-side compatibility reader; clients do not parse them.
- Assistant evidence carries interval bounds/level, units, model, scope, period, source and withholding reasons through both provider-message paths.
- Evidence IDs distinguish district lookups inside the same multi-tool question.
- The weather refusal test now asserts the correct existing weather contract and verifies no forecast-status operation was enabled.
- Invalid report container shapes are treated as unavailable rather than dereferenced as valid reports.

### Web And Mobile

- Interventions and Yield Intelligence request backend-scoped forecast status using the actual canonical filter context.
- Interventions Predictions remains accessible independently of district overview coverage or failure.
- One reusable web panel displays the selected targets, not an unfiltered global report.
- Initial failures show Retry; loading is not mislabeled as an unsupported selection; failed refreshes retain and label saved results.
- Mobile Analyze has crop/district pickers and a season control that requery the API.
- A failed national board no longer prevents its independent forecast section from rendering.
- Mobile renders explicit initial error/retry and offline/cached states.
- Both clients read interval levels from the backend, preserve missing bounds, and suppress values when publication is blocked.
- Default explanations are shorter, repeated rationale is removed, and methods/provenance stay behind an intentional disclosure.
- The mobile web banner has a stronger theme-aware scrim after screenshot inspection showed weak contrast.
- New RW wording remains honestly listed for native-speaker review. No native review is claimed.
- Offline harvest database, UUID and sync queue modules were not rewritten.

### Build And Documentation

- Docker now generates the lightweight forecast publication report from its own processed panel, independently of optional heavy training extras.
- The API CI job generates the report after building analytical tables.
- Packaging tests protect runtime dependency and container build declarations.
- README and engine docs now identify methodology 2.0.1. DNS wording no longer infers the affected user's cause from successful independent probes.
- The AI guide and REMAINING_BUILD_PROMPT.md reflect implemented work instead of requesting duplicate providers/screens.

## Scientific Outcome

The default-policy backtest was regenerated using:

```bash
.venv/bin/python -m ml.src.pipelines.run_forecast_backtest
```

It exited 0 and still withholds all six targets. The history gate requires three chronological folds; available same-season series generally provide two, and the candidate does not beat the baseline. No gate was weakened and no forecast numbers were fabricated.

Generated output: ml/reports/forecast/backtest.json, with explicit target metadata.
Human report: docs/forecasting/FORECAST_VALIDATION.md, regenerated 2026-10-15.
The machine report remains a generated/ignored artifact; Docker/CI now rebuild it.

## Verification

| Check | Exit | Observed result |
| --- | --- | --- |
| Python API + scripts + ML | 0 | 843 passed, 28 skipped |
| Ruff API app/tests + ML + scripts | 0 | All checks passed |
| Web tests | 0 | 380 passed, 26 files |
| Mobile tests | 0 | 341 passed, 25 files |
| Web typecheck / lint | 0 | Clean, including production build checks |
| Mobile typecheck / lint | 0 | Clean |
| Desktop/mobile-web Playwright | 0 | 6 passed, installed Chrome |
| Production Next.js build | 0 | 19 route entries, including the mobile contrast refinement |
| Forecast backtest pipeline | 0 | Six targets withheld under unchanged default policy |
| git diff --check | 0 | Clean |
| Local forecast API smoke | 0 | One Maize/Season B/Bugesera target; values null, correct reasons and metadata |
| Full-page screenshot check | 0 | Desktop 1440x900 and mobile web 390x844; no horizontal overflow |

Commands executed:

```bash
.venv/bin/python -m pytest services/api/tests scripts/tests ml -q \
  -o addopts='' -o cache_dir=/private/tmp/cropmatics-repair-cache
.venv/bin/ruff check --no-cache services/api/app services/api/tests ml scripts
pnpm typecheck
pnpm test
pnpm lint
# Run these explicitly in apps/mobile too; root pnpm includes only the web workspace.
env NEXT_PUBLIC_API_BASE_URL=https://cropsmatics-api.onrender.com/api/v1 pnpm build:web
# From apps/web:
pnpm exec playwright test --config playwright.forecast.config.ts
```

The browser suite tested canonical crop/season/district rendering, actual withholding disclosure, request failure with Retry and independence from an overview outage on desktop and mobile web. Component tests additionally cover synthetic published intervals, blocked publication, null bounds, loading and offline/cache states. Synthetic values remain confined to tests.

The 28 skipped tests are not passes. Database-backed integration requires a disposable PostGIS test database; none was configured.

## Local Preview And Screenshots

Preview: http://127.0.0.1:3107/interventions?period=2026B&crop=Maize&district=Bugesera&defaults=none
API: http://127.0.0.1:8007/api/v1
The preview uses file-mode canonical analytics; it is not a claim that operational PostgreSQL workflows were tested. Existing environment files were not changed.

Local full-page screenshots:
- /private/tmp/cropmatics-forecast-desktop-full.png
- /private/tmp/cropmatics-forecast-mobile-web-full.png

Both were opened and inspected, including after the mobile banner refinement.

## Remaining Work

- Credentialed OpenAI smoke/evaluation with the owner's protected backend settings and account-supported model.
- Complete semantic claim/citation validation; existing numeric guards are not proof that every sentence is correct.
- A clean Docker build and runtime smoke. Docker CLI was unavailable in this environment; packaging tests and the local pipeline are not a substitute.
- Disposable-PostGIS integration and a clean all-data ETL/idempotency run for release.
- Real Expo emulator/phone interactions, APK build, offline app restart/reconnect/sync and native map/Compare verification.
- Native Kinyarwanda review and the remaining broader visual/product roadmap.
- Artifact/dataset compatibility enforcement and any defensible historical extension needed for future forecast publication.
- Actual GitHub Actions run, authorized push/deploy, Render/Vercel environment/version checks and a fresh EAS build. None was performed here.

Use [REMAINING_BUILD_PROMPT.md](REMAINING_BUILD_PROMPT.md) for the updated full completion brief. Do not label the whole platform 100% complete based on these repairs.
