# NISR 2026 Submission Alignment

Reviewed 2026-10-28 from the NISR 2026 Big Data Hackathon Preparatory Webinar
supplied for this project. The webinar requires a public GitHub link, a deployed application
link and documentation. The repository should include a README, runnable code,
the data or an honest data link, and a screen recording of no more than three
minutes.

## Current evidence

| Webinar requirement | Repository state | Evidence or remaining action |
|---|---|---|
| Public GitHub repository | Verified | Public `main` contains the tested functional release `4eb1847` plus the documentation-only follow-up; all five functional GitHub Actions jobs completed successfully. |
| Public deployed application | Verified by release smoke gate | Render readiness reports the canonical database connected and dataset version `0.2.0-5b51d2c390e4d101`; `scripts/verify_production.py` passed 13/13 required endpoint checks. Vercel serves the deployed dashboard. |
| README explaining data, message and interaction | Present | README describes the NISR data, Python/API architecture, user workflows and hosted mobile build. |
| Runnable scripts | Present | `scripts/data/run_all.py`, API/web/mobile commands and APK helpers are documented. |
| Data file or source link | Present with provenance constraints | Official worksheet extracts, processed outputs and source registry are documented; do not publish restricted workbooks without permission. |
| Demonstration recording (maximum three minutes) | Not yet added | Record a browser screen capture, add the approved `.webm` or `.gif`, and link it from README. Do not claim this is complete until the file is committed and opens. |

## Judging-criteria fit

### Problem understanding and relevance

Cropmatics addresses agricultural productivity, post-harvest use, storage
context and intervention planning for Rwanda. The primary story is: find a
district and crop productivity shortfall, understand associated factors, then
choose a transparent investigation priority. This is relevant to farmers,
planners and policy users without claiming that association proves causality.

### Data use and methodology

The analytical path is official NISR worksheet extracts to deterministic Python
ETL, processed tables, Python services and FastAPI responses. The UI does not
recalculate official figures. Period coverage, source precedence, missing values,
proxies, model gates and unavailable forecasts are documented. The main remaining
evidence is exact per-cell lineage and an isolated PostgreSQL/PostGIS migration
rehearsal.

### Tangible impact

The dashboard supports district/crop investigation, priority ranking, reported
post-harvest use review, cold-chain programme context and a mobile harvest
registration workflow. Voluntary mobile records remain separate from official
statistics. Capacity, farmer counts, budgets, market prices and expected gains
are not invented when the data do not support them.

### Technical innovation

The system combines period-aware agricultural analytics, real Rwanda district
maps, auditable weighted intervention scenarios, grounded assistant answers,
validated-forecast withholding, a Python-backed manual planning projection and
offline Expo field operations. The manual planning workspace is explicitly a
scenario tool, not a disguised forecast.

### Usability and design

The web dashboard and mobile app have responsive states, filters, source labels,
loading/error/empty handling and English/Kinyarwanda strings. Local automated
checks pass. The final submission still needs approved screenshots, keyboard and
accessibility checks, native-speaker Kinyarwanda review and a physical Android
run covering map taps, Compare, Ask, harvest registration and offline sync.

## Three-minute demo order

1. Open the deployed dashboard and identify the selected period and coverage.
2. Select one crop and district; show the map, gap and priority rationale.
3. Open Yield Intelligence and show the difference between a withheld validated
   forecast and a user-controlled planning projection.
4. Change the planning method, calculate a scenario and point to its source,
   unit and planning-target label.
5. Open Transparency or Data Explorer to show source/coverage limitations.
6. Show the mobile app's map, Ask flow and offline harvest registration.

End with the repository URL, deployed URL and the statement that unavailable
forecasts, prices and storage capacities remain unavailable rather than being
fabricated.
