# Cropmatics Project Status

Reviewed 2026-10-30. This is a release candidate for the [NISR 2026 Big Data
Hackathon](https://statistics.gov.rw/about/hackathon/2026-hackathon-competition),
Track 1: Agricultural Productivity.

## Current verified state

- GitHub `main` is at `bafdacb` and the [latest CI run](https://github.com/Lambert-01/cropsmatics-/actions/runs/41034785842)
  is green across Web, Mobile, API/canonical integration, ML and Data Pipeline.
- The release fix registers the restricted `NISR_AHS_MICRODATA_2024` source and
  corrects the API Ruff import-order failure.
- Vercel routes and the Render API are reachable. Render currently serves the
  older build commit `792aef1`; redeploy confirmation is still required before
  claiming production commit parity with `main`.
- Canonical data: 14 periods, 30 districts and up to 17 crops.
- Web typecheck and lint: passed.
- Web tests: 446 passed; mobile tests: 354 passed.
- Next.js production build with the Render API URL: passed.
- API, data-pipeline and ML tests: passed; the API suite retains its existing
  database-environment skips where no isolated local PostGIS service exists.
- Scientific validation: 12 passed, 0 failed, 1 unresolved published-source
  finding; official yield values remain preserved.

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
- The read-only production smoke gate passed 13/13 endpoints, but the live
  Render commit must be rechecked after its redeploy.
- Eligibility-card images remain publicly visible in the repository; confirm
  that NISR accepts this evidence arrangement before submission.

## AI disclosure

AI tools assisted with development, documentation and language refinement. They
are not statistical evidence. Cropmatics computes official figures in Python,
retrieves evidence through FastAPI and validates model-written responses before
display. Provider keys belong only in backend secrets. The deterministic
grounded fallback remains available when a remote provider is unavailable.

## Before submission

1. Redeploy Render and confirm it reports `bafdacb` (or the exact deployed
   commit selected by the owner), then rerun the production smoke gate.
2. Confirm the Vercel deployment contains the fertilizer card in both
   national and district Dashboard views.
3. Confirm the matching GitHub Actions run and Render deployment.
4. Test the APK on a physical Android device, including Maps, Compare, Ask,
   harvest registration, restart and reconnect.
5. Review English and Kinyarwanda wording with a fluent speaker.
6. Record the required short demonstration and submit the public GitHub link,
   deployed application link and README.
