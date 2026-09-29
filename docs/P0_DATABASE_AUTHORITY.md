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

### Still on the processed file (explicit, not accidental)

The `B` tables above are loaded into `agricultural_observation`, but the
**analytics read paths** for practices/irrigation/erosion/post-harvest still read
their processed file. Reconstructing the wide per-indicator CSV shape from the
normalized long table is a separate read-path change with its own parity test,
and it is scoped as the next step rather than smuggled in here.

Consequently `required` mode is enforced today for the canonical-backed reads
(the productivity panel: `/productivity`, `/productivity/trend`, the period
catalogue, and the map/report/priority paths that resolve through
`analytics_service.productivity_frame`). Endpoints still served from the legacy
joined training table and the national context series continue to read the
processed file in every mode. Those read paths are the next item on the list, and
their `required`-mode enforcement lands with them — the inventory above is what
keeps that gap visible rather than assumed. The `A` panel — the headline
analytical dataset — is DB-authoritative now.
