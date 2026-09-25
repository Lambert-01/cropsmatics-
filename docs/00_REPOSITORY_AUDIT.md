# 00. Repository Audit

**Audit date:** 2026-09-25
**Auditor role:** senior full-stack / data / ML / DevOps review
**Scope:** the repository exactly as received (pre-refinement).

This document records **what exists before refinement**. It intentionally retains the original
project and data-pack names as a dated historical record. See
[PROJECT_RENAME_REPORT.md](PROJECT_RENAME_REPORT.md) for the current identity, and
[REPOSITORY_REFINEMENT_REPORT.md](REPOSITORY_REFINEMENT_REPORT.md) for what was changed.
See [DATA_PROVENANCE.md](DATA_PROVENANCE.md) for source tracing.

---

## 1. Inventory (as received)

```
AgriNexus_Rwanda_Starter_Package/
├── README.md, DOCUMENTATION_INDEX.md, DATA_LICENSE_AND_PROVENANCE.md,
│   PROJECT_TREE.txt, manifest.json, .env.example
├── .github/workflows/ci.yml
├── apps/
│   ├── web/     → app/page.tsx, package.json
│   └── mobile/  → app/index.tsx, package.json
├── services/api/ → app/main.py, requirements.txt
├── ml/          → src/{productivity_gap,intervention_priority,storage_optimization}.py,
│                  notebooks/ (empty)
├── data/
│   ├── AgriNexus_Real_Data_2024_2026/   ← 9 CSVs + 2 XLSX + manifest + README
│   ├── official_derived/                ← 4 CSVs (older extracts)
│   ├── demo_synthetic/                  ← demo_harvest_registrations.csv
│   ├── dictionaries/                    ← sas_2024_core_variable_map.csv
│   └── source_registry/                 ← data_sources.csv
├── docs/        → 21 numbered markdown files (01–21)
├── scripts/     → README.md only (no scripts)
└── infra/       → README.md only
```

**Totals:** 59 tracked files. Code is present but skeletal; documentation is
substantially ahead of implementation.

---

## 2. What is usable immediately

| Area | Asset | Verdict |
|---|---|---|
| Data | `data/AgriNexus_Real_Data_2024_2026/01_district_crop_productivity_2025B.csv` (510 rows, district×crop×season) | **High value**, immediately model-ready |
| Data | `.../02_district_productivity_factors_2025B.csv` (30 districts × input/practice %) | **High value**; joins to 01 on `year+season+district` |
| Data | `.../05_crop_postharvest_use_2025B.csv` (21 crops: sold/consumed/stored/loss %) | Usable for post-harvest logic |
| Data | `.../06_national_crop_trends_2024_2026.csv` (108 rows) | Usable for benchmarks/trends |
| Data | `.../03_irrigation_water_2025B.csv`, `.../04_erosion_control_2025B.csv` | Usable for irrigation/erosion logic |
| Data | `.../07_national_input_practice_trends_2024_2026.csv` | Usable for national context |
| Data | `.../08_verified_cold_chain_context_2026.csv` | Usable **only** as district context; capacity intentionally blank |
| Data | `.../raw_official/Tables_2025_Season_B_0.xlsx` + `.../AgriNexus_Core_Real_Data_2024_2026.xlsx` | Original official workbooks (immutable) |
| Docs | 01–21 markdown design set | Coherent intent; strong problem/statistical framing |
| ML | 3 prototype functions | Correct formulas, no packaging/tests |
| Backend | FastAPI `main.py` (`/health`, `/api/v1/meta`) | Starts, but trivial |

---

## 3. Problems found

### 3.1 Structure / build blockers

1. **No root workspace.** No root `package.json`, `pnpm-workspace.yaml`,
   `Makefile`, `docker-compose.yml`, or `pyproject.toml`. Each app must be
   installed by hand.
2. **No `.gitignore`.** Nothing prevents committing `.env`, `node_modules`,
   `.venv`, `__pycache__`, build output or large artefacts.
3. **Not a git repository.** `git status` fails; no history, no branch.
4. **Web app is not runnable as configured.** Missing `tsconfig.json`,
   `next.config.*`, Tailwind config, `app/layout.tsx`, `app/globals.css`.
   `package.json` uses `"latest"` for every dependency (non-reproducible).
5. **Mobile app is not runnable as configured.** Missing `app.json`/`app.config`,
   `tsconfig.json`, `babel.config.js`, `app/_layout.tsx` (required by
   `expo-router` entry). `main` points at `expo-router/entry` with no router tree.
6. **Backend has no package structure.** Only `app/main.py`; no `__init__.py`,
   no `app/api`, no config/db/models/schemas layers, no `tests/`.
7. **Dependencies unpinned.** `requirements.txt` and both `package.json` files use
   floating versions (`latest`, bare names). Builds are not reproducible.
8. **`.env.example` first line is `[TEMPLATE]`** — not valid dotenv syntax and is
   copied verbatim by users.
9. **Empty directories** (`ml/notebooks`, `scripts/`, `infra/`) carry no content.

### 3.2 Data problems

1. **Two competing data locations.** `data/AgriNexus_Real_Data_2024_2026/`
   (new, richer) coexists with `data/official_derived/` (older, partly
   superseded: `nisr_sas_2025b_crop_production_yield.csv`,
   `nisr_sas_2026_season_*_summary.csv`, `minagri_aces_cold_chain_2026_context.csv`).
   Readers cannot tell which is authoritative.
2. **No stratified data layout.** Official raw, derived, synthetic and
   reference data all live under `data/` at the same level, inviting accidental
   mixing of official and synthetic data (explicitly forbidden by the brief).
3. **Synthetic data is not isolated.** `data/demo_synthetic/` sits beside
   official data; the brief requires `data/dev_fixtures/` clearly marked
   `SYNTHETIC / TEST ONLY`.
4. **Missing values are unencoded.** `01_...csv` leaves `cultivated_area_ha`
   blank for some rows and uses `0` for both "no crop" and "no harvest",
   which conflates missingness with true zero.
5. **No validation, no provenance columns, no pipeline.** The brief requires
   `source_id`, `retrieved_at`, `processing_script`, `processing_version`,
   etc.; none exist. Raw → interim → processed is not implemented.
6. **Districts are not reconciled to a canonical geography** (names, codes,
   provinces). No dictionary of the 30 districts / 5 provinces is present.
7. **Crops are free-text-ish** (e.g. `Yams & Taro`, `Paddy rice`, `Other crops`)
   with no canonical code / Kinyarwanda name / perishability metadata.
8. **Manifest inconsistency.** root `manifest.json` says
   `"synthetic_demo_data": true`; the data-pack manifest says
   `"synthetic_records_included": false`. Both are technically about different
   folders, but read as contradictory.

### 3.3 Documentation problems

1. **`PROJECT_TREE.txt` is stale** — it omits the entire
   `data/AgriNexus_Real_Data_2024_2026/` pack that actually exists.
2. **`DOCUMENTATION_INDEX.md` omits** the data-pack README and any audit/report.
3. **Overlap/duplication:** `04_ALGORITHM_DESIGN.md` duplicates content that also
   belongs in ML/optimization/risk docs; the brief's target doc set is not met
   (no `DATA_ARCHITECTURE`, `DATABASE_SCHEMA`, `API_ARCHITECTURE`,
   `INTERVENTION_ENGINE`, `POST_HARVEST_MODEL`, `OPTIMIZATION_ENGINE`,
   `AI_ASSISTANT`, `DATA_PROVENANCE`, `MODEL_INTERPRETATION_POLICY`,
   `00_REPOSITORY_AUDIT`, `REPOSITORY_REFINEMENT_REPORT`).
4. **`README.md` does not cover** "what is implemented vs not", commands, or
   Mermaid architecture diagram.

### 3.4 Configuration / security

1. **No secret management guidance beyond a placeholder**; `.env.example`
   instructs `JWT_SECRET=change-me` with no rotation/secret-store note.
2. **No CORS, auth, rate-limit, or audit configuration** anywhere in code.
3. **`requirements.txt` mixes runtime + heavy ML (`ortools`, `scikit-learn`)
   with no dev/test split and no lock/pin.**
4. **CI is a smoke test only** — it asserts four files exist. No lint,
   typecheck, or tests run, so regressions cannot be caught.

### 3.5 Missing implementation (expected at this stage)

Auth/RBAC, database models & migrations, analytics endpoints, productivity-gap
service, intervention engine, post-harvest risk, storage optimizer service,
mobile offline sync, i18n, design tokens, tests, deployment config. All are
greenfield — acceptable for a starter, but they must rest on a sound skeleton.

---

## 4. Risk assessment

| Risk | Severity | Notes |
|---|---|---|
| Official/synthetic data mixing | **High** | Breaks scientific integrity + judging |
| Non-reproducible installs (`latest`) | **High** | Demo may break on a clean machine |
| No DB/models/migrations | **High** | Blocks the whole MVP vertical slice |
| No tests / weak CI | Medium | Silent regressions |
| Stale tree/index docs | Low | Onboarding friction |
| Unpinned Python deps | Medium | `ortools`/`pandas` wheel drift |

---

## 5. Recommended corrections (executed in refinement)

1. Add root workspace tooling: `package.json` + `pnpm-workspace.yaml`,
   `Makefile`, `docker-compose.yml`, `pyproject.toml`, `.pre-commit-config.yaml`,
   `.gitignore`, fixed `.env.example`.
2. Reorganize data into `raw | external | interim | processed | dictionaries |
   source_registry | dev_fixtures`, with official sources immutable under `raw`.
3. Build a deterministic `scripts/data/*` pipeline with provenance and
   validation; never hand-edit model datasets.
4. Restructure the API into a real FastAPI package with typed settings, SQLAlchemy
   2 models, Alembic-ready layout, repositories, services, and `/api/v1` routes.
5. Package ML into importable modules with configurable benchmarks and tests.
6. Make web and mobile actually start (configs, layout, tokens, i18n, sync skeleton).
7. Pin dependencies; split API runtime vs ML vs dev requirements.
8. Rewrite README with status + commands + Mermaid; reorganize docs to the
   target scheme and add provenance/policy/report documents.
9. Upgrade CI to lint, typecheck, and test.
