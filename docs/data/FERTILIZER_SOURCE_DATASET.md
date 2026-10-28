# Fertilizer source datasets

Cropmatics now exposes two related NISR SAS measures without mixing their
geographic grains.

## District source shares

`data/processed/agricultural_practice_observation.csv` contains rows with
`domain=fertilizer_source_district` for 2022A through 2026B. Each row is a
published percentage of farmers reporting a supply channel in a district:

- government
- agro-dealers
- NGOs/companies
- market
- agricultural cooperative
- other source
- published total

The values are available through the existing `/analytics/practice-indicators`
endpoint with `domain=fertilizer_source_district`, and through the Reports
catalogue as **Fertilizer source by district**.

## National fertilizer type source shares

`data/processed/fertilizer_source.csv` is a separate long table. It contains one
row per `period_code`, `fertilizer_name` and `source_channel` for the national
tables published in 2022A-2026B. The table also retains the reported total, the
sum check, source workbook, sheet and source row.

It is available through the Data Explorer as `fertilizer_source` and through
the Reports catalogue as **Fertilizer source by type**.

## Interpretation limits

These are supply-channel shares, not fertilizer quantities, prices, stock
levels, farmer counts or crop yields. They should support input-supply context
and planning questions such as where agro-dealer dependence is high. They must
not be joined to productivity rows as proof that a source caused a yield
difference. Missing published cells remain unavailable; a blank is never
converted to zero.

The 2022 tables that report fertilizer source by product are processed in the
same national long table. A different 2022 table family reports fertilizer type
shares by district and season; it remains a separate source shape and is not
silently combined with the channel tables.
