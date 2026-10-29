# Optional NISR/AHS Plot Microdata

Place only an approved NISR Seasonal Agricultural Survey or Agriculture
Household Survey microdata export in this directory when the licence and access
terms allow local processing.

Supported formats:

- CSV or TSV
- XLSX or XLS
- Stata DTA
- SPSS SAV (requires the optional pandas/pyreadstat support in the environment)

The data build reads this directory with
`scripts/data/extract_plot_observations.py` and writes
`data/processed/field_crop_observations.csv`.

Run the optional extractor directly when checking an export:

```bash
python scripts/data/extract_plot_observations.py \
  --input-dir data/raw/nisr/sas_microdata \
  --output data/processed/field_crop_observations.csv \
  --require-data
```

`--require-data` returns exit code `2` when the directory has no supported
file or no usable plot records. The normal `run_all.py` pipeline does not fail
for an empty directory because plot microdata is optional and restricted.

The extractor preserves plot area and production, derives yield only when both
values are present, and copies latitude/longitude or geometry only when those
fields exist in the source. It never creates a field point from a district
centroid.

The local development checkout may contain the NISR Agriculture Household
Survey 2024 crop-production export under `2024/ahs/`. Its `s2q2` field is plot
area in square metres; `s3_q4_1` through `s3_q4_7` are crop slots; and the
matching `s3_q20_1` through `s3_q20_7` fields are harvest in kilograms. The
explicit `Season` field supplies 2024A, 2024B and 2024C. This produces plot-crop
sample evidence, not a nationally weighted estimate, and the public API still
returns only district/crop aggregates.

Microdata is treated as restricted respondent-level evidence. Do not commit
identifiable records, exact field coordinates or files whose terms do not allow
redistribution. The public API aggregates records by period, district and crop;
it does not expose plot IDs or farmer/household IDs.
