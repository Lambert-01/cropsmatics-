# Repository Refinement Report

**Date:** 2026-09-25
**Scope:** transform the starter package into a clean, professional, reproducible,
data-science-ready full-stack foundation (not to finish the application).

Companion document: [00_REPOSITORY_AUDIT.md](00_REPOSITORY_AUDIT.md) (state before).
This is a dated refinement snapshot; its original project and data-pack names are
retained for historical accuracy. The current identity and migration notes are in
[PROJECT_RENAME_REPORT.md](PROJECT_RENAME_REPORT.md).

---

## 1. What I found

**Strengths**

- A coherent, well-written 21-document design set with strong statistical framing.
- Genuinely valuable real data: a 2024–2026 NISR/MINAGRI pack (510 district × crop
  productivity rows, 30-district factor table, national trends, post-harvest use)
  plus the original official workbook.
- Correct prototype formulas for the gap index, priority score and transportation
  optimizer, and a sensible stacked choice for web/mobile/API/DB.

**Problems** (full detail in the audit)

- No root workspace tooling; no `.gitignore`; not a git repository.
- Web and mobile could not actually start (missing tsconfig, app config, layout,
  Tailwind, Expo Router tree).
- Backend was a single `main.py`; no config/db/models/schemas/services/api layers.
- Two competing data locations; synthetic data not isolated; no raw→interim→processed
  separation; no validation or provenance.
- Unpinned dependencies (`latest`), invalid `.env.example`, stale `PROJECT_TREE.txt`,
  CI that only asserted files exist.

## 2. What I changed

**Root / tooling**
- Added `package.json` + `pnpm-workspace.yaml`, `Makefile`, `docker-compose.yml`
  (PostGIS), root `pyproject.toml` (ruff/black/pytest), `.pre-commit-config.yaml`,
  and a comprehensive `.gitignore`.
- Rewrote `.env.example` as a valid, documented template (all keys the code reads).
- Split Python deps into `requirements.txt` (runtime), `requirements-dev.txt`,
  `requirements-ml.txt`, all pinned.
- Added `services/api/Dockerfile`.

**Data layer**
- Reorganized `data/` into `raw | external | interim | processed | dictionaries |
  source_registry | dev_fixtures`.
- Moved the real pack to `data/raw/agrinexus_real_data_2024_2026/` (immutable,
  original workbook preserved); moved older extracts to `interim/legacy_official_derived/`;
  moved synthetic demo data to `data/dev_fixtures/synthetic/` with a SYNTHETIC warning.
- Added dictionaries: `districts.csv` (30 districts, province, coarse AEZ) and
  `crops.csv` (17 categories + metadata), plus READMEs.

**Data pipeline (new, deterministic)**
- `scripts/data/`: `common`, `validate_raw`, `normalize_geography`, `normalize_crops`,
  `build_district_crop_dataset`, `build_factor_dataset`, `build_postharvest_dataset`,
  `build_training_dataset`, `load_database`, `run_all`.
- Adds provenance columns to every processed row; never imputes; emits a validation
  report; records crop aliases explicitly.

**Backend**
- Restructured into `app/{core,db,models,schemas,repositories,services,analytics,
  optimization,api/v1}` with typed settings, Argon2 + JWT security, SQLAlchemy 2
  models for all required entities, `/api/v1` routers (health, auth, geography,
  crops, analytics, harvests, facilities, optimization, reports, assistant),
  CORS, logging and a 503 handler for unbuilt datasets.
- Added Alembic scaffolding (`alembic.ini`, `env.py`, template) and pytest tests.
- `main.py` now wires the app; the analytical endpoints read processed tables so the
  public demo works without a database.

**ML**
- Packaged into `ml/src/{data,features,models,evaluation,explainability,optimization,
  utils,pipelines}` with configurable benchmarks, season/district-aware validation,
  pure-Python metrics, explainability helpers, a baseline training pipeline, and tests.

**Web**
- Runnable Next.js app: tsconfig, Next/Tailwind/PostCSS/ESLint config, App Router
  layout with navigation, design tokens, provenance panel, risk badge (icon+text+colour),
  and pages for overview, dashboard, productivity, interventions, storage, transparency.
- Institutionalised UI/UX + bilingual ia.

**Mobile**
- Runnable Expo app: `app.json`, tsconfig, Babel config, Expo Router layout, theme
  tokens, i18n (English/Kinyarwanda), offline SQLite layer, sync queue, API client,
  and screens for home, harvest registration and sync status.

**CI / docs**
- CI now runs web lint/typecheck/test, mobile lint/typecheck/test, API ruff+pytest,
  ML ruff+pytest, and the data pipeline end-to-end.
- Reorganized `docs/` to the target scheme, added `04_DATA_ARCHITECTURE`,
  `11_INTERVENTION_ENGINE`, `12_POST_HARVEST_MODEL`, `13_OPTIMIZATION_ENGINE`,
  `14_AI_ASSISTANT`, `DATA_PROVENANCE`, `MODEL_INTERPRETATION_POLICY`, this report
  and `00_REPOSITORY_AUDIT`; moved extra docs to `docs/reference/`.
- Rewrote `README.md` (status, architecture diagram, commands).

## 3. What I intentionally did NOT change

- **The original official workbooks and all source CSVs** — kept byte-for-byte.
- **The core design documents' intent** — renumbered/renamed, not rewritten away;
  superseded originals are preserved under `docs/reference/`.
- **The prototype algorithm decisions** (gap formula, priority weights, rule-based
  risk) — kept, but made configurable and documented rather than replaced.
- **The data values** — no numbers were invented, imputed or "cleaned" into different
  values; only flags/annotations were added.
- **Deployment** — not provisioned; documented only (out of scope for this pass).

## 4. Current architecture

```text
agrinexus-rwanda/
├── apps/
│   ├── web/        next.config, tailwind, tsconfig, app/, components/, features/,
│   │               services/, lib/, types/, tests/
│   └── mobile/     app.json, babel, tsconfig, app/ (router), src/{theme,i18n,
│                   database,sync,services,store,types,utils,constants}, tests/
├── services/api/   app/{core,db,models,schemas,repositories,services,analytics,
│                   optimization,api/v1}, tests/, alembic/, requirements*.txt, Dockerfile
├── ml/             src/{data,features,models,evaluation,explainability,
│                   optimization,utils,pipelines}, tests/, artifacts/, reports/
├── data/           raw/ external/ interim/ processed/ dictionaries/
│                   source_registry/ dev_fixtures/
├── scripts/        data/ db/ dev/ deployment/
├── docs/           numbered set + reference/
├── package.json, pnpm-workspace.yaml, Makefile, docker-compose.yml,
│   pyproject.toml, .pre-commit-config.yaml, .gitignore, .env.example
```

## 5. Data readiness

| Dataset | Status |
|---|---|
| District × crop productivity (01) | **Usable immediately** |
| District factors (02) | **Usable immediately** (joins on year+season+district) |
| Post-harvest use (05) | **Usable immediately** |
| National crop trends (06) / input trends (07) | **Usable immediately** (context) |
| Irrigation (03) / erosion (04) | **Usable immediately** (feature logic) |
| Cold-chain context (08) | Usable as **context only** (capacity intentionally blank) |
| External (rainfall, soil, OSM) | **Not available** — register + download when licensed |
| Synthetic fixtures | Test-only |

## 6. Build readiness

| Component | Status | Notes |
|---|---|---|
| Data pipeline | **READY** | deterministic; pandas required |
| ML | **READY** | pure modules testable; sklearn/ortools optional |
| API | **PARTIALLY READY** | runs without DB (file-backed analytics); auth/harvest need Postgres |
| Database | **PARTIALLY READY** | models + Alembic configured; no initial migration committed |
| Web | **READY** | starts; needs API running for data |
| Mobile | **READY** | starts; offline flow works without API |

## 7. Remaining blockers

1. **No committed initial Alembic migration.** Run `alembic revision --autogenerate`
   against a live PostGIS database once, review, commit.
2. **No local toolchain verification in this environment** (pnpm/pandas/pytest were not
   installed here): install and run `make install`, then `make test`, `make typecheck`,
   `make data` to confirm on a normal machine.
3. **Kinyarwanda strings and crop labels** are working translations — need native review.
4. **Facility reference data** (names, coordinates) is not seeded; only cold-chain
   district context exists.
5. **Not a git repository yet** — initialize and make the first commit before
   collaborative work.

## 8. Recommended implementation order

1. **DB bootstrap** — init git, `make db-up`, generate + commit the first Alembic
   revision, seed `province`/`district`/`crop` from dictionaries, wire `make db-init`.
2. **Productivity vertical slice** — serve `training_district_crop` through
   DB-backed analytics; render the productivity map/heat table in web.
3. **Auth + RBAC** — finish DB-backed register/login/me, seed roles, protect
   planner endpoints and audit-log writes.
4. **Harvest capture end-to-end** — mobile register → offline outbox → idempotent sync
   → Postgres → risk score → recommendation.
5. **Storage optimizer UI** — feed verified capacity snapshots; show
   "capacity not verified" explicitly.
6. **Feedback loop** — capture recommendation acceptance + outcomes; connect to model
   retraining.
7. **External enrichment** — register and ingest rainfall/soil at compatible geography.

## 9. First coding task (do this next)

**Generate and commit the initial database migration and seed reference data.**

- Start PostGIS (`make db-up`).
- `cd services/api && alembic revision --autogenerate -m "initial schema"`, review the
  generated file, then `alembic upgrade head`.
- Add a small seed script (`scripts/db/seed_reference.py`) that loads
  `data/dictionaries/{districts,crops}.csv` into `province`, `district`, `crop`.
- Verify with `make db-init` + a smoke query, then commit.

This unblocks every DB-backed feature (auth, harvest sync, stored analytics) with the
least risk.

---

## 10. Commands reference

**Install**

```bash
cp .env.example .env
pnpm install
make install-api
```

**Run**

```bash
make api        # FastAPI  :8000
make web        # Next.js  :3000
make mobile     # Expo
```

**Database**

```bash
make db-up      # PostGIS
make migrate    # alembic upgrade head
make db-init    # create tables from models (dev)
```

**Data**

```bash
make data            # validate + build processed tables
make data-validate   # validation report only
python scripts/data/load_database.py   # load into Postgres
```

**Tests**

```bash
make lint
make typecheck
make test       # API + ML pytest
```

**ML**

```bash
make ml         # baseline model -> ml/reports/
```
