# Release Checklist

Use [Current Status](CURRENT_STATUS.md) for known defects. This is a checklist,
not a dated list of assumed passes.

- [ ] Resolve release-blocking analytical, AI and synchronization defects.
- [x] Rebuild analytical tables from the versioned inputs and verify a stable
  content-addressed dataset version on a second build.
- [x] Run web/mobile lint, TypeScript, tests and a production web build.
- [x] Run API, script and ML unit suites; the local suites pass and skipped
  database-backed cases are reported.
- [ ] Run canonical integration and migration rehearsal against an isolated
  PostGIS database. Skipped tests must be reported, not counted as passed.
- [ ] Verify every required GitHub Actions job on the exact pushed commit.
- [ ] Confirm Vercel and Render deploy the intended branch and commit.
- [ ] Verify `/api/v1/health/readiness`, canonical version parity and required
  endpoints using `python scripts/verify_production.py`.
- [ ] Verify projection, filters, report downloads, expanded sources and error
  states in a rendered browser, not just returned HTML. Local component/API
  tests pass, but the current-commit browser matrix is still required.
- [x] Run the automated accessibility audit and populated-data keyboard map
  check; the ten key web routes have zero serious/critical axe violations.
- [ ] Complete the manual keyboard/drawer journey, full UX matrix, screenshots
  and native-language review.
- [ ] Build an APK against the hosted API and record real-device offline,
  restart, reconnect, idempotency and persistence tests.
- [ ] Confirm no secrets, private operational records, unlicensed source data or
  test-generated artifacts are included in release files.
- [ ] Keep unavailable forecasts, prices and capacities explicitly unavailable.

Do not point integration tests or destructive migrations at production. Read
[deployment](17_DEPLOYMENT.md), [database authority](P0_DATABASE_AUTHORITY.md) and
the [incident runbook](19_PRODUCTION_INCIDENT_RUNBOOK.md) before operating on
deployed services. A green build does not certify data methodology or UX.

Latest evidence (2026-10-24): the local Playwright suite passed 16/16 rendered
dashboard/forecast checks at desktop and mobile-web sizes. The populated-data
axe-core scan reported zero serious/critical violations on ten key routes, and
the mobile-viewport map check found 30 labelled focusable district controls.
The current release is pushed to `main`; Vercel reports the production
deployment ready and Render reports the API deployment live. The post-deploy
read-only gate currently fails
readiness plus four canonical analytics checks because the external production
database still reports dataset version `0.2.0-646a72d53cd349df`, while the
deployed image expects the newer processed version `0.2.0-0e76c4d8f79ee5fc`.
This is an intentional fail-closed state, not permission to fall back to stale
or fabricated data. Run the approval-gated `Release database (canonical sync)`
workflow from `main` after the required backup and isolated rehearsal, then
rerun `scripts/verify_production.py` until it passes 13/13.

The hosted signed APK submission was attempted with the hosted Render API but
Expo rejected it because the account has exhausted its free Android-build quota
for the month. The local debug APK remains available; a signed shareable APK
requires the quota reset or an EAS plan upgrade.
