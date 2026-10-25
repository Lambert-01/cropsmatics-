# 17. Deployment

Targets:

| Layer | Platform |
| --- | --- |
| Web | Vercel |
| API | Render (Docker build from `services/api/Dockerfile`) |
| Database | Neon or Supabase — **PostgreSQL + PostGIS** |
| Mobile | Expo EAS (`preview`, `release-apk`, `production` profiles) |
| Monitoring | Structured logs; Sentry if configured |

Environments: `local`, `staging`, `production`. Use HTTPS, backups, least
privilege, migrations, health checks and rate limits everywhere.

Read this with [`P0_DATABASE_AUTHORITY.md`](P0_DATABASE_AUTHORITY.md), which
defines what "the database is the authority" means and how `CANONICAL_DATA_MODE`
decides which layer answers a read.

## 1. What the repository proves, and what it cannot

Deployment configuration is split between two things, and they must not be
confused:

* **Code-verified** — anything a checkout of this branch can demonstrate by
  reading or running it (the bootstrap script, the migration chain, the loader,
  the readiness contract, the Docker image).
* **Dashboard-verified** — anything that lives only in the hosting provider's
  dashboard (Render Pre-Deploy Command, Neon project settings, Vercel env vars).
  **A repository can never attest to these.** They are listed as a checklist in
  §5 and must be confirmed by hand.

A `render.yaml` blueprint is now committed. It declares the release flow
(`preDeployCommand: python /app/scripts/data/canonical_bootstrap.py`), a
uvicorn-only Start Command, and `healthCheckPath: /api/v1/health/readiness`.

**A blueprint does not update a service that already exists.** Render applies a
blueprint only when a service is created from it or explicitly synced to it, so
adding `render.yaml` does not change a hand-configured service. It is a validated
template and a review artefact, not proof of the live configuration. Nothing in
the repository can prove that the deployed service runs the bootstrap before
starting the API, so §5 remains work to confirm by hand.

## 2. API build and start

```bash
# Build context is the REPOSITORY ROOT, not services/api.
docker build -f services/api/Dockerfile -t cropmatics-api .
```

The image runs `python scripts/data/run_all.py` at build time (so `data/processed/`
exists in the container) and starts:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000   # WORKDIR /app/services/api
```

Render sets `PORT`; when configuring the service by hand, bind to it.

## 3. The canonical bootstrap step (required)

Migrations and the canonical load are a **release step**, not a request-time
concern. The production API must not start serving against an unmigrated or
unloaded database.

```bash
python scripts/data/canonical_bootstrap.py
```

Flow (see `scripts/data/canonical_bootstrap.py`):

```
alembic upgrade head
      |
      v
expected content version  vs  version currently in the database
      |
      +-- same  -> verify and stop (no rewrite)
      +-- differs -> canonical upsert -> verify
```

It is idempotent, non-destructive (never drops or truncates), and exits non-zero
when the database cannot be reached, migrated, loaded or verified. The dataset
version is content-addressed over the processed manifest — the pipeline version,
the SHA-256 of every canonical processed output, the SHA-256 of every raw/SAS
input and the row counts — so "same version" means the same data. The build
timestamp and git SHA are deliberately excluded: they change on every rebuild of
identical data, and including them made the bootstrap re-load thousands of
unchanged rows on every deploy.

Verification is more than "the table is not empty": a stale database that still
holds an older release is non-empty too. The bootstrap compares the loaded period
set and productivity row count against the processed build, and fails when a
required historical period (2022A–2023C) is absent. A pass prints the row count
and the period range it verified.

`--dry-run` reports the plan without writing; `--force-load` reloads even when
the version matches; `--skip-migrations` is for a platform that migrates
separately.

### Render Pre-Deploy Command

For a Render service built from this repository's Dockerfile, use the absolute
path, because the image's `WORKDIR` is `/app/services/api`, not the repository
root:

```
python /app/scripts/data/canonical_bootstrap.py
```

If the service instead runs the repository directly (native Python environment,
root as the working directory), the relative form is correct:

```
python scripts/data/canonical_bootstrap.py
```

Either form works because the script resolves its own repository root from
`__file__` rather than from the working directory. The Pre-Deploy Command must
stay separate from the service's Start Command; a bootstrap failure must abort
the deploy rather than let `uvicorn` come up anyway.

### Plan limitation: the Free plan cannot run a Pre-Deploy Command

Render documents that the pre-deploy command **"is available for paid web
services, private services, and background workers"**
(<https://render.com/docs/deploys>). A Free web service therefore cannot run the
release step at all — which is why `render.yaml`'s `preDeployCommand` is a
release *intent* that has to be matched by a plan that supports it.

Consequences to keep straight:

* On the Free plan the bootstrap must run **out of band**: from a checkout of the
  exact commit the deployed image was built from (or from the image itself),
  with the production `DATABASE_URL` in the environment. `.github/workflows/release-database.yml`
  implements that as a manual, approval-gated workflow whose default is a dry run.
* The load must **never** move into the Start Command or a request handler:
  several instances would run it concurrently on every boot, and a request that
  triggers a migration makes availability depend on traffic.
* Since the content version is content-addressed, the release step must build the
  dataset from the **same commit** as the image. A build from a warm working tree
  can produce a different dataset than a pristine one — `scripts/data/check_idempotent_build.py`
  proves the build is now idempotent, and CI runs it.
* Deploy order matters: deploy first (the image carries the expectation), then
  run the release step for that commit, then confirm readiness is 200. When the
  database already matches, the step prints "database already serves the expected
  dataset" and writes nothing.

`--dry-run` is safe to run against production at any time: as of this revision it
applies no migrations and writes no rows, and reports the pending migration state,
the expected version and the loaded version.

## 4. API environment variables (production)

| Variable | Value | Why |
| --- | --- | --- |
| `ENVIRONMENT` | `production` | Makes `canonical_mode` resolve to `required` without setting it explicitly. |
| `DATABASE_URL` | `<Neon PostgreSQL connection string>` | The canonical database. Add `?sslmode=require` for Neon. |
| `CANONICAL_DATA_MODE` | `required` | Belt and braces with `ENVIRONMENT`: a production read must never be answered from a stale CSV. |
| `CORS_ORIGINS` | the deployed web origin(s), comma-separated | Browser access only. |
| `JWT_SECRET` | long random value | Never the `change-me` default. |
| `AI_*` | optional | See §6. |

Rules:

* **`DATABASE_URL` is server-side only.** It must never appear in `NEXT_PUBLIC_*`
  or `EXPO_PUBLIC_*`; those are inlined into public web and APK bundles. Web and
  mobile talk to this API, never to PostgreSQL directly.
* Never commit a real connection string. `.env` is git-ignored; only
  `.env.example` (placeholder values) is tracked.
* The Neon role must be allowed to create the PostGIS extension, which the first
  migration runs (`CREATE EXTENSION IF NOT EXISTS postgis`). A Neon database is
  PostGIS-enabled but the extension still has to be created in this database.

## 5. Manual verification checklist (dashboard-side)

Confirm each of these by hand; none is provable from the repository.

- [ ] Render service builds from `services/api/Dockerfile` with the repo root as
      context.
- [ ] The instance type supports a Pre-Deploy Command (Free does not), or the
      out-of-band release workflow is used instead.
- [ ] Start Command is the existing `uvicorn` command, unchanged.
- [ ] `ENVIRONMENT=production` is set.
- [ ] `DATABASE_URL` is set in the Render dashboard (marked secret) and is absent
      from every `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variable.
- [ ] `CANONICAL_DATA_MODE=required` is set.
- [ ] `CORS_ORIGINS` lists the deployed web origins, and nothing else.
- [ ] `JWT_SECRET` is a fresh random value, not the template default.
- [ ] The most recent deploy's pre-deploy log contains the bootstrap's
      `verified: crop_productivity holds N rows across M periods (...)` line,
      with `N` = 6,156 and `M` = 14 for the 2022A–2026B build.
- [ ] `healthCheckPath` is `/api/v1/health/readiness`.
- [ ] The blueprint/ service tracks `branch: main` (a blueprint without it can
      follow the repository default branch, which need not be where releases land).
- [ ] Automatic deployment is on (`autoDeploy: true` in `render.yaml`). It is safe
      because the pre-deploy bootstrap aborts the deploy on an out-of-sync
      database, and readiness returns 503 in that state.

Then confirm the running service:

```bash
API=https://<your-api-host>/api/v1

curl -s $API/health | jq            # liveness
curl -s $API/health/readiness | jq  # must report status "ready"
curl -s $API/meta/periods | jq
curl -s $API/data/version | jq
curl -s $API/data/coverage | jq
```

`/health/readiness` must report, in `canonical_state`:

| Field | Expected |
| --- | --- |
| `mode` | `required` |
| `database_configured` | `true` |
| `availability` | `ready` |
| `migrations_applied` | `true` |
| `tables_present` | `true` |
| `dataset_loaded` | `true` |
| `version_matches_manifest` | `true` |
| `expected_version` | equals `dataset_version` (the processed build's version) |
| `expected_productivity_rows` | equals `loaded_productivity_rows` (6,156 for the 2022A–2026B build) |
| `blocking` | `[]` |

`/health/readiness` returns HTTP **503** whenever `status` is `not_ready` (and
200 for `ready`/`degraded`). Render and the Docker `HEALTHCHECK` act on the
status code, so a body that says `not_ready` inside a 200 was silently accepted
as healthy - which is how a stale canonical database stayed in front of traffic.
Confirm the code, not just the body:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' $API/health/readiness   # 200 when ready
```

In `required` mode the overall `status` is `not_ready` — never `ready` — while any
of those fail, and the failing step is named in `blocking`. When the loaded
dataset differs from the processed build the blocking list contains
`canonical_dataset_out_of_sync`, and the `canonical_dataset_version` check
carries the expected and loaded versions plus the expected and loaded row counts
so a deploy can be diagnosed without guesswork. Readiness exposes no credentials
and no filesystem paths.

Representative analytical reads, all of which must be served by the database:

```bash
curl -s "$API/productivity?period_code=2026B&crop=Maize" | jq '.rows | length'
curl -s "$API/productivity/trend?crop=Maize&district=Bugesera" | jq
curl -s "$API/assistant/query" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the maize yield gap in Bugesera?"}' | jq
```

If `CANONICAL_DATA_MODE=required` and a read cannot be served, the API returns
`503 DATABASE_UNAVAILABLE`. That is a **correct** response — it means the request
was not quietly answered from a stale artefact.

## 6. Database checks (safe, read-only)

```sql
SELECT count(*) FROM crop_productivity;
SELECT count(*) FROM agricultural_observation;
SELECT period_id, count(*) FROM crop_productivity GROUP BY 1 ORDER BY 1;
SELECT source_id, granularity, count(*) FROM source_table GROUP BY 1, 2;
SELECT version FROM dataset_version ORDER BY created_at DESC LIMIT 1;
-- Must be 0: synthetic fixtures are never part of production observations.
SELECT count(*) FROM crop_productivity WHERE is_synthetic;
SELECT count(*) FROM agricultural_observation WHERE is_synthetic;
```

These report counts and versions only; no operational data needs to be printed.

## 7. Optional AI provider

`AI_ENABLED=false` is a supported production state. Cropmatics answers every
supported question with the deterministic grounded assistant, and the numeric and
citation guards apply in both modes. Enabling a provider (`AI_PROVIDER`,
`AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`) only upgrades the wording of an answer
that the evidence already supports.

Provider credentials are backend-only. They must not be exposed through
`NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`.

## 8. Mobile

Build profiles live in `apps/mobile/eas.json`. `preview`, `release-apk` and
`production` all set `EXPO_PUBLIC_API_BASE_URL` to the public API, so an installed
APK never points at loopback; only the `development` profile uses a local URL. A
release build that is explicitly configured with a loopback host logs the
misconfiguration loudly at startup (`app/services/api/client.ts`).

Field Operations is hidden unless `EXPO_PUBLIC_ENABLE_FIELD_OPERATIONS=true`.

### Shareable APK install link

After an EAS `release-apk` build completes, copy its HTTPS artifact URL into
the Vercel Production environment variable:

```text
NEXT_PUBLIC_INSTALL_APK_URL=https://expo.dev/artifacts/eas/<artifact>.apk
```

The web install page then exposes the stable same-origin download URL:

```text
https://cropsmatics-web.vercel.app/install/apk
```

`/install/apk` validates the configured URL and redirects with an APK filename
for download. A browser cannot silently install an Android package; the user
must open the downloaded file and approve Android's installation prompt. If the
variable is missing or malformed, the route returns a clear `503` instead of a
broken or misleading download button.
