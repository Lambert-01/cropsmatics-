# Data License & Provenance

This package is not a republication of all NISR data.

| Location | Contents |
|---|---|
| `data/raw/cropmatics_real_data_2024_2026/` | official NISR/MINAGRI-derived CSV extracts; original NISR workbooks are archived under `data/raw/nisr/sas/` |
| `data/interim/legacy_official_derived/` | superseded official-derived extracts (provenance only) |
| `data/dictionaries/` | geography + crop code lists and the SAS 2024 variable map |
| `data/source_registry/` | where to obtain full official/open files and their access terms |

No fabricated dataset is included under `data/`. Test-only values are created in
temporary test fixtures and are not redistributed as application data.

For respondent-level NISR microdata, obtain the source through the NISR
catalogue/release process and comply with its terms. It is **not** redistributed
here.

Full transformation and provenance details: [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md).
