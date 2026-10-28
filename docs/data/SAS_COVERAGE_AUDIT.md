# SAS Coverage Audit — 2022 through 2026 Season B

**Generated:** 2026-10-29 from the current data-build checkout; the inventory and
processed outputs were regenerated after exposing fertilizer-source tables.
**Machine-readable inventory:** `data/source_registry/sas_sheet_inventory.csv` (regenerate with `services/api/.venv/bin/python -m scripts.data.inventory_sas_workbooks` after `make install-api`)
**Scope:** current local source archive and regenerated sheet inventory

Every worksheet of every retained SAS workbook is inventoried and classified
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
| `Tables_2025_Season_B_0.xlsx` | `49b045312731` | 33 | *(none)* | **Archive-only**; annual release is the serving authority |
| `Tables_2025_Season_B_0_curated_official.xlsx` | `6fdfd6ababdf` | 33 | *(none)* | **Archive-only**; distinct curated original, not ingested |
| `Tables_2026 Season A.xlsx` | `c4e4cb4c4e69` | 35 | `SAS_2026A` | Extracted + mapped; sole retained copy |
| `Tables_2026 Season B.xlsx` | `5ca81c6b0a54` | 33 | `SAS_2026B` | Extracted + mapped |

The curated original is retained under `2025/season_b/workbooks/`. Its hash
differs from the owner-supplied 2025B workbook (`49b045312731`), so it was
not removed as a duplicate. Both 2025B sources appear in the inventory.

### 2026 Season A duplicate — resolved

`Tables_2026 Season A (1).xlsx` and `Tables_2026 Season A.xlsx` had the same
SHA-256 (`c4e4cb4c4e697febac1cb332280189a4dc6ff7f10d0de956bff279b284c5d4c2`).
The redundant `(1)` copy was removed; the unsuffixed file is unchanged.

## Sheet disposition (440 unique sheet instances)

| Disposition | Sheets | Meaning |
|---|---:|---|
| `used` | 162 | Mapped **and** powering a published processed dataset (`crop_productivity.csv`, `agricultural_practice_observation.csv`, `fertilizer_source.csv` or `crop_postharvest_use_multi_period.csv`) |
| `mapped_not_exposed` | 0 | *(none left)* Mapped and ingested to `data/interim` with full lineage, but no processed dataset surfaces the domain yet |
| `not_yet_mapped` | 276 | Sheets the reviewed mapping does not cover, including both 2025B originals |
| `metadata` | 2 | Table-of-contents sheets (`List of tables` in 2022, `Contents` in 2025) |

Per workbook:

| File | used | mapped_not_exposed | not_yet_mapped | metadata |
|---|---:|---:|---:|---:|
| SAS 2022 | 18 | 0 | 49 | 1 |
| SAS 2023 | 18 | 0 | 61 | 0 |
| SAS 2024 annual | 48 | 0 | 31 | 0 |
| SAS 2025 annual | 48 | 0 | 31 | 1 |
| 2025 Season B | 0 | 0 | 33 | 0 |
| 2025 Season B curated original | 0 | 0 | 33 | 0 |
| 2026 Season A | 15 | 0 | 20 | 0 |
| 2026 Season B | 15 | 0 | 18 | 0 |

> The previously reported "110 used / 227 extracted" count described the
> 2024–2026 extracted sheets only, and it counted a sheet as used when it was
> *mapped*. Recounted against the expanded denominator, 56 sheets reached a
> processed dataset at that time, 78 were mapped but not surfaced, and 271
> remained to be reviewed at that time. The curated 2025B original adds another
> 33 unreviewed sheets to the current archive.
>
> **Every mapped sheet is now exposed.** The practice, irrigation, water-source,
> erosion-control, erosion-severity, fertilizer-source and post-harvest domains were materialized by
> `scripts/data/build_agricultural_practice_observation.py` and
> `scripts/data/build_crop_postharvest_multi_period.py`, which is why
> `used` rose from 56 to 162 and `mapped_not_exposed` stayed at 0. The two
> output filenames were already the declared contract in
> `inventory_sas_workbooks.DOMAIN_OUTPUTS` and `common.PROCESSED_FILES`, so the
> classifier flipped them to `used` on its own - the stage is never hand-edited.

## 2022/2023 productivity mapping (the P2 expansion)

Both annual workbooks were read directly to locate their metric blocks; the sheet
positions differ from 2024 and 2025, so each TableSpec was verified against the
workbook before being added.

The 2022 workbook uses period-bearing aggregate labels such as `National 2022 A`,
`National 2022 B` and `National Level 2022`, followed by prior-year comparison
rows. The ingestion parser now matches the current release period before
classifying these rows as the national `total`, so national production and
harvested-area values are retained without importing the comparison row.

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
* **Practices, irrigation, water source, erosion, fertilizer source and
  post-harvest are now exposed with their reviewed grains.**
  `agricultural_practice_observation.csv` (12,475 rows across 14 periods,
  including district fertilizer-source shares in 2022-2026) and
  `fertilizer_source.csv` (1,481 national fertilizer-type/source observations
  across 14 periods) and
  `crop_postharvest_use_multi_period.csv` (1,573 rows: 8 periods × 17 crops × 11
  indicators) carry the real period dimension. Core practice, irrigation, water
  and erosion domains are published for 2024A-2026B; fertilizer-source domains
  extend the context layer to 2022A-2026B. The 2025B legacy wide files
  (`district_productivity_factors.csv`, `irrigation_water.csv`,
  `erosion_control.csv`, `crop_postharvest_use.csv`) are deliberately left in
  place and unchanged: existing clients read them, and they are single-period by
  construction. Both generations are described in `data_coverage.csv`, so per
  dataset the period coverage is explicit rather than assumed.
* **Indicator coverage is domain-specific.** Core practice, irrigation, water
  source, erosion and post-harvest observations cover 2024A-2026B. Fertilizer
  source tables also exist for 2022A-2023C, so those periods are exposed only for
  the fertilizer-source domains. The API reports availability per indicator
  rather than letting a period selector imply universal coverage.
* **2026C does not exist** and is rejected by `normalize_period`; the period
  dimension lists exactly what NISR has published.
* **The annual release is the serving authority for 2025B.** The two standalone
  originals remain retained as archive-only evidence. They differ by hash and
  are not interchangeable; neither is ingested or mixed into the panel. See
  [`SAS_SOURCE_PRECEDENCE.md`](SAS_SOURCE_PRECEDENCE.md) for the promotion
  controls.
* NISR SAS publications are official statistics; the
  `DATA_LICENSE_AND_PROVENANCE.md` obligations apply. Owner-supplied workbooks
  stay untracked in git; the separately curated 2025B original remains
  versioned. The inventory records the owner-supplied workbook hashes.

## Next steps (ordered)

1. Keep the annual release as the canonical 2025B source unless NISR publishes
   superseding authority. If that authority arrives, complete the cell-level
   comparison and change-control checklist in `SAS_SOURCE_PRECEDENCE.md` before
   promoting a standalone workbook.
2. ~~Materialize the multi-period practice/irrigation/erosion/post-harvest
   domains into processed datasets.~~ **Done**: `used` is now 162 and
   `mapped_not_exposed` is 0. The pipeline order in `scripts/data/run_all.py`
   builds them, `data_coverage.csv` describes their periods, and
   `scripts/tests/test_indicator_exposure.py` fails if a mapped sheet ever loses
   its processed dataset again.
3. Extend the API/UI period selectors from `data_coverage` (never a hardcoded
   year list) so 2022 and 2023 appear wherever their indicators are valid.
   **Partly done**: `/api/v1/analytics/practice-indicators` and
   `/api/v1/analytics/postharvest-history` carry the period dimension and report
   availability per indicator; the legacy wide-table endpoints are unchanged.
   The web/mobile period selectors still need to read that availability.
4. Forecast work must exclude the 89 `review`-flagged rows from training, or
   include them only in a documented sensitivity run.
5. Review the remaining 276 `not_yet_mapped` sheets as future scope. The two
   standalone 2025B originals are already classified as archive-only; promote
   either one only under `SAS_SOURCE_PRECEDENCE.md` change control.

## Current review note

The 2025B serving decision is explicit in this revision: the mapped annual
release remains canonical, while both standalone files are archive-only. This
does not claim the files are identical; it prevents an unreviewed workbook from
changing an analytical result without a source-authority and lineage review.
