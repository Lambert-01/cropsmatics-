# Testing And Validation

## Software Gates

From the repository root, after installing dependencies and building analytical
tables:

```bash
make lint
make typecheck
make test
pnpm --filter cropmatics-web test
npm --prefix apps/mobile test
NEXT_PUBLIC_API_BASE_URL=https://cropsmatics-api.onrender.com/api/v1 pnpm --filter cropmatics-web build
```

Mobile is outside the pnpm workspace. Reproduce its CI boundary using its own
`npm ci`, then `npm run lint`, `npm run typecheck`, `npm test` and
`npx expo config --type public` from `apps/mobile`. A parent installation can
mask an undeclared type package, so an existing local pass is not clean-install
evidence.

Canonical integration requires an isolated PostGIS database supplied through
`CANONICAL_TEST_DATABASE_URL`. Never point tests at production. Report skipped
tests explicitly. GitHub Actions provisions PostGIS and runs canonical tests;
check the actual workflow result for the intended commit.

Maintained regression suites live under `services/api/tests`, `scripts/tests`,
`ml/tests`, `apps/web/tests`, `apps/web/e2e` and `apps/mobile/tests`. Preserve
these tests and fixtures. Generated coverage, browser reports and local run
state are ignored; they are not substitutes for the test source.

See [Current Status](CURRENT_STATUS.md) for known cases the passing suites do
not yet cover, and [UX verification](submission/UX_VERIFICATION.md) for rendered
browser and native-device checks. No test count alone certifies methodology,
native language quality or production parity.

## Data
duplicate checks, geography codes, units, negative quantities, impossible yields, missingness, source traceability.

## ML
time-aware validation, leakage checks, calibration, crop/district error breakdown, uncertainty.

## Optimization
capacity constraints, supply conservation, crop compatibility, infeasible scenarios, deterministic replay.
