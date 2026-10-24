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
- [ ] Complete the [UX matrix](submission/UX_VERIFICATION.md), keyboard checks,
  accessibility audit and native-language review.
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
dashboard/forecast checks at desktop and mobile-web sizes, and the read-only
production gate passed 13/13 required Render endpoints. The checklist remains
open for exact pushed-commit parity: the live API reports dataset version
`0.2.0-646a72d53cd349df`, while this working tree contains newer uncommitted
changes.
