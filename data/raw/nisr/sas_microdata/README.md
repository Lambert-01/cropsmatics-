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

The extractor preserves plot area and production, derives yield only when both
values are present, and copies latitude/longitude or geometry only when those
fields exist in the source. It never creates a field point from a district
centroid.

Microdata is treated as restricted respondent-level evidence. Do not commit
identifiable records, exact field coordinates or files whose terms do not allow
redistribution. The public API aggregates records by period, district and crop;
it does not expose plot IDs or farmer/household IDs.
