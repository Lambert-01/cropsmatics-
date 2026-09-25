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

## Analytics
- `GET /analytics/productivity`
- `GET /analytics/productivity-gap`
- `GET /analytics/factors`
- `GET /analytics/intervention-priorities`

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
