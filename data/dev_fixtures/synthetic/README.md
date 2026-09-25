# ⚠️ SYNTHETIC DEVELOPMENT DATA — TEST ONLY

**Nothing in this folder is real.** Every record is fabricated solely to exercise
UI/API/offline flows when official data is unavailable for a scenario.

Rules:
- Never cite these records as NISR, MINAGRI, or real farmer/facility observations.
- Never load them into `data/processed/` or any production analytical table.
- Never mix them with anything under `data/raw/`.
- Every file name and row must carry a `SYNTHETIC` marker.

| File | Purpose |
|---|---|
| `demo_harvest_registrations.csv` | fake harvest registrations incl. `district`, `crop`, `expected_quantity_kg`, `post_harvest_risk`, `demo_available_capacity_kg` |

Used only by mobile/API demo flows and their tests.
