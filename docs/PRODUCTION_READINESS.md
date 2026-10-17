# Release Checklist

Use [Current Status](CURRENT_STATUS.md) for known defects. This is a checklist,
not a dated list of assumed passes.

- [ ] Resolve release-blocking analytical, AI and synchronization defects.
- [ ] Rebuild analytical tables from the versioned inputs and verify a stable
  content-addressed dataset version on a second build.
- [ ] Run web/mobile lint, TypeScript, tests and a production web build.
- [ ] Run API, script and ML tests; run canonical integration against an isolated
  PostGIS database. Skipped tests must be reported, not counted as passed.
- [ ] Verify every required GitHub Actions job on the exact pushed commit.
- [ ] Confirm Vercel and Render deploy the intended branch and commit.
- [ ] Verify `/api/v1/health/readiness`, canonical version parity and required
  endpoints using `python scripts/verify_production.py`.
- [ ] Verify projection, filters, report downloads, expanded sources and error
  states in a rendered browser, not just returned HTML.
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
