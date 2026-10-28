# Release Checklist

Reviewed **2026-10-28**. This is evidence recorded for the current `main`
revision, not a promise that an external device or human review happened.

- [x] Rebuild analytical tables and reproduce a stable content-addressed dataset
  version on a second build.
- [x] Run API, script, ML, web and mobile automated suites; skipped database
  cases remain reported as skipped.
- [x] Run web typecheck, lint, production build and the local rendered browser
  matrix.
- [x] Verify the tested functional release commit (`4eb1847`) in GitHub Actions;
  the later `main` follow-up contains documentation-only changes.
- [x] Verify the deployed web/API surfaces and canonical dataset identity.
- [x] Run `scripts/verify_production.py` against Render: **13/13 passed**.
- [x] Keep forecasts, market prices, facility capacities and unsupported
  statistics unavailable rather than fabricating them.
- [x] Keep source precedence and the 89 productivity / 15 post-harvest quality
  warnings documented.
- [ ] Run canonical migration and ownership tests against an isolated PostGIS
  database; never use production for this rehearsal.
- [ ] Complete manual browser keyboard/drawer checks, approved screenshots and
  native-speaker English/Kinyarwanda review.
- [ ] Complete physical Android tests for map selection, Compare, Ask, offline
  harvest registration, restart, reconnect and idempotent sync.
- [ ] Confirm the team-owned screen recording and final submission declarations.

Do not point integration tests or destructive migrations at production. Read
[deployment](17_DEPLOYMENT.md) and [Current Status](CURRENT_STATUS.md) before
operating on deployed services. A green build does not certify data methodology
or physical-device behaviour.

## Current evidence

The local pipeline passed with zero errors and produced dataset version
`0.2.0-5b51d2c390e4d101` from the functional release commit `4eb1847`. The production readiness response
is HTTP 200 with database connected, canonical mode required and matching
dataset identity. The read-only production gate passed all 13 required checks.

The public install route is also verified: `/install/apk` redirects to the
GitHub Release APK and the downloaded file is a valid Android package containing
the hosted Render API URL. Download verification is not a substitute for
installing and exercising the app on a physical device.

Remote Groq/Gemini use is optional. The Ask Agent remains safe when a provider
is unavailable because it falls back to deterministic, evidence-grounded
answers. Do not describe the remote provider as active until its Render secret
configuration and a live provider-backed response are verified.
