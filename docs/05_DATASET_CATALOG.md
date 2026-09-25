# 5. Dataset Catalogue

## NISR SAS 2026 Season A
Useful public indicators:
- agricultural land use
- improved seed
- organic/inorganic fertilizer
- pesticide
- irrigation
- anti-erosion
- agroforestry
- mechanization

## NISR SAS 2026 Season B
Published in September 2026 and useful as the newest seasonal baseline:
- land use
- inputs/practices
- irrigation/agroforestry/mechanization
- downloadable report/table products

## NISR SAS 2025
Useful for historical and seasonal comparison.

## NISR SAS 2024 microdata documentation
The production module documents variables for:
- province/district
- crop
- plot area
- sowing/harvest period
- improved seed
- quantities harvested
- sold/transformed quantities
- market and selling price
- stored quantity
- storage facility
- total quantity lost
- losses during harvest/transport/storage/processing/packaging/sales
- fertilizer
- pesticide
- erosion
- irrigation
- survey weight

See `data/dictionaries/sas_2024_core_variable_map.csv`.

## External enrichment
Recommended, subject to access/license:
- Meteo Rwanda
- CHIRPS rainfall
- ERA5-Land
- SoilGrids/ISRIC
- NISR geodata
- OpenStreetMap roads
- MINAGRI / NAEB price and facility information

## Integration rules
- integrate by geography + time + crop at compatible aggregation levels;
- never merge unrelated survey respondents as though they are the same person/farm;
- preserve survey design/weights;
- keep app data separate from official estimates.
