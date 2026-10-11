# SAS Coverage Audit — 2022 through 2026 Season B

**Generated:** 2026-10-11
**Machine-readable inventory:** `data/source_registry/sas_sheet_inventory.csv` (regenerate with `python scripts/data/inventory_sas_workbooks.py`)
**Checkout:** `mobile-intelligence-v2-local` @ `c54a671` (inventory commit follows)

Every worksheet of every owner-supplied workbook is inventoried and classified.
No sheet is silently dropped; a sheet is never marked *used* merely because a
CSV was extracted — *used* requires the reviewed mapping (`scripts/data/sas_table_map.py`)
to cover the release.

## Supplied workbooks

| File | SHA-256 (first 12) | Sheets | Release key | Treatment |
|---|---|---:|---|---|
| `SAS 2022_Tables_0.xlsx` | `8576cd4a462d` | 68 | *(none — not in reviewed map)* | New annual source; **not ingested** |
| `SAS 2023_Annual Tables (3).xlsx` | `fc07b45002c7` | 79 | *(none)* | New annual source; **not ingested** |
| `SAS 2024_Annual Tables.xlsx` | `5c7c6024d9a7` | 79 | `SAS_2024_ANNUAL` | Already extracted + mapped |
| `SAS 2025_Annual Tables.xlsx` | `3a6ed44f1e97` | 80 | `SAS_2025_ANNUAL` | Already extracted + mapped |
| `Tables_2025_Season_B_0.xlsx` | `49b045312731` | 33 | *(none)* | Seasonal source; **not ingested** |
| `Tables_2026 Season A (1).xlsx` | `c4e4cb4c4e69` | 35 | `SAS_2026A` | Already extracted + mapped (canonical copy) |
| `Tables_2026 Season A.xlsx` | `c4e4cb4c4e69` | 35 | `SAS_2026A` | **Byte-identical duplicate** of the file above |
| `Tables_2026 Season B.xlsx` | `5ca81c6b0a54` | 33 | `SAS_2026B` | Already extracted + mapped |

### 2026 Season A duplicate — resolved

`Tables_2026 Season A (1).xlsx` and `Tables_2026 Season A.xlsx` have the **same
SHA-256** (`c4e4cb4c4e697febac1cb332280189a4dc6ff7f10d0de956bff279b284c5d4c2`),
so they are byte-for-byte identical, not two releases. The inventory keeps both
on disk but marks the second as `duplicate`; it is never ingested separately and
cannot create a precedence conflict.

## Sheet disposition (442 sheet instances)

| Disposition | Sheets | Meaning |
|---|---:|---|
| `used` | 110 | Mapped **and** powering canonical datasets (productivity, practices, irrigation, erosion, post-harvest for 2024A–2026B) |
| `not_yet_mapped` | 295 | Quantitative sheets the reviewed mapping does not cover: all of 2022/2023/2025B, plus unmapped indicator sheets of the mapped releases |
| `duplicate` | 35 | The byte-identical 2026A copy |
| `metadata` | 2 | True table-of-contents sheets (`List of tables` in 2022, `Contents` in 2025) |

Per workbook:

| File | used | not_yet_mapped | duplicate | metadata |
|---|---:|---:|---:|---:|
| SAS 2022 | 0 | 67 | 0 | 1 |
| SAS 2023 | 0 | 79 | 0 | 0 |
| SAS 2024 annual | 42 | 37 | 0 | 0 |
| SAS 2025 annual | 42 | 37 | 0 | 1 |
| 2025 Season B | 0 | 33 | 0 | 0 |
| 2026 Season A (canonical) | 13 | 22 | 0 | 0 |
| 2026 Season A (copy) | 0 | 0 | 35 | 0 |
| 2026 Season B | 13 | 20 | 0 | 0 |

The 110 *used* sheets reproduce the previously reported count (110 of 227
extracted sheets across 2024–2026). With the three new workbooks added the
denominator is now 442 sheet instances, of which 295 await mapping review.

## Mapping caveat discovered during classification

Many data sheets in the 2022 workbook carry a stray **"List of Tables" banner
in cell A1** while holding real observations below it (e.g. sheet `Table 25`:
Season C 2022 crop production by district; sheet ` Table 26` — note the leading
space in the sheet name — Season A 2022 production-use shares). Metadata
classification is therefore decided by **sheet name only**, never by the title
cell, and the banner is skipped when extracting titles. Two further quirks
recorded verbatim in the inventory: sheet names with leading whitespace
(` Table 26`), and per-sheet titles that contradict the workbook year (already
documented for 2024/2025 in `sas_table_map.py`).

## What this means for coverage claims

* **Verified loaded coverage remains 2024A–2026B.** The canonical panel and the
  API answer from the four releases the reviewed mapping covers.
* **2022 and 2023 exist as supplied source material but are NOT ingested.**
  No API period, chart or "history" claim may imply 2022/2023 availability
  until their productivity tables are reviewed, mapped, ingested and validated.
  The 2022 workbook does contain district-level production/yield/area tables
  per season (e.g. `Table 25` = Season C 2022 production), so extension is
  feasible but requires a mapping review of ~150 sheets across both workbooks.
* **`Tables_2025_Season_B_0.xlsx` is a separate seasonal release** not currently
  in the canonical build; the existing 2025B rows in the panel derive from the
  2025 annual workbook's Season B tables. Whether the seasonal workbook revises
  those figures must be checked before it is ingested (precedence: prefer the
  later-published seasonal release for 2025B only after a cell-level
  comparison).
* NISR SAS publications are official statistics; the `DATA_LICENSE_AND_PROVENANCE.md`
  obligations apply. The workbooks remain untracked in git by design — the
  inventory records their hashes so any build can verify which bytes it used.

## Next steps (ordered)

1. Mapping review of 2022/2023 productivity tables (area/harvested/yield/production
   per season) → extend `sas_table_map.py` + `SAS_RELEASES` + extraction.
2. Cell-level comparison of `Tables_2025_Season_B_0.xlsx` vs 2025 annual Season B
   tables; document precedence decision.
3. Cold-build reproducibility check after any mapping change (two isolated runs,
   checksum comparison).
4. Only then extend period selectors, coverage API and UI history ranges.
