# Source registry

Machine-readable catalogue of where each dataset comes from and the terms of use.

| File | Contents |
|---|---|
| `data_sources.csv` | source, owner, type, access status, recommended use, URL, redistribution note |

The raw pack also carries its own registry at
`data/raw/cropmatics_real_data_2024_2026/09_source_registry.csv` (official pages +
raw workbook locations).

Traceability rules are defined in
[`docs/DATA_PROVENANCE.md`](../../docs/DATA_PROVENANCE.md). When you add a dataset,
add a row here and give it a stable `source_id`.
