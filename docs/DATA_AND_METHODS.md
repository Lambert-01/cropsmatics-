# Cropmatics Data and Methods

This is the single source of truth for what Cropmatics uses, how it is
processed and what its numbers mean.

## Official sources

The primary source is the Rwanda National Institute of Statistics (NISR)
Seasonal Agricultural Survey (SAS):

- `SAS 2022` annual tables
- `SAS 2023` annual tables
- `SAS 2024` annual tables
- `SAS 2025` annual tables
- `2026 Season A` tables
- `2026 Season B` tables

They are retained under `data/raw/nisr/sas/`. Raw sources are immutable. The
annual release is the serving authority for 2025B; the two standalone 2025B
workbooks remain archive evidence and are not mixed into the canonical panel.
Additional registered context includes MINAGRI post-harvest and cold-chain
programme information, Open-Meteo weather context and Rwanda district boundary
data. Context sources are never presented as NISR crop statistics.

### About the `derived_source_extracts_2024_2026` folder

`data/raw/derived_source_extracts_2024_2026/` is an internal **derived
compatibility pack**. It is not an NISR publication, not a new survey and not
the name of an official dataset. The name describes the period and the
source-derived extracts that it contains; it does not claim that this folder is
an official publication or that the platform created the underlying
observations.

The pack contains CSV extracts made from identified public or supplied source
tables:

| File | What it contains | Upstream evidence |
|---|---|---|
| `01_district_crop_productivity_2025B.csv` | 2025B district-by-crop area, production and yield | NISR SAS 2025 Season B workbook retained at `data/raw/nisr/sas/2025/season_b/workbooks/Tables_2025_Season_B_0_curated_official.xlsx` |
| `02_district_productivity_factors_2025B.csv` | 2025B district practice and factor indicators | NISR SAS 2025 Season B workbook and its mapped tables |
| `03_irrigation_water_2025B.csv` | 2025B district water and irrigation observations | NISR SAS 2025 Season B workbook and its mapped tables |
| `04_erosion_control_2025B.csv` | 2025B erosion-control observations | NISR SAS 2025 Season B workbook and its mapped tables |
| `05_crop_postharvest_use_2025B.csv` | 2025B crop use shares | NISR SAS 2025 Season B workbook and its mapped tables |
| `06_national_crop_trends_2024_2026.csv` | Published national crop trend extracts and comparators | NISR SAS table/release references recorded in each row and in `09_source_registry.csv` |
| `07_national_input_practice_trends_2024_2026.csv` | Published national practice trend extracts | NISR SAS 2024, 2025 and 2026 release references recorded in the source registry |
| `08_verified_cold_chain_context_2026.csv` | Public MINAGRI-ACES programme-district context | MINAGRI-ACES announcement recorded in the source registry; capacity and exact facility coordinates are not asserted |
| `09_source_registry.csv` | Upstream URLs, release coverage, use and package status | NISR and MINAGRI source pages |

The pack declares `synthetic_records_included: false` in `manifest.json`, but
that does not make it an original official release. It means the package does
not intentionally generate synthetic observations. The CSVs are derived and
reformatted for compatibility, so the original source, table and period must
be cited alongside any number. The canonical multi-period serving panel is
built from the retained worksheet extracts under `data/raw/nisr/sas/`; the
compatibility pack remains because older loaders and parity checks use its
2025B file names.

The complete upstream trail is in
`data/raw/derived_source_extracts_2024_2026/09_source_registry.csv`. This file is
the authoritative source map for the compatibility pack. Reviewers should not
be told that the folder itself is an official NISR dataset, that all files came
from one workbook, or that a derived CSV replaces the original NISR release.

### Why some files say `2025B`

Files `01` through `05` are intentionally retained as **2025 Season B
single-release compatibility extracts**. Their names and source IDs are
period-specific because those legacy wide tables were created from the mapped
2025B workbook. They are used for backward-compatible archive endpoints and
parity checks; they are not the source of the platform's complete period axis.

The all-period system uses the canonical processed tables built from the
separate SAS release directories under `data/raw/nisr/sas/`:

- `data/processed/crop_productivity.csv` covers the 14 published periods from
  `2022A` through `2026B`.
- `data/processed/agricultural_practice_observation.csv` and
  `data/processed/fertilizer_source.csv` carry period-aware practice data from
  the published release tables.
- `data/processed/crop_postharvest_use_multi_period.csv` covers its published
  post-harvest range, `2024A` through `2026B`.
- `data/processed/national_crop_trends.csv` and
  `data/processed/national_input_trends.csv` provide their own published
  national series.

Therefore, a user selecting `2022`, `2023`, `2024`, `2025` or `2026` is not
being shown a 2025B value under a different period. The API's canonical
productivity, trends, practice indicators and coverage endpoints read the
period-aware processed tables. A legacy endpoint that genuinely reads one of
the five 2025B wide tables is labelled and reports its limited coverage rather
than pretending that the table contains all years.

## Coverage

The canonical productivity panel contains 14 published periods from `2022A`
through `2026B`, up to 30 districts and 17 canonical crops. Season C has fewer
published crops because the source tables publish fewer crops for that season.
A missing crop, district, indicator or period remains unavailable; it is never
filled by interpolation or a fabricated estimate.

SAS workbook review currently records:

| Disposition | Sheets | Meaning |
|---|---:|---|
| Used | 162 | Mapped sheets powering a processed analytical dataset |
| Not yet mapped | 276 | Retained source sheets outside the current product scope |
| Metadata | 2 | Contents or table-of-contents sheets |

The denominator is 440 unique sheet instances. Not every sheet is expected to
power a dashboard feature, but every displayed number must have source and
period provenance.

## Processing path

```text
NISR worksheets and registered public context
        -> extract and validate
        -> normalize periods, crops and district codes
        -> build processed tables with lineage
        -> Python statistics, models and optimization
        -> FastAPI response
        -> web dashboard and mobile app
```

Important processed outputs include `crop_productivity.csv`,
`agricultural_practice_observation.csv`, `fertilizer_source.csv`,
`crop_postharvest_use_multi_period.csv`, `data_coverage.csv` and the source
registry. PostgreSQL is the production analytical authority; file mode is for
reproducible development and pipeline work.

## Measures and formulas

- Yield is published or calculated in `kg/ha` only within a named crop.
- Production is in metric tonnes and harvested area is in hectares.
- Productivity Gap Index is `100 * (benchmark - observed) / benchmark`.
  Positive values indicate a shortfall against the selected benchmark.
- Benchmarks are explicit, including national crop median, season median and
  comparable-district strategies.
- National multi-crop yield is production-weighted. Raw yields from different
  crops are never averaged as if they had the same natural scale.
- Trends use one period axis. A release that did not publish a value remains a
  gap in the series.
- Factor results describe association, not causation.

## Fertilizer data

Cropmatics exposes two separate fertilizer measures:

1. `fertilizer_source.csv` contains national fertilizer-type supply-channel
   shares across the published periods. The Dashboard card shows this as
   **Fertilizer supply channels**, with a national-only label.
2. `agricultural_practice_observation.csv` contains district fertilizer-source
   shares under `domain=fertilizer_source_district` and is available through
   Practice Indicators, Reports and Data Explorer.

These are percentages of reported supply channels. They are not fertilizer
quantities, prices, stock levels, farmer counts or proof that a channel caused
different yields. Blank cells remain unavailable and are not converted to zero.

## Product evidence boundaries

- Official NISR/MINAGRI statistics remain separate from voluntary mobile data.
- Storage capacity is shown as unavailable when the source does not publish it.
- Market prices are absent until an attributable provider dataset is registered.
- Validated forecasts are served only when the chronological evidence gate
  passes. A user-assumption planning projection is not an official forecast.
- The 89 material yield source inconsistencies are retained and disclosed;
  official values are not silently overwritten.
- The intervention ranking is decision support for investigation. It is not a
  binding allocation, budget, causal estimate or promised yield gain.

## Optional plot-level field evidence

Cropmatics includes an opt-in extractor for approved NISR Seasonal Agricultural
Survey or Agriculture Household Survey microdata. Place an authorised export in
`data/raw/nisr/sas_microdata/` and run `make data`. The extractor writes
`data/processed/field_crop_observations.csv` with plot area, crop, production,
district, period and provenance. Yield is derived only when production and area
are both present: `production_kg / area_ha`.

The Maps page exposes this evidence through `/api/v1/maps/field-observations`,
aggregated by period, district and crop. Plot IDs and farmer/household IDs are
not returned by that endpoint. The extractor copies coordinates or geometry only
when they are present in the approved source. It never assigns a field to a
district centroid and never treats a district polygon as an individual field.

NISR methodology describes GPS-based plot measurement, but a public microdata
download must not be assumed to include the original field geometry. Exact
clickable field allocation therefore requires an approved geometry file or new
farmer-consented GPS boundary collection. Without that, Cropmatics shows the
plot area and production evidence as a privacy-safe district allocation view and
labels field boundaries as unavailable.

## Provenance and rights

Analytical responses carry source, period, method, scope and limitations. The
repository does not grant redistribution rights over third-party NISR or
MINAGRI material. Obtain restricted respondent-level or workbook sources from
the official release process and follow their terms.
