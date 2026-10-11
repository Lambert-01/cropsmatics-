# SAS Coverage Audit — 2022 through 2026 Season B

**Generated:** 2026-10-11
**Machine-readable inventory:** `data/source_registry/sas_sheet_inventory.csv` (regenerate with `python -m scripts.data.inventory_sas_workbooks`)
**Checkout:** `mobile-intelligence-v2-local` @ `7fc2dc5` + the P2 expansion in this pass

Every worksheet of every owner-supplied workbook is inventoried and classified
into exactly one disposition. Nothing is silently dropped, and a sheet is never
marked *used* merely because a CSV was extracted from it: *used* requires both
the reviewed mapping (`scripts/data/sas_table_map.py`) **and** the processed
dataset that surfaces that domain actually existing in this checkout
(`DOMAIN_OUTPUTS` in `scripts/data/inventory_sas_workbooks.py`). If the file is
missing, the sheets fall back to `mapped_not_exposed` automatically — the
classifier cannot claim exposure that is not real.

## Supplied workbooks

| File | SHA-256 (first 12) | Sheets | Release key | Treatment |
|---|---|---:|---|---|
| `SAS 2022_Tables_0.xlsx` | `8576cd4a462d` | 68 | `SAS_2022_ANNUAL` | **Mapped and extracted** (productivity, 2022A/B/C) |
| `SAS 2023_Annual Tables (3).xlsx` | `fc07b45002c7` | 79 | `SAS_2023_ANNUAL` | **Mapped and extracted** (productivity, 2023A/B/C) |
| `SAS 2024_Annual Tables.xlsx` | `5c7c6024d9a7` | 79 | `SAS_2024_ANNUAL` | Extracted + mapped |
| `SAS 2025_Annual Tables.xlsx` | `3a6ed44f1e97` | 80 | `SAS_2025_ANNUAL` | Extracted + mapped |
| `Tables_2025_Season_B_0.xlsx` | `49b045312731` | 33 | *(none)* | Seasonal source; **not ingested** (precedence undecided) |
| `Tables_2026 Season A (1).xlsx` | `c4e4cb4c4e69` | 35 | `SAS_2026A` | Extracted + mapped (canonical copy) |
| `Tables_2026 Season A.xlsx` | `c4e4cb4c4e69` | 35 | `SAS_2026A` | **Byte-identical duplicate** of the file above |
| `Tables_2026 Season B.xlsx` | `5ca81c6b0a54` | 33 | `SAS_2026B` | Extracted + mapped |

### 2026 Season A duplicate — resolved

`Tables_2026 Season A (1).xlsx` and `Tables_2026 Season A.xlsx` have the **same
SHA-256** (`c4e4cb4c4e697febac1cb332280189a4dc6ff7f10d0de956bff279b284c5d4c2`),
so they are byte-for-byte identical, not two revisions. Both stay on disk; the
inventory marks the second `duplicate` and it is never ingested separately, so no
precedence conflict can arise.

## Sheet disposition (442 sheet instances)

| Disposition | Sheets | Meaning |
|---|---:|---|
| `used` | 56 | Mapped **and** powering a published processed dataset (`crop_productivity.csv`) |
| `mapped_not_exposed` | 78 | Mapped and ingested to `data/interim` with full lineage, but no processed dataset surfaces the domain yet (practices, irrigation, water source, erosion, post-harvest) |
| `not_yet_mapped` | 271 | Quantitative sheets the reviewed mapping does not cover |
| `duplicate` | 35 | The byte-identical 2026A copy |
| `metadata` | 2 | Table-of-contents sheets (`List of tables` in 2022, `Contents` in 2025) |

Per workbook:

| File | used | mapped_not_exposed | not_yet_mapped | duplicate | metadata |
|---|---:|---:|---:|---:|---:|
| SAS 2022 | 12 | 0 | 55 | 0 | 1 |
| SAS 2023 | 12 | 0 | 67 | 0 | 0 |
| SAS 2024 annual | 12 | 30 | 37 | 0 | 0 |
| SAS 2025 annual | 12 | 30 | 37 | 0 | 1 |
| 2025 Season B | 0 | 0 | 33 | 0 | 0 |
| 2026 Season A (canonical) | 4 | 9 | 22 | 0 | 0 |
| 2026 Season A (copy) | 0 | 0 | 0 | 35 | 0 |
| 2026 Season B | 4 | 9 | 20 | 0 | 0 |

> The previously reported "110 used / 227 extracted" count described the
> 2024–2026 extracted sheets only, and it counted a sheet as used when it was
> *mapped*. Recounted against the expanded denominator, 56 sheets actually reach
> a processed dataset, 78 are mapped but not yet surfaced, and 271 remain to be
> reviewed. The 78 `mapped_not_exposed` sheets are the honest description of the
> "78 non-productivity sheets not powering multi-period screens" finding.

## 2022/2023 productivity mapping (the P2 expansion)

Both annual workbooks were read directly to locate their metric blocks; the sheet
positions differ from 2024 and 2025, so each TableSpec was verified against the
workbook before being added.

| Release | cultivated area | harvested area | yield | production |
|---|---|---|---|---|
| 2022 annual | Tables 11, 12, 13 (A, B, C) | Tables 14, 15, 16 | Tables 17, 18, 19 | Tables 23, 24, 25 |
| 2023 annual | Tables 10, 11, 12 | Tables 13, 14, 15 | Tables 16, 17, 18 | Tables 22, 23, 24 |

Two published layout variants had to be handled by the reader
(`scripts/data/ingest_sas_tables.py::_resolve_layout`), because neither matched
the 2024–2026 shape:

* **2022 Season C sheets indent every label into column 2**, leaving column 1
  empty (`Table 13`, `Table 16`, `Table 19`, `Table 25`).
* **2023 production sheets stack the crop labels above the `District` row**
  (`Table 22`, `Table 23`: crops on row 3, district label on row 4).

Both are now resolved from the sheet itself rather than assumed. The resolver is
behaviour-preserving for every previously working sheet: rebuilding the panel
produces **byte-identical values for 2024A–2026B** (3,738 rows, all 37 columns
compared), verified against a pre-change copy of `crop_productivity.csv`.

One further source spelling is normalized rather than dropped, recorded inline in
`_CROP_CANONICAL`/`_AGGREGATE_CROPS`: `Taro & Yams` → `Yams & Taro`,
`Yarms & Taro` (2023 typo) → `Yams & Taro`, `Ground nuts` → `Groundnut`, and
`Developped land` → excluded as a land aggregate (not a crop). `Chia seed` is
published in 2022 Season B but is **not** in the 17-crop dictionary, so it is
left unmapped and reported rather than silently coerced into another crop.

Result: the canonical panel now covers **14 periods** (2022A–2026B),
6,156 rows, 30 districts, 17 crops. Season C remains a narrower crop list in
every release (5 or 6 crops), which is a property of the NISR tables, not a gap
in the ingest.

## Published-data quality findings

### Yield versus production/harvested area

NISR publishes yield independently of production and harvested area, so the two
do not always reconcile. The policy is now defined once
(`scripts/data/common.py`) and shared by the validator and the database loader so
they can never disagree:

* tolerance = `max(1 kg/ha, 1% of the published yield)`;
* within tolerance → release **rounding**, reported as `info`;
* beyond tolerance → **material** source inconsistency, reported as a `warn`
  naming the affected rows, and each row is flagged `review` by the loader.

Across the 14-period panel: **4,929 rows reconcile within tolerance** and
**89 rows are material** (2 in 2022B, 37 in 2023A, 24 in 2023B, 21 in 2023C,
4 in 2024B, 1 in 2026B). The 2023 release dominates because it prints whole
numbers and, for `Other cereals`/`Other crops`, publishes yields (sometimes
literally `0`) that contradict its own production and area — for example
Nyagatare 2023B `Other cereals`, 157 MT over 269 ha against a published yield of
0 kg/ha. The previously reported five cases (four 2024B `Other cereals` district
rows and Rubavu 2026B `Other crops`, 4,575.484 kg/ha published against 493.922
implied) are unchanged and still flagged.

Harvested area was verified as the correct denominator rather than a
definitional mismatch: implying yield from *cultivated* area explains only
2,969 of 5,002 comparable rows, against 4,914 from harvested area. Official
figures are never modified; the flag is the mechanism that lets the UI warn and a
forecast trainer exclude a row.

## What this means for coverage claims

* **The canonical panel now genuinely covers 2022A–2026B** — 14 published
  periods, each with all four productivity metrics, all districts, and per-row
  lineage naming the workbook, sheet, row and release.
* **Practices, irrigation, water source, erosion and post-harvest remain
  ingested-but-not-exposed.** Their rows live in `data/interim` with lineage but
  no API/UI surface reads them, so no period selector, metric badge or "history"
  claim may imply multi-period availability for those domains. The 2025B legacy
  files (`district_productivity_factors.csv`, `irrigation_water.csv`,
  `erosion_control.csv`, `crop_postharvest_use.csv`) are what the current API
  serves, and they are single-period by construction.
* **2026C does not exist** and is rejected by `normalize_period`; the period
  dimension lists exactly what NISR has published.
* **`Tables_2025_Season_B_0.xlsx` remains uningested.** The 2025B rows in the
  panel come from the 2025 annual workbook. Whether the standalone seasonal
  workbook revises those figures must be settled by a cell-level comparison
  before it is ingested, otherwise one of the two publications would silently win.
* NISR SAS publications are official statistics; the
  `DATA_LICENSE_AND_PROVENANCE.md` obligations apply. The workbooks stay untracked
  in git by design — the inventory records their hashes so any build can verify
  which bytes it used, and neither workbook is redistributed by this repository.

## Next steps (ordered)

1. Cell-level comparison of `Tables_2025_Season_B_0.xlsx` against the 2025
   annual Season B tables, then record the precedence decision.
2. Materialize the multi-period practice/irrigation/erosion/post-harvest domains
   into processed datasets so their 78 mapped sheets can move from
   `mapped_not_exposed` to `used`.
3. Extend the API/UI period selectors from `data_coverage` (never a hardcoded
   year list) so 2022 and 2023 appear wherever their indicators are valid.
4. Forecast work must exclude the 89 `review`-flagged rows from training, or
   include them only in a documented sensitivity run.
