# 7. API Specification

Base: `/api/v1`

## Authentication
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

## Reference
- `GET /geography/provinces`
- `GET /geography/districts`
- `GET /crops`

## Periods
- `GET /meta/periods` — the published period dimension (2024A–2026B as of the
  2026 releases), each with its coverage level and contributing datasets.
  Clients read this instead of hard-coding a period; an unpublished season
  (`2026C`) is never listed.

## Productivity (period-aware)
- `GET /productivity?period_code=&crop=&district=&province=&geography_level=`
  — one published period of the canonical district x crop panel. Defaults to the
  latest period with district observations and says so (`defaulted_to_latest`).
- `GET /productivity/trend?crop=&district=&season=` — one crop across every
  published period, for a district or the published national series.

## Analytics
- `GET /analytics/productivity`
- `GET /analytics/productivity-gap`
- `GET /analytics/factors`
- `GET /analytics/intervention-priorities`

Every endpoint that accepts the shared analytics filters also accepts
`period_code` (e.g. `GET /analytics/productivity?period_code=2026B`,
`GET /analytics/heatmap?period_code=2024A`). Behaviour rules:

- An unpublished or malformed period is rejected with **422** listing the
  available periods — never an empty page that looks like "no data".
- Without a period the existing defaults are unchanged (district analytics read
  the 2025 Season B table).
- Endpoints still backed by the single-release district extract (factors,
  irrigation, erosion) return a `note` explaining that the requested period has
  no such data, instead of an unexplained empty result.
- `period_code` is also accepted by `GET /meta/dataset/{key}` for datasets that
  carry a period dimension (`crop_productivity`); asking a dataset without one is
  refused with 400.

## Harvest
- `POST /harvests`
- `GET /harvests/{id}`
- `PATCH /harvests/{id}`
- `POST /harvests/{id}/actual`

## Risk
- `POST /harvests/{id}/risk`
- `GET /harvests/{id}/recommendations`

## Facilities
- `GET /facilities/nearby`
- `GET /facilities/{id}`
- `POST /facilities/{id}/capacity-snapshots`

## Optimization
- `POST /optimization/storage-allocation`

## Field work
- `POST /field/observations`
- `POST /field/verifications`
- `GET /field/tasks`

## Reports / AI
- `GET /reports/district-summary`
- `GET /reports/export`
- `POST /assistant/query`

The AI assistant must answer from validated database/model outputs, not hallucinated statistics.
