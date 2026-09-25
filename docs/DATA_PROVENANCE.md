# Data Provenance

Every processed dataset must be traceable to its source. This document defines the
provenance schema and records the sources used by the MVP.

## Provenance schema

Each processed row carries:

| Field | Meaning |
|---|---|
| `source_id` | stable identifier of the source dataset (see table below) |
| `source_period` | period, e.g. `2025-B` |
| `processing_script` | script that produced the row |
| `processing_version` | pipeline version (see `scripts/data/common.py`) |
| `is_synthetic` | `false` for all real data; `true` only in dev fixtures |

Analytical/model records additionally carry `model_version` (e.g.
`rule-based-risk-0.1.0`).

The database mirrors this in the `data_source` table:

```text
source_id, owner, dataset_name, source_url, source_period, retrieved_at,
access_type, license_or_terms, raw_file, processing_script, notes
```

## Sources used by the MVP (2025 Season B focus)

| `source_id` | Dataset | Raw file |
|---|---|---|
| `NISR_SAS_2025B_DISTRICT_CROP` | district × crop productivity | `01_district_crop_productivity_2025B.csv` |
| `NISR_SAS_2025B_DISTRICT_FACTORS` | district input/practice adoption | `02_district_productivity_factors_2025B.csv` |
| `NISR_SAS_2025B_IRRIGATION_WATER` | irrigation technique / water source | `03_irrigation_water_2025B.csv` |
| `NISR_SAS_2025B_EROSION` | erosion-control technique / severity | `04_erosion_control_2025B.csv` |
| `NISR_SAS_2025B_POSTHARVEST_USE` | crop use/loss shares | `05_crop_postharvest_use_2025B.csv` |
| `NISR_SAS_2024_2026_NATIONAL_TRENDS` | national crop area/production/yield | `06_national_crop_trends_2024_2026.csv` |
| `NISR_SAS_2024_2026_NATIONAL_INPUT_TRENDS` | national input/practice trends | `07_national_input_practice_trends_2024_2026.csv` |
| `MINAGRI_ACES_COLDCHAIN_2026` | cold-chain district context | `08_verified_cold_chain_context_2026.csv` |
| `MOBILE_OPERATIONAL` | app-captured operational data | runtime only |

Raw files live under `data/raw/cropmatics_real_data_2024_2026/`; the original NISR
workbook is in `raw_official/`. Machine-readable source registry:
`data/source_registry/data_sources.csv` and
`data/raw/cropmatics_real_data_2024_2026/09_source_registry.csv`.

## Transformation record

| Processed output | Input(s) | Script |
|---|---|---|
| `district_crop_productivity.csv` | 01 | `build_district_crop_dataset.py` |
| `district_productivity_factors.csv` | 02 | `build_factor_dataset.py` |
| `irrigation_water.csv` | 03 | `build_irrigation.py` |
| `erosion_control.csv` | 04 | `build_erosion.py` |
| `crop_postharvest_use.csv` | 05 | `build_postharvest_dataset.py` |
| `national_crop_trends.csv` | 06 | `build_national_trends.py` |
| `national_input_trends.csv` | 07 | `build_input_trends.py` |
| `cold_chain_context.csv` | 08 | `build_cold_chain.py` |
| `training_district_crop.csv` | 01 + 02 | `build_training_dataset.py` |
| `dashboard_overview.csv` | 01 + 02 | `build_dashboard_summary.py` |
| `data_coverage.csv` | processed tables | `build_data_coverage.py` |
| `data_sources.csv` | 09 | `build_sources.py` |
| `dim_district.csv` | dictionaries | `normalize_geography.py` |
| `dim_crop.csv`, `crop_alias_map.csv` | dictionaries + 01/05 | `normalize_crops.py` |

All transforms are deterministic; rerunning `make data` reproduces identical
outputs.

## Licensing / redistribution

- Official NISR aggregate extracts and the original workbook are included with
  source attribution.
- Respondent-level NISR microdata is **not** redistributed; obtain it through the
  NISR catalogue/release process and comply with its terms.
- Cold-chain capacity is intentionally blank where public announcements do not
  publish facility-level figures.

See `DATA_LICENSE_AND_PROVENANCE.md` for the top-level licence note.
