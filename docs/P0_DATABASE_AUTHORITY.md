# P0 — Database authority

This document records the **P0** pass that makes PostgreSQL the production
analytical authority for Cropmatics Rwanda, and the storage decision for every
data domain. It is written to be read alongside `docs/04_DATA_ARCHITECTURE.md`
and `docs/17_DEPLOYMENT.md`.

## 1. The read path

```
raw (immutable)  ->  Python ETL  ->  validation  ->  processed artefacts
                                                          |
                                                          v
                                              canonical PostgreSQL  (authority)
                                                          |
                                                          v
                                    FastAPI repositories -> web / mobile / AI / reports
```

The processed artefacts remain in the pipeline output on purpose. They are the
**reproducibility** record, the **download/export** source, and the explicit
**fallback** layer — not a parallel authority.

## 2. `CANONICAL_DATA_MODE`

`Settings.canonical_mode` decides which layer may answer an analytical read.

| Mode | Behaviour |
| --- | --- |
| `required` | PostgreSQL must be ready. A canonical-backed read that the database cannot serve fails with `503 DATABASE_UNAVAILABLE`; it is never answered from files. |
| `preferred` | PostgreSQL first. When it is unavailable the processed files stand in, and the answering layer is reported. |
| `file` | Processed files only. Development/testing. |

Unset means **`required` when `ENVIRONMENT=production`**, and `preferred`
otherwise. A production deploy therefore cannot quietly serve processed CSVs
while claiming canonical authority, and a fresh clone or CI keeps working
without a database.

The answering layer is reportable via `dataset_repository.canonical_source_status()`
and the `source` field on `GET /api/v1/data/version` and `/api/v1/data/coverage`.

### Where the switch lives

The dispatch is a single, well-tested seam in `app/repositories/dataset_repository.py`
(`_read`). Services keep their existing pandas logic and their response shapes —
they simply receive the DB-served frame instead of the CSV-served one.

**Parity is a test, not a hope.** `test_canonical_read_matches_the_processed_panel`
asserts the DB frame equals the CSV frame column-for-column, including NULLs, so
the two layers cannot silently diverge. To make that possible, provenance and
context columns that have no dedicated table column (agro-ecological zone, source
workbook/release/titles, processing script/version) are persisted in
`crop_productivity.metadata_json` by the loader and unpacked by the reader.

## 3. Readiness

`GET /api/v1/health/readiness` now answers two independent questions:

1. are the processed artefacts present (reproducibility/fallback layer); and
2. is the canonical database serving the expected dataset
   (`canonical_state`): URL configured, database reachable, **migrations
   applied**, tables present, dataset loaded, and **loaded version matches the
   processed manifest**.

In `required` mode the second question decides the verdict: the status is
`not_ready` (never `ready`) while any of those fail, and the failing steps are
named in `canonical_state.blocking`. In the other modes the response stays
`ready`/`degraded` on the artefact checks and reports the canonical state
separately. No secrets and no filesystem paths are exposed.

## 4. Deploy bootstrap

`scripts/data/canonical_bootstrap.py` (or `make bootstrap`) is the release step:

```
alembic upgrade head  ->  compare dataset version  ->  load only if it differs  ->  verify
```

The dataset version is content-addressed over the manifest, so "same version"
means the same inputs, not a coincidental timestamp. Running it repeatedly is
safe (migrations are idempotent, the loader upserts on business keys), and it
never drops or truncates. Deployment should run it instead of `uvicorn` starting
against an unmigrated or unloaded database.

## 5. CI

The `api` job runs a real `postgis/postgis:16-3.4` service container and sets
`CANONICAL_TEST_DATABASE_URL`. The canonical integration suite (`test_canonical_integration.py`)
therefore *runs* in CI instead of skipping, proving:

- migrations apply and create every canonical table (including `inquiry`);
- the loader succeeds and rejects nothing;
- a second load is idempotent;
- a dry run writes nothing;
- the DB panel equals the processed panel (parity, row counts, sample query);
- the inquiry receipt token is stored only as a SHA-256 hash;
- the unique `client_uuid` makes an offline retry idempotent.

A latent defect was fixed to enable this: `alembic/env.py` used to overwrite a
programmatically supplied URL with `DATABASE_URL`, which would have sent CI
migrations at the wrong database.

The service container **must** be a PostGIS image, not the plain `postgres:16`
image. The initial revision runs `CREATE EXTENSION IF NOT EXISTS postgis` and
declares `geometry` columns, so `alembic upgrade head` fails on the official
image with `FeatureNotSupported: extension "postgis" is not available` and every
test in the suite errors before it runs. This matches `docker-compose.yml`, which
has always used the PostGIS image, and production, where Neon/Supabase are
PostGIS-enabled.

## 6. Inquiry storage

Anonymous inquiries moved from an append-only JSONL file on the API host to the
`inquiry` table (migration `b3d9f1a45e72`). The plaintext receipt token is
returned exactly once at creation; only its SHA-256 hash is stored, and lookups
are constant-time. The JSONL file remains as the development/test backend, used
only when the table is unreachable **and** the mode is not `required` — under
`required`, a database that cannot serve the write is a `DATABASE_UNAVAILABLE`
failure rather than a silent file write.

Existing JSONL inquiries are intentionally not migrated: they cannot be
re-associated with a verifiable receipt hash, and inventing one would be worse
than leaving them in place.

## 7. Data-domain storage inventory

Every legitimate domain is classified. `A`–`C` are canonical storage; `D` is a
reproducibility artefact; `E` is intentionally not modelled.

| Domain | Class | Storage | Notes |
| --- | --- | --- | --- |
| Crop productivity panel (2024A–2026B) | A | `crop_productivity` | Authoritative; DB serves analytics in `required`/`preferred`. |
| Practice/input adoption (district) | B | `agricultural_observation` | Normalized (`practices`, `inputs`, `land_use`). |
| Land use (district) | B | `agricultural_observation` | `land_use` domain. |
| Irrigation & water sources | B | `agricultural_observation` | `irrigation` domain. |
| Erosion control | B | `agricultural_observation` | `erosion` domain. |
| Post-harvest use & loss | B | `agricultural_observation` | `postharvest`, national × crop. |
| National practice trends | B | `agricultural_observation` | `practices`, national only. |
| Indicator / unit / source dictionaries | C | `indicator`, `unit`, `source_table`, `data_source` | Seeded from `app/data/catalogue.py`. |
| Period dimension | C | `period` | Derived from loaded rows, never hard-coded. |
| Dataset/ingestion lineage | C | `dataset_version`, `data_ingestion_run` | Content-addressed version + per-table accounting. |
| Anonymous inquiries | C | `inquiry` | Hashed receipt token; see §6. |
| Joined training table (`district_crop_productivity`, `training_district_crop`) | D | processed file | Legacy single-release join; not yet a canonical table. Consumers read it via the CSV. |
| National crop trends (context series) | D | processed file | Context series, not a district estimate. |
| Dashboard overview | D | processed file | Derived convenience aggregate. |
| Coverage / sources metadata | D | processed file | Pipeline metadata. |
| MINAGRI cold-chain / post-harvest infrastructure context | D | processed file | Program context; capacity deliberately not published. |
| Verified market prices | E | — | No verified observation exists. `market_price_observation` is header-only; Markets stays hidden. |
| Weather / rainfall | E | — | No source ingested. Never fabricated. |
| Soil properties | E | — | No source ingested. |
| Transport cost | E | — | No source ingested. |
| Field-operations records (harvest registration, sync queue) | E (local) | device storage | Optional; the public analytics app works without it. |

### Observation-backed reads are canonical too

The five wide indicator files in `B` are served from `agricultural_observation`.
`canonical_repository.observation_frame()` inverts the loader's mapping — using
the same catalogue, so the two cannot disagree about which column an indicator
writes to — and rebuilds each wide file from the normalized rows. The processed
file's header supplies the *column contract*; the database supplies the *values*.

Parity is a test, not an assumption: for each of the five files the rebuilt frame
is asserted equal to the artefact column-for-column and row-for-row (including
NULLs and the published crop variant), and a separate test pins that a blank cell
never becomes a zero.

`required` mode therefore covers the productivity panel (`/productivity`,
`/productivity/trend`, the period catalogue, and the map/report/priority paths
resolving through `analytics_service.productivity_frame`), and the practices,
inputs, land use, irrigation, erosion, post-harvest and national-input reads.

### Still on the processed file (explicit, not accidental)

The legacy joined training table (`district_crop_productivity`,
`training_district_crop`) and the derived context series (`national_crop_trends`,
`dashboard_overview`, coverage/sources metadata, the MINAGRI cold-chain context)
remain file-served in every mode. They are either a legacy join of data that is
canonical elsewhere or a convenience aggregate, not a second authority. Their
`required`-mode enforcement lands with their migration; the inventory above keeps
that gap visible rather than assumed.

### A constraint that had to change

Making the observation reads canonical surfaced a real latent defect: the table's
`value <= 100 * 1000` CHECK rejected a genuine published figure (102,013 ha of
agroforestry in one district), so a canonical load would have **failed** on
legitimate source data. Migration `c81e4a2d97f0` replaces it with a non-negative
constraint, and the unit-aware rule (a share cannot exceed 100; a hectare total
has no ceiling) now lives in the loader, which can see the indicator's unit — a
CHECK cannot join `unit` in PostgreSQL.

## 8. Observation provenance attribution

Normalized observations used to carry `source_table_id = NULL` while every panel
row pointed at a real published worksheet, so "which table is this from?" was
answered to a different depth depending on the domain.

Observations are now attributed at the finest granularity the extract actually
supports (`app/data/catalogue.py`):

| The source description says | Attributed to |
| --- | --- |
| exactly one table ("... - Table 14") | that worksheet |
| several ("... - Tables 30-31") | the release-level row, with the full list kept in `metadata_json.source_tables` |
| none ("... - uploaded table workbook") | the release-level row |

`source_table.granularity` (migration `d4b7c1e85a23`) records which of the two it
is, so a dataset-level row is never mistaken for a worksheet whose sheet is
simply missing. On the current data this attributes 1477 observation rows with
**zero** unresolved references: 238 worksheet-level and 1239 release-level, and
the 720 rows drawn from a multi-table extract name both tables rather than
claiming one.

Parsing is a reading of published text, not an inference: the raw source
string is stored verbatim on the provenance row, and a description with no table
reference yields an empty list instead of a guessed table.

### Web: global header and search

The header no longer duplicates the analytical filter bars. Period/crop/district
selectors were removed (each analytical page already renders its own filter bar,
and two control sets writing one state could disagree), the notification and
profile buttons were removed because neither system exists, and the active scope
is now shown read-only. Global search **navigates** instead of mutating hidden
state: a crop opens `/productivity?crop=…`, a district opens `/maps?district=…`,
and a dataset opens `/data-explorer?dataset=…` (the Data Explorer now honours that
parameter).

### Web: Yield Intelligence workspaces

Yield Intelligence was one long scroll of eight stacked analyses; reaching the
last one meant scrolling past the other seven. It is now eight focused
workspaces — Overview, Trends, Spatial, Gaps, Drivers, Scenarios, AI Analyst and
Methodology — selected in the URL (`?workspace=`) so a link reopens the same one.

- **Every workspace renders real analysis.** No placeholder tabs were added, and
  the crop-required state is shown instead of the tab strip, so a reader is never
  offered a workspace that cannot deliver.
- Two items the brief lists are deliberately **absent because the data does not
exist yet** — a map `change` layer and an indexed trend. The map offers the six
  metrics the API actually computes (yield, gap, priority, input adoption,
  irrigation, erosion protection); inventing the others would be the
  invented-precision failure this platform avoids everywhere else.
- **Overview** is capped at the four crop-specific KPIs plus a same-season change
  stated in full, the below/at-benchmark split and the two districts to look at
  first. The compact same-season card *is* its trend statement; a second chart
  would only duplicate the Trends workspace.
- **Spatial** adds a district drawer: selecting a district on the map or in the
  ranking scopes the page to it and opens its published yield, benchmark, gap,
  production and area, with a prompt for the AI Analyst. Same-season change and
  the period list appear only once that district is the active selection, and are
  never substituted from another district.
- **Drivers** states `ASSOCIATION IS NOT CAUSATION` and names the reference
  release the practice survey actually comes from.

## 2022A–2026B repair (canonical content identity and out-of-sync contract)

The production database was stale: it held 8 periods (2024A–2026B, 3,738
productivity rows) while the built panel holds 14 periods (2022A–2026B, 6,156
rows). No read ever failed, because a stale database is still "non-empty" — so
the gap was silent. The following changes make that state impossible to publish
quietly.

### Content-addressed dataset identity

`content_version()` (now in `app/data/versioning.py`, re-exported by
`scripts/data/load_postgres.py`) is derived **only from content**:

* the pipeline/transformation version,
* the SHA-256 of every canonical processed output,
* the SHA-256 of every raw source **and of every relevant SAS release**
  (`manifest.json["sas_inputs"]`, one hash per published extraction),
* the row counts.

`build_timestamp` and `git_sha` are deliberately excluded. They change on every
rebuild of identical data, so including them made "same version" mean "same
clock" and made the pre-deploy bootstrap re-load thousands of unchanged rows on
every deploy. Identical inputs and outputs now hash identically; any changed
figure changes the hash.

### Verification is not "the table is non-empty"

`scripts/data/canonical_bootstrap.py` now verifies, after the load:

* the productivity row count equals the processed panel's,
* the database's period set equals the processed panel's, and
* the historical periods (`2022A`–`2023C`) are present.

A pass prints the verified row count and period range. A non-empty table that
holds only the recent releases fails.

### Readiness reports the real expectation

`GET /health/readiness` → `canonical_state` now carries `expected_version`
(the processed build's version, **not** an echo of the loaded one),
`dataset_version` (loaded), `expected_productivity_rows` and
`loaded_productivity_rows`, and `expected_row_counts` vs `loaded_row_counts`.
When they disagree the blocking list contains `canonical_dataset_out_of_sync`,
and the `canonical_dataset_version` check carries the expected and loaded
versions and counts.

### Out-of-sync is a structured 503, not a successful stale read

In `CANONICAL_DATA_MODE=required` the identity check runs **before** any read.
A reachable database that serves a different dataset than the image was built
from raises `DatasetOutOfSync`, which the API maps to:

```json
{
  "code": "DATASET_OUT_OF_SYNC",
  "message": "... expected version '0.2.0-...', loaded '0.2.0-...'",
  "expected_version": "0.2.0-...",
  "loaded_version": "0.2.0-...",
  "expected_periods": ["2022A", "..."],
  "loaded_periods": ["2024A", "..."],
  "retryable": true
}
```

An unreachable or empty database keeps returning `DATABASE_UNAVAILABLE`; only a
reachable-but-different dataset is `DATASET_OUT_OF_SYNC`.

### Release flow

The canonical load is a **release step**, never a request and never the Start
Command. `render.yaml` declares
`preDeployCommand: python /app/scripts/data/canonical_bootstrap.py`, a
uvicorn-only Start Command and `healthCheckPath: /api/v1/health/readiness`. A
blueprint does not update a service that already exists, so the dashboard
checklist in `docs/17_DEPLOYMENT.md` §5 remains the source of truth for the live
service. Render documents that the pre-deploy command is available for **paid**
web services only, so a Free-plan service needs the approval-gated alternative in
`.github/workflows/release-database.yml`.

### The build must be reproducible, or the identity check is a trap

The canonical load is skipped when the database already holds the expected
version, and a mismatch is refused. That contract only holds if the same commit
always builds the same dataset, so the build is now checked for it:

* `scripts/data/ingest_sas_tables.py` derived its post-harvest crop names by
  reading `data/interim/crop_alias_map.csv`, an artefact `normalize_crops` writes
  **later** in the same pipeline. A pristine build therefore kept the raw
  published labels while a second build in the same tree resolved them to
  canonical ones — two datasets, two versions, one commit. The alias map is now
  derived (`normalize_crops.alias_map()`) from the committed inputs, so no build
  order can change what the dataset contains.
* `scripts/data/check_idempotent_build.py` rebuilds the pipeline and fails when
  the content-addressed version moves. CI runs it in the `data-pipeline` job.
* `canonical_bootstrap.py --dry-run` writes nothing at all — migrations
  included — and reports the pending migration state instead, so the production
  plan step can be run against the live database without side effects.
* `/data/version` and `/data/coverage` carry `canonical_sync`
  (`in_sync`, `expected_version`, `loaded_version`) and state the mismatch in
  words, so a stale loaded dataset can no longer be read as the current one from
  a status endpoint.
