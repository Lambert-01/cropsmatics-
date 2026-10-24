# NISR SAS Source Precedence

## Serving decision

For the current Cropmatics release, `SAS_2025_ANNUAL` is the canonical serving
source for the `2025A`, `2025B` and `2025C` periods. The reviewed mapping in
[`scripts/data/sas_table_map.py`](../../scripts/data/sas_table_map.py) points
the 2025B productivity, practice, irrigation, water-source, erosion and
post-harvest tables to that annual release.

The two standalone workbooks below are retained as source evidence but are
**archive-only** in this build:

| Workbook | Status | Reason |
|---|---|---|
| `Tables_2025_Season_B_0.xlsx` | Archive-only | Separate seasonal delivery; no source-authority record proving it supersedes the annual release |
| `Tables_2025_Season_B_0_curated_official.xlsx` | Archive-only | Distinct curated copy with a different SHA-256; not silently interchangeable with the other copy |

This is a conservative precedence decision, not a claim that the three files
contain identical cells. The pipeline serves one reviewed release per period,
which prevents duplicate 2025B rows and prevents a workbook variant from
silently changing a published statistic. The standalone files are not in the
SAS extraction manifest, not in `sas_table_map`, and do not feed PostgreSQL,
FastAPI, web or mobile responses.

## Change control

Promoting a standalone workbook requires all of the following before changing
the map:

1. written publication authority or an official NISR link identifying it as the
   superseding 2025B release;
2. cell-level comparison against `SAS 2025_Annual Tables.xlsx`, including
   period, table, geography, crop and metric;
3. a reviewed decision about which version wins for each changed table;
4. regenerated processed files, manifest, database load and API release;
5. updated source hashes, coverage audit, DATA CARD and regression fixtures.

Until those checks exist, an archive-only workbook must never be promoted by a
filename match or by copying its values into the processed panel.

## Traceability

The machine-readable release authority is kept in
`scripts/data/common.py` and `scripts/data/sas_table_map.py`. The worksheet
inventory records the standalone files and their archive-only exclusion reason.
The serving panel exposes the chosen source through `source_id`,
`source_release`, `source_workbook` and `source_sheets`.
