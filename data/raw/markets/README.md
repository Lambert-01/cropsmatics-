# Market price raw sources

Drop provider price exports here and run `make data` (or
`python scripts/data/ingest_market_prices.py`). The build is provider-neutral: it
writes one canonical table, `data/processed/market_price_observation.csv`, and
never changes the application schema when a provider is added.

```
data/raw/markets/
├── fewsnet/    # FEWS NET Data Warehouse market price extract (CSV/XLSX)
├── esoko/      # MINAGRI e-Soko export
├── wfp/        # WFP DataBridges export (provider disabled until authorised)
└── nisr_sas/   # reviewed NISR SAS farmer selling-price aggregate
```

## Rules

1. **Files are immutable.** Add a new export; never edit one in place. The
   original value, currency and unit are carried through verbatim.
2. **A RWF/kg figure needs two things**: an RWF quote *and* a documented mass
   conversion (`kg`, `mt`/`tonne`, or an explicit `conversion_to_kg` column).
   Anything else keeps `price_rwf_per_kg` null and the reasoning in
   `conversion_basis`. No conversion is ever estimated, and no exchange rate is
   applied.
3. **Nothing is inferred from a filename.** Market, commodity, currency and unit
   come from a mapped column or an explicitly documented provider default.
4. **Bad input fails loudly.** A row that cannot be read (unparseable date,
   non-numeric price, missing commodity/currency/unit) is written to
   `data/interim/market_price_quarantine.csv` with a reason. If a file's required
   columns cannot be mapped at all, every row quarantines and the build stops -
   an empty market table is never a silent success.
5. **Provider semantics stay separate.** `price_type` is a canonical bucket
   (`FARMGATE`, `PRODUCER`, `WHOLESALE`, `RETAIL`, `ASSEMBLY`, `UNSPECIFIED`) and
   `price_type_raw` keeps the provider's own wording. A FEWS NET `Wholesale`
   price is not the same observation as a farmer-reported selling price, and the
   table does not pretend otherwise.

## Provider status

| Folder | Source id | Contract | Notes |
|---|---|---|---|
| `fewsnet/` | `FEWSNET_MARKET_PRICES` | column names **verified** against the public `marketpricefacts.csv` extract | Export with `?country_code=RW`. `admin_2` is often empty and the district sits inside the market name, so `district_code` is legitimately null. `source_organization`/`source_document` show the upstream collector (for Rwanda: MINAGRI / e-Soko). |
| `esoko/` | `MINAGRI_ESOKO` | **unverified** | No documented public bulk format. Confirm the alias list in `scripts/data/ingest_market_prices.py` against the first real export. `RWF` is the documented currency default. |
| `wfp/` | `WFP_DATABRIDGES` | **unverified** | Disabled by default: DataBridges needs API credentials issued to authorised users. Enable the provider once an authorised export is placed here. |
| `nisr_sas/` | `NISR_SAS_MARKET_PRICES` | canonical columns | Reviewed aggregate of the restricted microdata only (`s2q28` is published as Rwf per kilogram). Never drop respondent-level files here. |

Full ingestion detail, including the quarantine report, is printed by the build
and recorded in `data/interim/market_price_report.json`.
