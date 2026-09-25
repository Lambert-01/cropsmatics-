# Cropmatics Real Data Pack (2024-2026)

This package contains **real NISR/MINAGRI-derived data only** for the analytical layers.
The original official NISR 2025 Season B workbook you uploaded is included unchanged under `raw_official/`.

## Recommended files for the project

1. `01_district_crop_productivity_2025B.csv`
   - district x crop observations
   - cultivated area
   - harvested area
   - production
   - yield
   - Use for productivity-gap maps and yield/production modeling.

2. `02_district_productivity_factors_2025B.csv`
   - improved seeds
   - organic/inorganic fertilizer
   - pesticides
   - irrigation
   - erosion protection
   - agroforestry
   - mechanization
   - agricultural land
   - Use for associated-factor analysis and intervention prioritization.

3. `03_irrigation_water_2025B.csv`
   - irrigation technique and water source by district.
   - Use for irrigation recommendation logic.

4. `04_erosion_control_2025B.csv`
   - erosion-control techniques + erosion severity.
   - Use for soil/erosion intervention logic.

5. `05_crop_postharvest_use_2025B.csv`
   - crop shares sold, consumed, stored, and lost post-harvest.
   - Use for post-harvest risk and storage-priority logic.

6. `06_national_crop_trends_2024_2026.csv`
   - official national crop area/production/yield series:
     2024B, 2025A, 2025B, 2026A.
   - Use for seasonal trend context and model benchmarking.

7. `07_national_input_practice_trends_2024_2026.csv`
   - official 2024A/B/C, 2025A/B/C, 2026A/B adoption indicators.
   - Use for national trend charts and context.

8. `08_verified_cold_chain_context_2026.csv`
   - verified districts from the 2026 MINAGRI-ACES cold-chain initiative.
   - Does NOT invent storage capacity.

9. `09_source_registry.csv`
   - official source pages and raw workbook locations.

## Model join

For the MVP:

```text
01_district_crop_productivity_2025B
        LEFT JOIN
02_district_productivity_factors_2025B
        ON year + season + district
```

This gives a crop-district modeling table where:

```text
Target:
  yield_kg_ha
  OR production_mt

Predictors / intervention features:
  improved_seed_farmers_pct
  organic_fertilizer_farmers_pct
  inorganic_fertilizer_farmers_pct
  pesticide_farmers_pct
  irrigation_farmers_pct
  erosion_protection_farmers_pct
  agroforestry_farmers_pct
  mechanization_farmers_pct
  agricultural_land_000ha
```

Add rainfall later only after obtaining a verified open climate dataset.

## Scientific caution

These aggregate district factors are **associations**, not proof of causality.
Do not say that changing one factor will automatically cause a specific yield increase.

## Raw official files still worth downloading

The official source pages listed in `09_source_registry.csv` provide:
- SAS 2024 Annual Tables.xlsx
- SAS 2025 Annual Tables.xlsx
- Tables_2026 Season A.xlsx
- Tables_2026 Season B.xlsx

This environment could verify those releases on the NISR website, but could not mirror the remote XLSX binaries directly into the sandbox. The source registry therefore preserves the official download locations/pages.
