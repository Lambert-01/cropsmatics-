# Cropmatics Rwanda Project Rename Report

**Date:** 2026-09-25  
**Workspace:** `AgriNexus_Rwanda_Starter_Package/`  
**Remote repository:** not configured; no remote rename was attempted

## Identity

| Field | Value |
|---|---|
| Old project name | AgriNexus Rwanda |
| New project name | Cropmatics Rwanda |
| Short name | Cropmatics |
| Meaning | Crop + Informatics |
| Tagline | Crop Intelligence from Data to Action |

## Scope and preservation

The application architecture, functionality, statistical methods, official source URLs, source CSV values, survey variables, and NISR/MINAGRI provenance were preserved. The rename was applied to project-authored metadata, UI, package/configuration identifiers, documentation, and the project-authored data-pack filenames.

The workspace directory name was not physically changed. A local checkout can be renamed separately to `Cropmatics_Rwanda_Starter_Package`; this does not affect the application identifiers. The recommended remote repository slug is `cropmatics-rwanda`.

No Git history, branch, remote, deployment, store listing, or production database was modified. This workspace is not a Git repository.

## Branding and application changes

- Updated the current README, project overview, demo story, AI disclosure, metadata manifest, and data-architecture documentation to use Cropmatics Rwanda and the tagline.
- Updated the web layout metadata, header, overview page, and package name to `cropmatics-web`.
- Updated mobile visible branding and metadata to Cropmatics / Cropmatics Rwanda and the tagline.
- Updated API metadata and health responses to `Cropmatics Rwanda API` and `cropmatics-api`.
- Updated development database names, credentials, health checks, Compose container names, and volume name to `cropmatics`.
- Added the pinned `email-validator==2.3.0` runtime dependency required by the existing `EmailStr` auth schema so clean API installs can import the application.

## Package and runtime identifiers

| Surface | Current identifier |
|---|---|
| Root package | `cropmatics-rwanda` |
| Web workspace | `cropmatics-web` |
| Mobile workspace | `cropmatics-mobile` |
| Expo slug | `cropmatics-rwanda` |
| Expo URL scheme | `cropmatics` |
| iOS bundle identifier | `com.cropmatics.rwanda` |
| Android package | `com.cropmatics.rwanda` |
| API health service identifier | `cropmatics-api` |
| Development database | `cropmatics` |
| Compose database volume | `cropmatics_pgdata` |

No production Expo, EAS, Apple, Google Play, or deployment configuration was found in the workspace. If an app has already been registered with the former identifiers, update the store/EAS records and decide whether to preserve the old application ID for continuity or submit a new application.

## Data files and paths

The project-authored data pack was renamed as follows:

- `data/raw/agrinexus_real_data_2024_2026/` → `data/raw/cropmatics_real_data_2024_2026/`
- `AgriNexus_Core_Real_Data_2024_2026.xlsx` → `Cropmatics_Core_Real_Data_2024_2026.xlsx`

The original official workbook was retained at:

`data/raw/cropmatics_real_data_2024_2026/raw_official/Tables_2025_Season_B_0.xlsx`

The only workbook content changes were two project-authored metadata strings in `xl/worksheets/sheet10.xml`. Official workbook contents were not changed.

### Hashes

| Workbook | SHA-256 |
|---|---|
| Official workbook, before and after rename | `6fdfd6ababdfe82805aa72a71b5b30a3fe22dce0c9c7bb1d4735f7b39886c7d6` |
| Project-authored workbook, before metadata edit | `337e0ffd28ebaa81fe18b65c419291e5e3edb88379212f1a16fa372b0b228afe` |
| Project-authored workbook, after metadata edit | `aa5d9df01a1181098628790752fd48bb069d0ab3f0aada847f11c64a38516b9d` |

The raw manifest, data README, provenance documents, pipeline path constants, and dictionary documentation were updated to the new pack path. The dictionary header `agrinexus_use` was renamed to `analysis_use`.

## Database and existing installations

Configuration now defaults to the `cropmatics` PostgreSQL database and `cropmatics`-prefixed development credentials/volume. Existing databases, users, volumes, and production data were not renamed or deleted.

Before using a renamed production environment, manually plan one of these actions:

- provision a new `cropmatics` database and migrate or reload data; or
- retain the existing database and update the application connection settings deliberately.

The mobile local SQLite filename changed from `agrinexus.db` to `cropmatics.db`. Existing installations should migrate or copy the local database deliberately; the code does not silently move user data.

## Remaining legacy references

The final case-insensitive repository scan found legacy names only in dated historical documentation:

- `docs/00_REPOSITORY_AUDIT.md` — records the package and data-pack names as received.
- `docs/REPOSITORY_REFINEMENT_REPORT.md` — records the pre-rename refinement snapshot.

No old package name, old database name, old mobile bundle ID, old SQLite filename, or old data-pack path remains in active configuration or code. This report intentionally contains the old name for migration traceability.

## Validation

### Passed

- `corepack pnpm lint` using a temporary Corepack shim for the local shell: web lint passed; mobile lint passed with one existing unused-variable warning in `apps/mobile/app/sync.tsx:12`.
- `corepack pnpm typecheck`: web and mobile passed.
- `corepack pnpm test`: web and mobile passed; 6 JavaScript tests passed.
- `corepack pnpm build:web`: Next.js production build passed.
- `npx expo config --type public`: passed and reported the Cropmatics identifiers.
- `services/api/.venv/bin/pytest services/api/tests -q -ra`: 16 passed and 1 pre-existing optimization failure with OR-Tools installed; with OR-Tools absent, 14 passed and 3 were skipped.
- Ruff on all rename-touched Python files: passed.
- `services/api/.venv/bin/python -m pip check`: passed.
- JSON and TOML metadata parsing: passed.
- Workbook XML scan: no old brand strings in either workbook.

### Existing issues and environment limits

- `services/api/.venv/bin/ruff check .` reports 12 pre-existing style findings outside the rename-touched files.
- The full Python suite, with available scikit-learn and OR-Tools packages installed, reports 38 passed and 4 pre-existing failures: two productivity-gap benchmark assertions and two zero-allocation optimizer assertions. These failures are unrelated to branding or identifier changes.
- Installing the complete optional ML requirements could not finish because the pinned `llvmlite` dependency attempted a source build without CMake. This did not change repository files.
- Docker CLI is unavailable, so Compose/PostGIS startup was not executed.
- The first Python environment attempt used Python 3.14 and was replaced with Python 3.11, the project-supported version.

## Manual follow-up

1. Rename the local checkout directory if the old folder name is no longer desired.
2. Provision or migrate the development/production PostgreSQL database deliberately.
3. Update registered Expo/EAS, iOS, Android, and store identifiers if applicable.
4. Migrate existing mobile SQLite installations.
5. Review the four pre-existing optimizer and productivity-gap test failures separately.
6. Run Docker/PostGIS validation in an environment with Docker installed.
7. Initialize or connect Git and rename the remote repository to `cropmatics-rwanda` when collaboration begins.
