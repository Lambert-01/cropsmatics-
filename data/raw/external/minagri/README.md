# Cropmatics Official Data Add-on

This package contains two **official MINAGRI-derived national-context datasets** that are useful for the Cropmatics storage/post-harvest modules.

## Files
- `10_national_postharvest_infrastructure_2024_2025.csv`
- `11_cold_chain_network_summary_2026.csv`
- `source_registry_additions.csv`
- `Cropmatics_Official_Storage_Context_Addon.xlsx`

## Important limitation
The infrastructure table is **national-level**. Do not assign its capacity totals to individual facilities or districts.

The 2026 cold-chain announcement verifies a 10-packhouse program and named program districts, but does not publish facility-level capacities or exact coordinates. Keep exact capacity/location as `null/not_verified` unless a new official source provides it.

Sources:
- https://www.minagri.gov.rw/fileadmin/user_upload/Minagri/Publications/Annual_Reports/Annual_report_2024-2025_Final.pdf
- https://www.minagri.gov.rw/updates/news-details/rwanda-strengthens-agricultural-value-chains-through-minagri-aces-cold-chain-partnership
