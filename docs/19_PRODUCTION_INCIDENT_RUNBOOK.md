# 19. Production incident runbook (Render + Neon + Vercel)

Read this with [`17_DEPLOYMENT.md`](17_DEPLOYMENT.md) (what the release process
must be) and [`P0_DATABASE_AUTHORITY.md`](P0_DATABASE_AUTHORITY.md) (why a
`503` is sometimes the correct answer).

Everything here is **read-only unless a step says otherwise**, and the write step
is behind an explicit approval gate. Never paste a credential into a ticket, a
screenshot, a commit or a report: refer to the key name, not its value.

## 1. First five minutes

```bash
python scripts/verify_production.py --json /tmp/smoke.json
```

This is the whole triage in one command: liveness, readiness, dataset version and
coverage, the dashboard overview, input adoption, the canonical trend, practice
indicators, post-harvest history, crops and the period catalogue. Read the table
before opening any dashboard.

| What the smoke test says | What it means | Where to go |
| --- | --- | --- |
| `liveness` fails, everything fails | The service is not running (or is asleep on the Free plan) | §3, then the Render dashboard's logs |
| `liveness` passes, `readiness` is `503 not_ready` with `canonical_dataset_out_of_sync` | The database is reachable but serving a different dataset than the image | §4 — this is a release-step problem, not an application bug |
| `readiness` `503` with `canonical_not_ready` / `database unreachable` | `DATABASE_URL` missing, Neon unreachable, or the pool is exhausted | §2 and §5 |
| `readiness` `503` with `migrations_not_applied` | `alembic upgrade head` has not run against this database | §4 |
| Required analytics endpoints `503 DATASET_OUT_OF_SYNC`, but `/crops`, `/meta/periods`, `/data/*` answer | Expected: file-backed and status reads work; canonical reads are refused on purpose | §4 |
| Everything `200` but a panel looks empty | A data question, not an availability question | Check `/data/coverage` for the period and level |

## 2. Readiness, and what each field means

```bash
curl -sS $API/health/readiness | jq '{status, canonical_data_mode, canonical_state}'
curl -sS -o /dev/null -w '%{http_code}\n' $API/health/readiness    # 503 while not_ready
```

`canonical_state` is the diagnosis:

| Field | Meaning when wrong |
| --- | --- |
| `database_configured` | `false` → `DATABASE_URL` is not set on the service |
| `availability` | `unavailable` → unreachable (host, SSL, credentials, pool); `empty` → schema present, nothing loaded |
| `migrations_applied` | `false` → the Alembic chain is behind `head` |
| `tables_present` | `false` → tables missing entirely (a migration never ran) |
| `dataset_loaded` | `false` → no `dataset_version` row: the loader has never succeeded here |
| `version_matches_manifest` | `false` → **the loaded dataset is not the one this build published.** This is the incident class in §4 |
| `expected_version` vs `dataset_version` | The build's identity vs the database's. They must be equal |
| `expected_productivity_rows` vs `loaded_productivity_rows` | Row-count parity (e.g. 6,156 for the 2022A–2026B panel) |
| `blocking` | The named failing steps, in the order they are checked |

`/data/version` and `/data/coverage` also carry `canonical_sync`
(`in_sync`, `expected_version`, `loaded_version`). A `loaded_version` that differs
from `expected_version` is the mismatch, stated in both endpoints.

## 3. Free-plan behaviour (do not misdiagnose it)

* Free instances **spin down when idle** and cold-start on the next request. The
  first request after a sleep can take tens of seconds, and a client timeout is
  not an outage. `/health` (root) is the cheapest thing to poll.
* A **cold start does not produce `DATASET_OUT_OF_SYNC`**. That code comes from
  the application after it has talked to the database. If you see it, the
  instance is awake and the data is wrong — sleep is not the cause.
* The Free plan **cannot run a Pre-Deploy Command** (Render: "available for paid
  web services"). No release step runs on deploy, which is why §4 recurs. See
  "Release step" in `17_DEPLOYMENT.md` §5.
* Free instances have ~512 MB RAM and a fraction of a CPU. Building the dataset
  inside a request, or loading thousands of rows on every boot, will time out.
  That is why the load is a release step and never a Start Command.

## 4. `DATASET_OUT_OF_SYNC` — the canonical resynchronisation

**Do not** fix this by setting `CANONICAL_DATA_MODE=preferred`/`file`, by hiding
the error in the UI, or by retrying harder. The guard is there so a stale
database cannot serve figures under a current release's label. Repair the data
path.

1. **Confirm the two identities.**
   ```bash
   curl -sS $API/health/readiness | jq '.canonical_state | {expected_version, dataset_version, expected_productivity_rows, loaded_productivity_rows}'
   curl -sS $API/meta/data-version | jq '{build_timestamp, row_counts}'
   ```
2. **Identify the deployed commit.** Render's Deploys page shows the commit for
   the live deploy. The image's manifest timestamp (`/meta/data-version` →
   `build_timestamp`) is the Docker build time; map it to the commit that was
   HEAD at that moment. **The release step must be pinned to that commit** — the
   dataset identity is content-addressed, so a build from a different commit (or
   from a warm working tree) produces a different version and the mismatch
   survives the load.
3. **Plan, read-only.** `python scripts/data/canonical_bootstrap.py --dry-run`
   reports the pending migration state, the expected version and the loaded
   version, and writes nothing — migrations included.
4. **Take a Neon branch/backup** (§6) and get the owner's approval for the write.
5. **Apply**, from the pinned commit:
   ```bash
   python scripts/data/canonical_bootstrap.py            # migrate → compare → load → verify
   ```
   or run the `Release database (canonical sync)` workflow
   (`.github/workflows/release-database.yml`), which does the same thing in CI
   with the production URL as a secret and requires typing `APPLY`.
6. **Verify:** `/health/readiness` must return `200` with
   `version_matches_manifest: true` and `blocking: []`, then re-run
   `python scripts/verify_production.py`.

## 5. Neon and connection health

* `availability: unavailable` with `database unreachable` is usually one of:
  the Neon project is suspended, the compute is cold-starting, `sslmode=require`
  is missing, the role lacks privileges, or the project is over its quota.
* The API opens a small pool per process. A Free/small Neon compute has a low
  `max_connections`; several Render instances (or a leaked pool) exhaust it and
  every read then fails as unreachable. Restarting the service clears a leaked
  pool; it does not fix a genuinely undersized compute.
* PostGIS: the first migration runs `CREATE EXTENSION IF NOT EXISTS postgis`. A
  Neon database can host it, but the extension must be creatable by the role in
  `DATABASE_URL`.

## 6. Backup and rollback

1. Before any write, create a Neon branch from the current data (Neon's
   branch-from-branch is instantaneous and copy-on-write) or record the point-in-time
   restore window. Record which one you used in the release notes.
2. Rollback of a *load*: the loader only upserts and never truncates, so a bad
   load is corrected by re-running the bootstrap from the correct commit. If the
   loaded dataset must be reverted rather than corrected, restore the Neon branch
   and restart the service.
3. Rollback of a *migration*: `alembic downgrade -1` is possible but must be
   planned before the deploy; the loader's tables hold only upserted data, so the
   usual answer is forward-fix.
4. Never `DROP`/`TRUNCATE` a canonical table to "reset" it: it destroys the
   ingestion lineage (`data_ingestion_run`, `dataset_version`) that the readiness
   contract reports on.

## 7. UI behaviour during an incident (what "correct" looks like)

* Panels must state that the figures are withheld and why, with a manual retry —
  never show `0`, never show an empty chart as if it were the published answer.
* Retries are bounded (one retry, then a capped backoff). A page of panels must
  not become a request storm against a degraded service.
* The developer hint (`make api`, `make data`) is only rendered outside
  production.

## 8. Evidence to collect before escalating

```bash
python scripts/verify_production.py --json docs/audits/artifacts/smoke-$(date +%F).json
curl -sS $API/health/readiness | jq .            # sanitised: no credentials, no paths
curl -sS $API/meta/data-version | jq '{pipeline_version, build_timestamp, row_counts}'
```

From Render: the deploy log of the live deployment (build step + any pre-deploy
step), and the commit SHA. From Neon: the project's activity/connection graph for
the incident window (no connection strings). Redact anything with a credential in
it before sharing.
