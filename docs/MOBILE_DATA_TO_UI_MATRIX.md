# Mobile Data-to-UI Matrix

Every analytical value on every screen is traceable to a processed official
table. `null` always renders as **Not available**, never as `0`.

| Screen | Endpoint | Dataset | Coverage | Source | Limitations |
|---|---|---|---|---|---|
| Home | `GET /mobile/home` | processed tables aggregate | district (2025B) | `NISR_SAS_2025B_DISTRICT_CROP` | counts derived; no headline constants |
| Home insights | (within `/mobile/home`) | district crop / factors / post-harvest | district + national | `NISR_SAS_2025B_*` | associations, not causes |
| Explore search | `/crops`, `/geography/districts`, `/mobile/indicators` | dictionaries + registry | reference | registry | — |
| Crop list | `GET /crops` | crop dictionary | reference | NISR/MINAGRI dictionary | — |
| Crop detail — Overview | `GET /analytics/productivity?crop=` | `district_crop_productivity` | district 2025B | `NISR_SAS_2025B_DISTRICT_CROP` | district aggregates |
| Crop detail — Trends | `GET /analytics/trends?crop=` | `national_crop_trends` | national | `NISR_SAS_2024_2026_NATIONAL_TRENDS` | national series |
| Crop detail — Districts | `GET /analytics/productivity?crop=` | `district_crop_productivity` | district 2025B | `NISR_SAS_2025B_DISTRICT_CROP` | per-crop scale only |
| Crop detail — Post-harvest | `GET /analytics/post-harvest?crop=` | `crop_postharvest_use` | national crop-level | `NISR_SAS_2025B_POSTHARVEST_USE` | no district dimension |
| District list | `GET /geography/districts` | district dictionary | reference | dictionary | — |
| District detail | `GET /mobile/districts/{slug}` | productivity + factors + irrigation + erosion | district 2025B | `NISR_SAS_2025B_*` | **no cross-crop mean yield** |
| Indicators | `GET /mobile/indicators` | indicator registry + coverage | per indicator | indicator-specific | only available indicators shown |
| Compare crops | `GET /analytics/trends?compare=` | `national_crop_trends` | national | `NISR_SAS_2024_2026_NATIONAL_TRENDS` | absolute metrics only; no cross-crop yield |
| Compare districts | `GET /mobile/districts/{slug}` | district tables | district 2025B | `NISR_SAS_2025B_*` | same indicator on each district |
| Maps | `GET /maps/district-metrics` | `training_district_crop` | district 2025B | `NISR_SAS_2025B_DISTRICT_CROP` | districts without data stay grey |
| Post-harvest | `GET /analytics/post-harvest` | `crop_postharvest_use` | national crop-level | `NISR_SAS_2025B_POSTHARVEST_USE` | crop filter only |
| Post-harvest infra | `GET /analytics/storage-infrastructure` | `national_postharvest_infrastructure` + cold chain | national / program | `MINAGRI_ANNUAL_REPORT_2024_2025_POSTHARVEST_INFRA` | national totals; no facility capacity |
| Ask | `POST /assistant/query` | retrieved verified values | varies by intent | answered source returned | refusal when not groundable |
| Data sources | `GET /meta/sources` | source registry | reference | curated registry | only verified sources listed |

## Aggregation policy

Declared per indicator in `app/services/mobile_service.py`:
`mean` (shares of farmers), `crop_required` (yield, production, post-harvest
shares), `count`, `specialized` (national infrastructure). A statistic is never
computed merely because Pandas supports `mean()`.

## Absolute rules enforced

* No number is invented. A missing value is `null` → "Not available".
* Yields are never averaged across unrelated crops.
* A district is never coloured on the map unless district-level data exist.
* Public users cannot list other people's inquiries or contact details.
