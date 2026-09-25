# Legacy official-derived extracts (superseded)

These small CSVs predate the `data/raw/cropmatics_real_data_2024_2026/` pack and
overlap with it. They are kept only for provenance/history; the raw pack is the
authoritative source.

| File | Status |
|---|---|
| `nisr_sas_2025b_crop_production_yield.csv` | superseded by `raw/.../01_district_crop_productivity_2025B.csv` + `06_national_crop_trends_2024_2026.csv` |
| `nisr_sas_2026_season_a_summary.csv` | summary only; not used by the MVP pipeline |
| `nisr_sas_2026_season_b_summary.csv` | summary only; not used by the MVP pipeline |
| `minagri_aces_cold_chain_2026_context.csv` | superseded by `raw/.../08_verified_cold_chain_context_2026.csv` |

Do not build the model from this folder. It is excluded from `scripts/data/run_all.py`.
