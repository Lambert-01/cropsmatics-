# Hosted field evidence artifact

`field_crop_observations.csv` is a privacy-safe aggregate derived from a
locally authorised NISR/AHS 2024 crop-production export. It contains one row
per period, district and canonical crop with plot-crop record count, plot
count, area and production. It contains no household IDs, plot IDs, GPS
coordinates or field geometry.

The raw microdata remains in the ignored local
`data/raw/nisr/sas_microdata/` directory. This small aggregate is the only
field-evidence file copied into the hosted API image. It is sample evidence,
not a nationally weighted estimate, and it never creates field boundaries.
