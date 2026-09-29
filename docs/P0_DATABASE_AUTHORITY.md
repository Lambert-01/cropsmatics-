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

The `api` job runs a real `postgres:16` service container and sets
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
