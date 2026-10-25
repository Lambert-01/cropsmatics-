# Data Cleanup Audit

Updated: 2026-10-25

## Decision

The application data directory now contains source-backed data and reproducible
derived outputs only. The fabricated demo harvest dataset was removed.

## Removed

| Path | Reason |
|---|---|
| `data/dev_fixtures/synthetic/demo_harvest_registrations.csv` | Explicitly fabricated demo records; not a public dataset and not used by the production pipeline. |
| `data/dev_fixtures/synthetic/README.md` | Documentation for the removed fabricated dataset. |
| `data/raw/cropmatics_real_data_2024_2026/Cropmatics_Core_Real_Data_2024_2026.xlsx` | Compiled convenience workbook duplicating retained CSV extracts; not an original public NISR workbook. |
| `data/raw/external/minagri/Cropmatics_Official_Storage_Context_Addon.xlsx` | Compiled convenience workbook duplicating retained MINAGRI CSV tables; not an original public MINAGRI release. |
| `data/**/.DS_Store` | Local macOS filesystem metadata, not data. |

## Retained source archive

The following are intentionally retained:

- `data/raw/nisr/sas/<year>/<release>/tables/`: worksheet-level extracts from
  the supplied NISR SAS releases, including sheets not currently mapped to a
  feature.
- `data/raw/nisr/sas/<year>/<release>/workbooks/`: original workbooks available
  locally. Most owner-supplied XLSX files are ignored by Git because of size and
  redistribution terms; `manifest.csv` records their source mapping and hashes.
- `data/raw/nisr/sas/2025/season_b/workbooks/Tables_2025_Season_B_0_curated_official.xlsx`:
  the tracked curated official workbook retained for provenance.
- `data/raw/cropmatics_real_data_2024_2026/*.csv`: real NISR/MINAGRI-derived
  compatibility extracts still consumed by the current pipeline.
- `data/raw/external/minagri/*.csv`: real MINAGRI-derived national and program
  context tables used by storage/post-harvest features.
- `data/dictionaries/` and `data/source_registry/`: canonical identifiers and
  provenance contracts, not fabricated observations.

## Generated, not source

`data/interim/` and `data/processed/` are regenerable pipeline outputs. They are
not original public releases and should not be hand-edited or treated as raw
source. Run `make data` to rebuild them from the retained archive.

## What was not deleted

Unused SAS worksheets were not deleted. An unmapped sheet is not fake; it is part
of the original release archive and may be needed for future coverage or audit.
The current inventory records all worksheets and the reviewed mapping records
which ones feed analytical outputs.

## Authenticity boundary

This cleanup does not certify every upstream value independently. It enforces the
repository boundary: official/public source files and clearly attributed
source-derived extracts remain; fabricated application/demo records do not.
Each displayed analytical value must still be traced through the pipeline
provenance fields to its source release and worksheet.
