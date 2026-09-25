# Feature / Data Coverage Matrix

What the real data can and cannot support. This file is the source of truth for
every "showing national statistics" / "no verified data" message in the UI.

## Geographic and temporal coverage

| Dataset | 2024A | 2024B | 2024C | 2025A | 2025B | 2025C | 2026A | 2026B |
|---|---|---|---|---|---|---|---|---|
| District crop productivity (01) | — | national | — | national | **district** | — | national | — |
| District factors (02) | — | — | — | — | **district** | — | — | — |
| Irrigation (03) | — | — | — | — | **district** | — | — | — |
| Erosion control (04) | — | — | — | — | **district** | — | — | — |
| Post-harvest use (05) | — | — | — | — | **national (crop level)** | — | — | — |
| National crop trends (06) | — | national | — | national | national | — | national | — |
| National input trends (07) | national | national | national | national | national | national | national | national |
| Cold-chain context (08) | — | — | — | — | — | — | district (6 program districts) | — |

- **district** = real district-level values exist.
- **national** = national value exists only. The UI shows national statistics and
  states that district estimates are not fabricated.
- **—** = no data; the UI shows an empty state.

> The `data_coverage.csv` table (and `GET /meta/data-coverage`) is generated from
> the processed data itself, so it cannot drift from the tables.

## Feature capability by dimension

| Feature | National | District | Crop | Periods available | Missing values |
|---|---|---|---|---|---|
| Average yield KPI | yes | yes | yes | 2025B | null when a district reports no crop |
| Productivity gap | yes | yes | yes | 2025B | gap null when benchmark undefined |
| District map choropleth | yes | yes | yes | 2025B | districts without a valid yield render grey |
| Priority ranking | yes | yes | yes | 2025B | — |
| Factor associations | yes | — | yes | 2025B | correlations skipped for n < 3 |
| Yield/production trend | yes | no | yes | 2024B/2025A/2025B/2026A | `yield_mt_ha` blank for aggregate rows |
| Input adoption trend | yes | no | no | 2024A–C, 2025A–C, 2026A–B | series start later; blanks stay null |
| Irrigation detail | yes | yes | no | 2025B | zero-heavy districts exist |
| Erosion detail | yes | yes | no | 2025B | — |
| Post-harvest use/loss | yes | no | yes | 2025B | shares may not sum to exactly 100 |
| Cold-chain context | yes | yes (6) | no | 2026 | **capacity null for all rows** |
| Storage optimization | scenario only | scenario only | user input | n/a | capacity unknown → excluded |
| Model performance | — | — | — | when `ml/reports` exists | shows "not yet trained" otherwise |

## Operational (voluntary app) data

| Signal | Source | Geographic level | Notes |
|---|---|---|---|
| Harvest registrations | mobile → API → Postgres | district (declared) | idempotent by client UUID |
| Post-harvest risk score | rule-based `risk_service` | crop + district context | **not** official statistics |
| Sync queue state | mobile SQLite | device | never merged into official tables |

Official statistics and voluntary app data remain separate layers and are never
merged at respondent level (see `docs/04_DATA_ARCHITECTURE.md`).

## Values that are deliberately absent

These are intentionally **not** shown anywhere in the product:

- storage capacity (any facility) — not published in the source;
- budgets, projected yield gains, farmer counts — no verified methodology;
- market prices — no licensed price feed registered;
- district estimates for 2024B/2025A/2026A — only national context exists.

Where a mockup suggested these, the UI substitutes *"Capacity not verified"*,
*"Model not yet trained for this selection"*, or a documented proxy label.
