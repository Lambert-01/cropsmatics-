# Feature / Data Coverage Matrix

What the real data can and cannot support. This file is the source of truth for
every "showing national statistics" / "no verified data" message in the UI.

The machine-readable version of the same facts is `data_coverage.csv`, served as
`GET /meta/data-coverage` and generated from the processed tables themselves. If
this page and that response disagree, the response is right and this page is a
bug: it is written by hand only for the prose the API does not carry.

## Geographic and temporal coverage

| Dataset | 2024A | 2024B | 2024C | 2025A | 2025B | 2025C | 2026A | 2026B |
|---|---|---|---|---|---|---|---|---|
| Crop productivity panel (`crop_productivity`) | **district** | **district** | **district** | **district** | **district** | **district** | **district** | **district** |
| Legacy district extract (`district_crop_productivity`) | — | national | — | national | **district** | — | national | — |
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

### What the productivity panel actually carries

The canonical panel (`crop_productivity`) is the multi-period source. District
rows exist for **every listed period**, at these counts:

| Period | Districts | Crops | Season letter |
|---|---|---|---|
| 2024A | 30 | 17 | A |
| 2024B | 30 | 17 | B |
| 2024C | 30 | 6 | C |
| 2025A | 30 | 17 | A |
| 2025B | 30 | 17 | B |
| 2025C | 30 | 6 | C |
| 2026A | 30 | 17 | A |
| 2026B | 30 | 17 | B |

Season C releases tabulate a smaller crop set (6), which is a property of the
release, not a gap in the pipeline. A period is listed here only because the
table has rows for it; the API derives the period axis from the data rather than
from a fixed list, so an unpublished season such as 2026C does not exist as a
value a client can ask for.

This is the correction that matters most in this file: an earlier version said
district productivity existed only for 2025B and that other years were
national-only. That was true of the legacy single-release extract and is false of
the panel, and the UI followed the stale text instead of the data.

## Which release a query reads

A request that names no period is **not** "whatever the default table happens to
be". Both facts below are reported in the response, so no screen has to guess:

- Period-aware district analytics read the **latest published district release**
  (`period_service.latest_district()`), which is 2026B. The response names it:
  `scope: "history"` plus `snapshot.period_code` on the dashboard overview, and
  `period_code` / `provenance.source_period` elsewhere.
- Single-release layers read **the release that carries them** (2025B for district
  factors, irrigation and erosion), and say so via `available_period`. They are
  never colour-filled from another period's rows, and never rendered as an empty
  layer under a period label they do not belong to.

Selecting an explicit release always wins over both rules.

## Feature capability by dimension

| Feature | National | District | Crop | Periods available | Missing values |
|---|---|---|---|---|---|
| Average yield KPI | yes | yes | yes | 2024A–2026B | null when a district reports no crop |
| Productivity gap | yes | yes | yes | 2024A–2026B | gap null when benchmark undefined |
| District map choropleth | yes | yes | yes | 2024A–2026B | districts without a valid yield render grey |
| Priority ranking | yes | yes | yes | 2024A–2026B | readiness/cost components are 2025B only; their weight is redistributed, never borrowed |
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
- a validated future-yield forecast — the published window is eight seasonal
  releases, which supports trends and scenarios but not a district-level forecast
  presented as decision support (see the Yield Intelligence methodology note).

Where a mockup suggested these, the UI substitutes *"Capacity not verified"*,
*"Model not yet trained for this selection"*, or a documented proxy label.

## Matching this page to the code

- `services/api/app/services/period_service.py` — the period axis, derived from
  the processed tables.
- `services/api/app/services/analytics_service.py` — `resolved_period()` and
  `productivity_frame()`, which implement the default-release rules above.
- `services/api/app/services/map_service.py` — `effective_period_filters()`, which
  pins each map layer to the release that carries it.
- `apps/web/lib/coverage.ts` — the notices and the period/timeline display rules.
