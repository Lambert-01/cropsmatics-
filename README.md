# Cropmatics Rwanda

**Crop Intelligence from Data to Action.**

An agricultural decision-support platform built for the NISR agricultural
productivity challenge. Explore official crop statistics, compare district
productivity, investigate intervention priorities and plan harvest logistics.

[Web dashboard](https://cropsmatics-web.vercel.app/dashboard) |
[API documentation](https://cropsmatics-api.onrender.com/docs) |
[Documentation](DOCUMENTATION_INDEX.md) |
[Current status](docs/CURRENT_STATUS.md) |
[Remaining implementation brief](docs/REMAINING_BUILD_PROMPT.md) |
[NISR submission alignment](docs/submission/NISR_WEBINAR_ALIGNMENT.md)

## What You Can Do

| Workflow | Application |
|---|---|
| Explore crop performance across available periods | Dashboard, Crops, Productivity, Maps |
| Compare productivity shortfalls and transparent planning priorities | Interventions |
| Create assumption-based plans, separate from observed statistics | Yield Intelligence: Planning |
| Explore reported production use and verified storage-program context | Post-Harvest, Storage |
| Inspect sources, coverage and analytical datasets | Data Explorer, Data & Models |
| Ask questions grounded in retrieved analytical evidence | AI Assistant |
| Register harvests offline | Expo mobile app with authenticated sync; physical-device verification remains |

**Status:** release-candidate code, not a completed production certification.
The latest dashboard refetch fix is on `main` locally and must be deployed and
smoke-tested against Vercel/Render. The production API was observed healthy
after canonical database synchronization. The latest changes repair
authenticated operational ownership, AI crop/period claim binding, peer
benchmark headlines, transactional mobile sync state and the dataset explorer's
JSON/CSV filter contract. Remaining limitations are documented in [current
limitations and verification](docs/CURRENT_STATUS.md).
A passing test suite does not mean that the canonical database, physical
device, isolated PostGIS migration or signed APK has been verified.

For the NISR 2026 submission, the required public GitHub link, deployed app,
README, runnable scripts and source/data disclosure are represented here. The
maximum-three-minute screen recording is a submission artifact still to be
recorded and committed; see [the webinar alignment checklist](docs/submission/NISR_WEBINAR_ALIGNMENT.md).

## Data And Interpretation

- The district crop productivity panel contains 14 published periods from
  2022A through 2026B. Coverage varies by crop and indicator.
- Multi-period practice and post-harvest observations are distinct from the
  legacy 2025B factor extracts. Not every worksheet is mapped into analytics.
- Official statistics and voluntary mobile records remain separate.
- Priorities identify candidates for investigation, not proven causal effects.
- Manual plans use user assumptions. They are not official statistics or
  validated model forecasts; model output stays withheld when validation fails.
- Missing capacity and absent price data stay unavailable, never invented.

Versioned worksheet extracts are under `data/raw/nisr/sas/`. Owner-provided
workbooks are generally untracked; the curated official 2025B original is
retained for provenance. Do not edit raw sources. Read the
[data card](docs/submission/DATA_CARD.md),
[coverage audit](docs/data/SAS_COVERAGE_AUDIT.md) and
[interpretation policy](docs/MODEL_INTERPRETATION_POLICY.md).

## Architecture

```text
Official worksheet extracts -> Python ETL -> processed analytical tables
                                           |
                                  PostgreSQL / PostGIS
                                           |
                             FastAPI analytics and optimization
                                           |
                         Next.js dashboard / Expo mobile app
```

Python computes analytical values. Clients visualize API responses. PostgreSQL
is the production analytical authority; explicit file mode supports development.
Dataset-version checks prevent silent reads from an out-of-sync deployment.

| Directory | Responsibility |
|---|---|
| `apps/web` | Next.js, React, TanStack Query, maps and charts |
| `apps/mobile` | Expo, React Native, SQLite and offline queue |
| `services/api` | FastAPI, services, repositories and Alembic migrations |
| `scripts/data` | Deterministic extraction, validation, build and database load |
| `ml` | Statistical models, validation and optimization |
| `data` | Sources, dictionaries, registries and generated outputs |
| `docs` | Architecture, methods, operations and submission evidence |

## Local Setup

Requirements: Node 20+, pnpm 9, Python 3.11+, and Docker if running local
PostgreSQL/PostGIS. Run from the repository root:

```bash
cp .env.example .env
pnpm install --frozen-lockfile
npm --prefix apps/mobile ci
make install-api
make data
```

Edit `.env` privately before starting services. For a local database:

```bash
make db-up
make migrate
make load
make dev
```

The web app runs at `http://localhost:3000` and the API at
`http://localhost:8000`. Separate commands are `make api` and `make web`.
`bash scripts/dev.sh status` shows local service status. See
[developer setup](docs/reference/DEVELOPER_SETUP.md) for environment and database
options. Never run migrations or loaders against production unintentionally.

### Mobile With The Hosted API

Mobile is intentionally outside the pnpm workspace and uses its own npm lockfile:

```bash
cd apps/mobile
npm ci
EXPO_PUBLIC_API_BASE_URL=https://cropsmatics-api.onrender.com/api/v1 npx expo start --clear --tunnel
```

To submit a shareable Android APK build with the hosted backend configured in
the existing `release-apk` profile:

```bash
bash scripts/build_mobile_apk.sh release-apk \
  --api "https://cropsmatics-api.onrender.com/api/v1"
```

The helper validates the mobile lockfile, TypeScript, lint, tests, Expo config,
and the local `git` executable before submitting. EAS returns the artifact link
when the build completes. A successful build still needs physical-device
verification. Do not use the local-backend development profile for an APK
intended for remote users. See
[deployment](docs/17_DEPLOYMENT.md) for build configuration.

## Verification

```bash
make lint
make typecheck
make test
pnpm --filter cropmatics-web test
npm --prefix apps/mobile test
NEXT_PUBLIC_API_BASE_URL=https://cropsmatics-api.onrender.com/api/v1 pnpm --filter cropmatics-web build
(cd apps/web && npx playwright test --config=playwright.config.ts)
```

The Playwright command starts a deterministic file-backed API for local browser
verification and covers the dashboard scope workflow, chart persistence, reset,
forecast withholding/retry and responsive overflow at desktop and mobile-web
sizes. It is not a substitute for production smoke tests or a physical Android
device run.

The database integration suite needs an isolated PostGIS database through
`CANONICAL_TEST_DATABASE_URL`; never point it at a production database.
GitHub Actions runs web, mobile, API/integration, ML and pipeline jobs. Consult
the [actual workflow runs](https://github.com/Lambert-01/cropsmatics-/actions),
not merely the presence of a workflow file.

Entrypoints: `services/api/app/main.py`, `apps/web/app/page.tsx`,
`apps/mobile/app/index.tsx`, and `scripts/data/run_all.py`.
Check `/api/v1/health/readiness` for current backend/database readiness.

## Documentation And Data Rights

Use [the documentation index](DOCUMENTATION_INDEX.md) to find architecture,
methods, deployment and evidence. Superseded session reports and generated audit
inventories have been consolidated; their history remains available in Git.
Regression tests, source data and provenance documentation are retained.

See [data rights and provenance](DATA_LICENSE_AND_PROVENANCE.md). This repository
does not grant additional redistribution rights over third-party datasets.
