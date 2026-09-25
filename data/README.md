# Data Layer

Layout and rules for all data used by Cropmatics Rwanda.

```
data/
├── raw/                 # IMMUTABLE official sources (never edited in place)
│   └── cropmatics_real_data_2024_2026/
├── external/            # third-party open data (rainfall, soil, OSM, ...) — not yet populated
├── interim/             # intermediate transforms; regenerable
│   └── legacy_official_derived/
├── processed/           # model-ready analytical tables produced by scripts/data
├── dictionaries/        # code lists: geography, crops, SAS variable map
├── source_registry/     # where every dataset comes from + access terms
└── dev_fixtures/        # SYNTHETIC / TEST ONLY — never official statistics
```

## Hard rules

1. **`raw/` is immutable.** Never edit a raw file. If a fix is needed, add a
   transform in `scripts/data/` and write the result to `interim/` or `processed/`.
2. **Never mix official and synthetic data.** Synthetic fixtures live only under
   `dev_fixtures/synthetic/` and must be labelled `SYNTHETIC`.
3. **Every processed table is traceable.** Rows carry source metadata
   (`source_id`, `source_period`, `processing_script`, `processing_version`).
   See [../docs/DATA_PROVENANCE.md](../docs/DATA_PROVENANCE.md).
4. **Do not invent values.** Use blanks / `null` / "not verified" instead of
   guessed numbers (e.g. cold-chain capacity is intentionally empty).
5. **Derived data is generated, not hand-edited.** Rebuild with
   `make data` (equivalently `python scripts/data/run_all.py`).

## Key raw datasets

| File | Granularity | Description |
|---|---|---|
| `01_district_crop_productivity_2025B.csv` | district × crop × season | area, harvest, production, yield |
| `02_district_productivity_factors_2025B.csv` | district × season | input/practice adoption (%) |
| `03_irrigation_water_2025B.csv` | district × season | irrigation technique + water source |
| `04_erosion_control_2025B.csv` | district × season | erosion-control technique + severity |
| `05_crop_postharvest_use_2025B.csv` | crop × season | sold/consumed/stored/loss shares |
| `06_national_crop_trends_2024_2026.csv` | national × crop × season | area/production/yield series |
| `07_national_input_practice_trends_2024_2026.csv` | national × season | input/practice trends |
| `08_verified_cold_chain_context_2026.csv` | district | cold-chain context (capacity blank) |
| `09_source_registry.csv` | — | official source pages / raw workbook locations |

`raw/cropmatics_real_data_2024_2026/raw_official/` holds the original NISR
workbook(s) exactly as received.
