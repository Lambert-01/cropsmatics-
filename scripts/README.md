# Scripts

Reproducible, deterministic build tooling. Run from the repository root.

```
scripts/
├── data/          # ETL: validate -> normalize -> build -> load
├── db/            # database init/seed helpers
├── dev/           # local dev conveniences
└── deployment/    # deploy helpers (mostly docs for now)
```

## Data pipeline (`scripts/data`)

| Script | Purpose |
|---|---|
| `common.py` | paths, provenance constants, helpers |
| `validate_raw.py` | validate raw files → `data/interim/validation_report.json` |
| `normalize_geography.py` | canonical district dimension → `dim_district.csv` |
| `normalize_crops.py` | canonical crop dimension + alias map |
| `build_district_crop_dataset.py` | cleaned productivity table |
| `build_factor_dataset.py` | cleaned input/practice table |
| `build_postharvest_dataset.py` | cleaned post-harvest use/loss table |
| `build_training_dataset.py` | **primary** analytical join (productivity × factors) |
| `load_database.py` | load processed tables into PostgreSQL |
| `run_all.py` | run the whole chain in order |

Run everything:

```bash
make data          # or: python scripts/data/run_all.py
```

Rules enforced by the pipeline:

- `data/raw` is read-only; outputs go to `data/interim` and `data/processed`.
- Missing values stay null — never imputed.
- Every processed row carries provenance (`source_id`, `source_period`,
  `processing_script`, `processing_version`, `is_synthetic`).
- Synthetic fixtures (`data/dev_fixtures/`) are **never** read here.
