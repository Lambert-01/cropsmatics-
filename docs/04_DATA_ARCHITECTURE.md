# 4. Data Architecture

## Layers

```text
data/
├── raw/                 IMMUTABLE official sources
│   └── cropmatics_real_data_2024_2026/
│       ├── 01..09_*.csv            official-derived extracts
│       ├── Cropmatics_Core_*.xlsx   combined workbook
│       └── raw_official/*.xlsx     original NISR workbook
├── external/            third-party open data (rainfall, soil, OSM) — not yet populated
├── interim/             intermediate transforms (regenerable)
│   ├── legacy_official_derived/    superseded extracts (provenance only)
│   ├── dim_district.csv, dim_crop.csv, crop_alias_map.csv
│   └── validation_report.json
├── processed/           model-ready tables (regenerable)
│   ├── district_crop_productivity.csv
│   ├── district_productivity_factors.csv
│   ├── irrigation_water.csv, erosion_control.csv
│   ├── crop_postharvest_use.csv
│   ├── national_crop_trends.csv, national_input_trends.csv
│   ├── cold_chain_context.csv
│   ├── dashboard_overview.csv, data_coverage.csv, data_sources.csv
│   └── training_district_crop.csv          ← primary analytical table
├── dictionaries/        canonical geography + crop code lists
├── source_registry/     where data comes from + access terms
└── dev_fixtures/        SYNTHETIC / TEST ONLY
```

## Flow

```text
raw ──validate──▶ interim ──normalize──▶ interim dims ──build──▶ processed
```

Run with `make data` (or `python scripts/data/run_all.py`). Scripts are
deterministic and safe to re-run.

## Primary analytical dataset

`training_district_crop.csv` is built by joining:

```text
district_crop_productivity (01)  LEFT JOIN  district_factors (02)
        ON year + season + district
```

This is an **aggregate-to-aggregate** join. It yields, per district × crop row:
yield target, area/production measures, and predictor adoption rates
(seed, fertilizer, pesticide, irrigation, erosion, agroforestry, mechanization,
agricultural land) plus crop attributes.

## Integration rules

1. **Never merge independent surveys at respondent level** because they share
   district/gender/crop/age. Integrate only at compatible geography + time + crop
   aggregation, or via explicit statistical data-fusion methods.
2. **Preserve survey design/weights** when respondent-level NISR microdata is used.
3. **Keep operational app data separate** from official estimates.
4. **Never edit raw files.** Transform to `interim/` or `processed/`.

## Missingness & quality

- Missing values stay `null` — never imputed silently.
- Flags annotate data quality (`cultivated_area_reported`, `yield_reported`,
  `harvest_ratio`, `shares_sum_ok`).
- `validate_raw.py` fails on hard errors (missing files/columns, duplicate keys,
  unknown districts/crops, negative values, out-of-range percentages) and warns on
  soft issues (harvested area > cultivated area, yield inconsistency, blank area).

## Identifier stability

Districts and crops get stable codes from `data/dictionaries/`; crop aliases
(`Cooking banana` → `Banana`) are recorded explicitly in `crop_alias_map.csv`
rather than hidden in code.
