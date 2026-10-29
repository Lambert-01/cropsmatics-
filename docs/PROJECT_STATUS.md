# Cropmatics Project Status

Reviewed 2026-10-29. This is a release candidate for the [NISR 2026 Big Data
Hackathon](https://statistics.gov.rw/about/hackathon/2026-hackathon-competition),
Track 1: Agricultural Productivity.

## Current verified state

- Latest remote `main`: `61f72fb`.
- Production Render readiness: HTTP 200.
- Read-only production smoke gate: 13/13 required endpoints passed.
- Canonical dataset: `0.2.0-dd69a79f2481b9e0`.
- Canonical data: 14 periods, 30 districts and up to 17 crops.
- Web typecheck and lint: passed.
- Web tests: 445 passed.
- Next.js production build with the Render API URL: passed, 20 routes.

The current working tree also contains a dashboard fertilizer-visibility fix,
README changes and this documentation cleanup. They are not live until they are
committed, pushed and redeployed.

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

1. Commit and push the current working tree.
2. Confirm the new Vercel deployment contains the fertilizer card in both
   national and district Dashboard views.
3. Confirm the matching GitHub Actions run and Render deployment.
4. Test the APK on a physical Android device, including Maps, Compare, Ask,
   harvest registration, restart and reconnect.
5. Review English and Kinyarwanda wording with a fluent speaker.
6. Record the required short demonstration and submit the public GitHub link,
   deployed application link and README.
