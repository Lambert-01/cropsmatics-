Cropmatics NISR SAS Source Archive
==================================

The 2022, 2023, 2024, and 2025 annual releases and the 2026 Season A/B releases
are organized by year and release. Each release has tables/ containing the
worksheet-by-worksheet CSV extraction and workbooks/ containing its original
XLSX when present locally. The two distinct 2025 Season B originals are kept
together under 2025/season_b/workbooks/; neither is currently ingested because
precedence against the 2025 annual release has not been settled.

The extracted CSV cells retain the published worksheet values, including
headers, blank fields, and spacer rows. manifest.csv maps each CSV to its
original workbook, worksheet, and used range. The reviewed mapping in
scripts/data/sas_table_map.py controls which sheets become processed datasets.

Owner-supplied XLSX files are local and gitignored; the separately curated
2025B official original is versioned. The CSV extractions and manifest are
versioned so Docker can reproduce the processed data without local workbooks.
Do not edit original workbooks or infer values for unmapped sheets.
