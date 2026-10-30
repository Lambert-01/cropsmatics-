# Cropmatics Project Status

Reviewed 2026-10-30. This is a release candidate for the [NISR 2026 Big Data
Hackathon](https://statistics.gov.rw/about/hackathon/2026-hackathon-competition),
Track 1: Agricultural Productivity.

## Current verified state

- Latest local `main` revision before this documentation cleanup: `b8d60a4`.
- Vercel production includes the dashboard field-evidence width fix from
  `b8d60a4`.
- Render production includes the storage-optimizer runtime and CORS fix from
  `4325d92`; the hosted POST returned HTTP 200 with solver status `OPTIMAL`.
- Canonical data: 14 periods, 30 districts and up to 17 crops.
- Web typecheck and lint: passed.
- Web tests: 446 passed in the latest local run.
- Next.js production build with the Render API URL: passed.
- Storage optimization tests: 5 passed; targeted API lint passed.

This status page records verified checks rather than claiming that every
external release gate has been rerun. Re-run the production smoke gate and
confirm the newest GitHub Actions, Vercel and Render deployments after any
data, dependency or deployment change.

## NISR fit

Cropmatics directly addresses agricultural productivity through crop and
district comparisons, irrigation and soil-conservation context, post-harvest
use, storage-program context and transparent intervention planning. It uses
official NISR agricultural data and keeps public contextual sources labelled.

The two-person DataSprout team is:

| Member | Contribution |
|---|---|
| Joyeuse Niwemufasha, UR-CST | NISR worksheet validation, data quality, coverage and interpretation |
| Ndacyayisaba Lambert, UR-CST | Data pipeline, database, FastAPI, web, mobile and platform engineering |

## Important limitations

- The 89 material official yield inconsistencies are disclosed, not overwritten.
- 276 SAS sheets are retained but outside the current mapped product scope.
- Forecasts are withheld when chronological validation does not support a
  published target.
- Market prices and unverified storage capacity remain unavailable.
- Intervention scores are investigation priorities, not causal effects,
  budgets, farmer counts or promised yield gains.
- Physical Android testing, native-speaker Kinyarwanda review and final human
  visual review still require owner evidence.
- The final screen recording is a team submission artifact and is not stored in
  this repository yet.

## AI disclosure

AI tools assisted with development, documentation and language refinement. They
are not statistical evidence. Cropmatics computes official figures in Python,
retrieves evidence through FastAPI and validates model-written responses before
display. Provider keys belong only in backend secrets. The deterministic
grounded fallback remains available when a remote provider is unavailable.

## Before submission

1. Push the documentation cleanup and confirm the resulting deployments.
2. Confirm the Vercel deployment contains the fertilizer card in both
   national and district Dashboard views.
3. Confirm the matching GitHub Actions run and Render deployment.
4. Test the APK on a physical Android device, including Maps, Compare, Ask,
   harvest registration, restart and reconnect.
5. Review English and Kinyarwanda wording with a fluent speaker.
6. Record the required short demonstration and submit the public GitHub link,
   deployed application link and README.
