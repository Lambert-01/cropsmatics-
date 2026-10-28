# Production Release Verification

Reviewed: 2026-10-28.

## Current branch and deployment identity

This review is on `codex/final-excellence-2026`, based at commit `9c1d01f`. It is a
review branch and has not been merged to `main` or deployed by this task. The
Render and Vercel environments therefore must not be described as running the
changes in this branch until their deployment commit is checked.

## Local verification

| Area | Result | Limitation |
|---|---|---|
| API tests | PASS, with database-backed cases skipped | no isolated PostGIS database in this run |
| Data tests | PASS | scientific report added in this branch |
| ML tests | PASS | forecast eligibility still depends on registered artifacts |
| Web tests | PASS at component level | browser screenshots are separate evidence |
| Mobile tests | PASS at component level | no physical Android verification |
| Scientific gate | 11 PASS, 0 FAIL, 2 UNRESOLVED | 89 source findings and stale manifest commit |

The exact command for the data gate is:

```bash
.venv/bin/python scripts/data/scientific_validation.py \
  --json-out /tmp/cropmatics-scientific-validation.json \
  --markdown-out /tmp/cropmatics-scientific-validation.md
```

For a release build, run `make data` first so the processed manifest is rebuilt
from the release commit. Do not use production for migrations or integration
tests; set `CANONICAL_TEST_DATABASE_URL` to an isolated PostGIS database.

## Deployment checklist

- [ ] Push the reviewed branch and merge only after code review.
- [ ] Confirm Vercel is tracking the intended production branch and commit.
- [ ] Confirm Render is tracking the same release commit.
- [ ] Confirm `NEXT_PUBLIC_API_BASE_URL` points to the intended API.
- [ ] Confirm backend secrets exist only in Render/EAS/Vercel environment
  stores, never in Git.
- [ ] Run read-only production smoke checks for health, data version, coverage,
  dashboard, maps, assistant fallback and install redirect.
- [ ] Verify APK artifact commit and hosted Render API URL before sharing it.

## Release blockers

The current branch is not a production release until the deployment identity,
isolated database tests, physical Android workflow and language review are
completed or explicitly accepted by the team.
