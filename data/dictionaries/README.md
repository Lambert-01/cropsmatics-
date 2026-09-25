# Dictionaries

Code lists that let the pipeline and API refer to geography and crops in a
stable, canonical way instead of relying on free-text names.

| File | Purpose |
|---|---|
| `districts.csv` | 30 districts, province, coarse agro-ecological zone, stable `district_code` |
| `crops.csv` | canonical crop names, category, Kinyarwanda label, perishability, cold-chain flag |
| `sas_2024_core_variable_map.csv` | NISR SAS 2024 microdata variable map (survey documentation) |

## Caveats

- `districts.csv` uses a **coarse** agro-ecological grouping for peer comparison.
  Rwanda's official 12-AEZ classification is finer; refine before relying on it
  for agro-ecological benchmarking.
- Kinyarwanda labels in `crops.csv` are working translations and should be
  reviewed by a native speaker / MINAGRI extension officer before public use.
- `crops.csv` covers the 17 crop categories published in the SAS 2025 Season B
  district tables plus post-harvest sub-categories where relevant.

`normalize_geography.py` / `normalize_crops.py` in `scripts/data/` validate that
every raw district/crop string resolves to a dictionary entry.
