"""The data dictionary: every indicator, its unit, and where it comes from.

This module is the single source of truth for normalization. The ingestion
loader is driven by it (it never inspects a column name of its own accord), the
API serves it from ``GET /api/v1/metadata/indicators``, and the database
``indicator``/``unit`` reference tables are seeded from it. Adding an indicator
is therefore a change in exactly one place.

Why the same concept appears under several codes
------------------------------------------------
`improved_seed_farmers_pct` (district, share of farmers) and `improved_seed_pct`
(national, share of farmers) are deliberately distinct indicators rather than one
merged series. They answer different questions at different geographic levels,
and merging them would silently imply a district figure exists where only a
national one was published.

Levels and units are part of the code contract, not decoration: a client that
renders `erosion_control_area_ha` in hectares must be able to trust the unit
without guessing.
"""

from __future__ import annotations

from dataclasses import dataclass

# --- units ------------------------------------------------------------------
# `dimension` groups units that measure the same thing, which is what any future
# conversion has to respect. Distinct percent units are kept apart on purpose:
# "10% of farmers" and "10% of area" are not the same observation.


@dataclass(frozen=True)
class UnitDef:
    code: str
    name: str
    dimension: str


UNITS: tuple[UnitDef, ...] = (
    UnitDef("percent_farmers", "% of farmers", "share"),
    UnitDef("percent_area", "% of cultivated area", "share"),
    UnitDef("percent_land", "% of total land", "share"),
    UnitDef("percent_production", "% of production", "share"),
    UnitDef("percent_respondents", "% of respondents", "share"),
    UnitDef("hectare", "hectares", "area"),
    UnitDef("thousand_hectare", "thousand hectares", "area"),
    UnitDef("metric_tonne", "metric tonnes", "mass"),
    UnitDef("kg_per_hectare", "kilograms per hectare", "yield"),
)


@dataclass(frozen=True)
class IndicatorDef:
    """One observed indicator and the processed column that carries it."""

    code: str
    name: str
    unit: str
    domain: str
    geographic_levels: tuple[str, ...]
    source_file: str
    source_column: str
    has_crop_dimension: bool = False
    description: str = ""
    source_domains: str = ""


DISTRICT = ("district",)
NATIONAL = ("national",)

_FACTORS = "district_productivity_factors.csv"
_IRRIGATION = "irrigation_water.csv"
_EROSION = "erosion_control.csv"
_POSTHARVEST = "crop_postharvest_use.csv"
_NATIONAL_INPUTS = "national_input_trends.csv"


def _pct_farmers(code: str, name: str, source_file: str, column: str, *, description: str = "") -> IndicatorDef:
    return IndicatorDef(
        code=code,
        name=name,
        unit="percent_farmers",
        domain="practices",
        geographic_levels=DISTRICT,
        source_file=source_file,
        source_column=column,
        description=description,
    )


# --- district practice / input adoption -------------------------------------
_PRACTICE_INDICATORS: tuple[IndicatorDef, ...] = (
    _pct_farmers(
        "improved_seed_farmers_pct",
        "Farmers using improved seed",
        _FACTORS,
        "improved_seed_farmers_pct",
        description="Share of surveyed farmers reporting use of improved seed.",
    ),
    _pct_farmers(
        "organic_fertilizer_farmers_pct",
        "Farmers using organic fertilizer",
        _FACTORS,
        "organic_fertilizer_farmers_pct",
    ),
    _pct_farmers(
        "inorganic_fertilizer_farmers_pct",
        "Farmers using inorganic fertilizer",
        _FACTORS,
        "inorganic_fertilizer_farmers_pct",
    ),
    _pct_farmers("pesticide_farmers_pct", "Farmers using pesticides", _FACTORS, "pesticide_farmers_pct"),
    _pct_farmers(
        "erosion_protection_farmers_pct",
        "Farmers applying erosion protection",
        _FACTORS,
        "erosion_protection_farmers_pct",
    ),
    _pct_farmers(
        "mechanization_farmers_pct",
        "Farmers using mechanization",
        _FACTORS,
        "mechanization_farmers_pct",
    ),
    _pct_farmers(
        "irrigation_farmers_pct",
        "Farmers reporting irrigation",
        _FACTORS,
        "irrigation_farmers_pct",
    ),
    _pct_farmers("agroforestry_farmers_pct", "Farmers practising agroforestry", _FACTORS, "agroforestry_farmers_pct"),
)


# --- land use and areas -----------------------------------------------------
_LAND_INDICATORS: tuple[IndicatorDef, ...] = (
    IndicatorDef(
        "total_land_000ha",
        "Total land area",
        "thousand_hectare",
        "land_use",
        DISTRICT,
        _FACTORS,
        "total_land_000ha",
    ),
    IndicatorDef(
        "agricultural_land_000ha",
        "Agricultural land area",
        "thousand_hectare",
        "land_use",
        DISTRICT,
        _FACTORS,
        "agricultural_land_000ha",
    ),
    IndicatorDef(
        "agricultural_land_pct",
        "Agricultural land share of total land",
        "percent_land",
        "land_use",
        DISTRICT,
        _FACTORS,
        "agricultural_land_pct",
    ),
    IndicatorDef(
        "agroforestry_area_ha",
        "Area under agroforestry",
        "hectare",
        "land_use",
        DISTRICT,
        _FACTORS,
        "agroforestry_area_ha",
    ),
    IndicatorDef(
        "inorganic_fertilizer_area_ha",
        "Area treated with inorganic fertilizer",
        "hectare",
        "inputs",
        DISTRICT,
        _FACTORS,
        "inorganic_fertilizer_area_ha",
    ),
    IndicatorDef(
        "organic_fertilizer_area_ha",
        "Area treated with organic fertilizer",
        "hectare",
        "inputs",
        DISTRICT,
        _FACTORS,
        "organic_fertilizer_area_ha",
    ),
)

# --- irrigation -------------------------------------------------------------
_IRRIGATION_UNIT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("surface_irrigation_pct", "Area under surface irrigation"),
    ("flood_irrigation_pct", "Area under flood irrigation"),
    ("drip_irrigation_pct", "Area under drip irrigation"),
    ("sprinkler_irrigation_pct", "Area under sprinkler irrigation"),
    ("pivot_irrigation_pct", "Area under pivot irrigation"),
    ("traditional_irrigation_pct", "Area under traditional irrigation"),
)

_WATER_SOURCE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("rainwater_source_pct", "Irrigated area sourced from rainwater"),
    ("water_treatment_source_pct", "Irrigated area sourced from treated water"),
    ("underground_source_pct", "Irrigated area sourced from underground water"),
    ("lake_stream_source_pct", "Irrigated area sourced from lakes and streams"),
    ("water_catchment_source_pct", "Irrigated area sourced from water catchments"),
)

_IRRIGATION_INDICATORS: tuple[IndicatorDef, ...] = (
    IndicatorDef(
        "modern_irrigated_area_ha",
        "Modern irrigated area",
        "hectare",
        "irrigation",
        DISTRICT,
        _FACTORS,
        "modern_irrigated_area_ha",
    ),
    *(
        IndicatorDef(code, name, "percent_area", "irrigation", DISTRICT, _IRRIGATION, code)
        for code, name in _IRRIGATION_UNIT_COLUMNS
    ),
    *(
        IndicatorDef(code, name, "percent_area", "irrigation", DISTRICT, _IRRIGATION, code)
        for code, name in _WATER_SOURCE_COLUMNS
    ),
)

# --- erosion ----------------------------------------------------------------
_EROSION_PRACTICE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("ditches_pct", "Area protected by ditches"),
    ("trees_windbreak_pct", "Area protected by trees and windbreaks"),
    ("bench_terraces_pct", "Area protected by bench terraces"),
    ("progressive_terraces_pct", "Area protected by progressive terraces"),
    ("cover_plants_pct", "Area protected by cover plants"),
    ("water_drainage_pct", "Area with water drainage works"),
    ("mulching_pct", "Area protected by mulching"),
    ("beds_ridges_pct", "Area protected by beds and ridges"),
    ("water_channels_pct", "Area protected by water channels"),
)

_EROSION_DEGREE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("erosion_severe_pct", "Area with severe erosion"),
    ("erosion_moderate_pct", "Area with moderate erosion"),
    ("erosion_low_pct", "Area with low erosion"),
    ("erosion_very_low_pct", "Area with very low erosion"),
)

_EROSION_INDICATORS: tuple[IndicatorDef, ...] = (
    IndicatorDef(
        "erosion_control_area_ha",
        "Area under erosion control",
        "hectare",
        "erosion",
        DISTRICT,
        _FACTORS,
        "erosion_control_area_ha",
    ),
    *(
        IndicatorDef(code, name, "percent_area", "erosion", DISTRICT, _EROSION, code)
        for code, name in _EROSION_PRACTICE_COLUMNS
    ),
    *(
        IndicatorDef(code, name, "percent_area", "erosion", DISTRICT, _EROSION, code)
        for code, name in _EROSION_DEGREE_COLUMNS
    ),
)

# --- post-harvest use of production (national, crop dimension) --------------
_USE_OF_PRODUCTION_COLUMNS: tuple[tuple[str, str], ...] = (
    ("sold_pct", "Share of production sold"),
    ("own_consumption_pct", "Share of production consumed by the household"),
    ("hired_labour_wages_pct", "Share used to pay hired labour"),
    ("farm_rent_pct", "Share used to pay farm rent"),
    ("gift_pct", "Share given away"),
    ("barter_pct", "Share bartered"),
    ("seeds_pct", "Share retained as seed"),
    ("fodder_pct", "Share used as fodder"),
    ("stored_pct", "Share stored"),
    ("post_harvest_losses_pct", "Share lost post-harvest"),
    ("other_usage_pct", "Share used otherwise"),
)

_POSTHARVEST_INDICATORS: tuple[IndicatorDef, ...] = tuple(
    IndicatorDef(
        code,
        name,
        "percent_production",
        "postharvest",
        NATIONAL,
        _POSTHARVEST,
        code,
        has_crop_dimension=True,
    )
    for code, name in _USE_OF_PRODUCTION_COLUMNS
)

# --- national practice trends (no district dimension) ----------------------
_NATIONAL_TREND_COLUMNS: tuple[tuple[str, str], ...] = (
    ("improved_seed_pct", "Improved seed use (national)"),
    ("organic_fertilizer_pct", "Organic fertilizer use (national)"),
    ("inorganic_fertilizer_pct", "Inorganic fertilizer use (national)"),
    ("pesticide_pct", "Pesticide use (national)"),
    ("irrigation_pct", "Irrigation use (national)"),
    ("anti_erosion_pct", "Anti-erosion practice use (national)"),
    ("agroforestry_pct", "Agroforestry use (national)"),
    ("mechanization_pct", "Mechanization use (national)"),
)

_NATIONAL_INDICATORS: tuple[IndicatorDef, ...] = tuple(
    IndicatorDef(
        code,
        name,
        "percent_farmers",
        "practices",
        NATIONAL,
        _NATIONAL_INPUTS,
        code,
        description=(
            "National practice adoption. Published at national level only — it must "
            "never be rendered as a district figure."
        ),
    )
    for code, name in _NATIONAL_TREND_COLUMNS
)


INDICATORS: tuple[IndicatorDef, ...] = (
    *_PRACTICE_INDICATORS,
    *_LAND_INDICATORS,
    *_IRRIGATION_INDICATORS,
    *_EROSION_INDICATORS,
    *_POSTHARVEST_INDICATORS,
    *_NATIONAL_INDICATORS,
)

INDICATORS_BY_CODE: dict[str, IndicatorDef] = {item.code: item for item in INDICATORS}
UNITS_BY_CODE: dict[str, UnitDef] = {item.code: item for item in UNITS}

# Domains in the order they should be presented to a reader.
DOMAIN_ORDER: tuple[str, ...] = (
    "practices",
    "inputs",
    "land_use",
    "irrigation",
    "erosion",
    "postharvest",
)


# --- sources -------------------------------------------------------------


@dataclass(frozen=True)
class SourceDef:
    """One data source, and how to look up its curated registry entry.

    ``registry_name`` names a row in ``data/source_registry/data_sources.csv``.
    The loader reads the URL, access terms and redistribution note from that
    curated file instead of this module carrying a copy, so a URL is never
    retyped (and never drifts) and a source with no curated entry keeps a null
    URL rather than a guessed one.
    """

    source_id: str
    owner: str
    dataset_name: str
    registry_name: str | None
    access_type: str
    is_official: bool = True


SOURCES: tuple[SourceDef, ...] = (
    SourceDef(
        "NISR_SAS_2024_ANNUAL",
        "NISR",
        "NISR SAS 2024 Annual Tables",
        "NISR SAS 2024 Microdata",
        "public page + downloadable Excel/PDF",
    ),
    SourceDef(
        "NISR_SAS_2025_ANNUAL",
        "NISR",
        "NISR SAS 2025 Annual Tables",
        "NISR SAS 2025 Annual",
        "public page + downloadable Excel/PDF",
    ),
    SourceDef(
        "NISR_SAS_2026A",
        "NISR",
        "NISR SAS 2026 Season A",
        "NISR SAS 2026 Season A",
        "public page + downloadable Excel/PDF",
    ),
    SourceDef(
        "NISR_SAS_2026B",
        "NISR",
        "NISR SAS 2026 Season B",
        "NISR SAS 2026 Season B",
        "public page + downloadable Excel/PDF",
    ),
    # The district practice/erosion/water/post-harvest tables were extracted from
    # the 2025 Season B release; they share the 2025 annual registry entry.
    SourceDef(
        "NISR_SAS_2025B_DISTRICT_FACTORS",
        "NISR",
        "NISR SAS 2025 Season B district practice factors",
        "NISR SAS 2025 Annual",
        "public page + downloadable Excel/PDF",
    ),
    SourceDef(
        "NISR_SAS_2025B_IRRIGATION_WATER",
        "NISR",
        "NISR SAS 2025 Season B irrigation and water sources",
        "NISR SAS 2025 Annual",
        "public page + downloadable Excel/PDF",
    ),
    SourceDef(
        "NISR_SAS_2025B_EROSION",
        "NISR",
        "NISR SAS 2025 Season B erosion control",
        "NISR SAS 2025 Annual",
        "public page + downloadable Excel/PDF",
    ),
    SourceDef(
        "NISR_SAS_2025B_POSTHARVEST_USE",
        "NISR",
        "NISR SAS 2025 Season B use of production",
        "NISR SAS 2025 Annual",
        "public page + downloadable Excel/PDF",
    ),
    SourceDef(
        "NISR_SAS_2024_2026_NATIONAL_INPUT_TRENDS",
        "NISR",
        "NISR SAS national practice trends 2024-2026",
        None,
        "derived from published releases",
    ),
    SourceDef(
        "NISR_SAS_2024_2026_NATIONAL_TRENDS",
        "NISR",
        "NISR SAS national crop trends 2024-2026",
        None,
        "derived from published releases",
    ),
    SourceDef(
        "MINAGRI_ACES_COLDCHAIN_2026",
        "MINAGRI",
        "MINAGRI-ACES cold chain context 2026",
        "MINAGRI\u2013ACES cold chain 2026",
        "published programme context",
    ),
    SourceDef(
        "MINAGRI_ACES_COLDCHAIN_2026_NETWORK",
        "MINAGRI",
        "MINAGRI-ACES cold chain network summary 2026",
        "MINAGRI\u2013ACES cold chain 2026",
        "published programme summary",
    ),
    SourceDef(
        "MINAGRI_ANNUAL_REPORT_2024_2025_POSTHARVEST_INFRA",
        "MINAGRI",
        "MINAGRI Annual Report 2024/2025 post-harvest infrastructure",
        "MINAGRI Annual Report 2024/2025 - Post-Harvest Infrastructure Table 15",
        "published annual report",
    ),
)

SOURCES_BY_ID: dict[str, SourceDef] = {item.source_id: item for item in SOURCES}


def source_table_id(source_id: str, sheet: str | None) -> str:
    """Deterministic id for one published table inside one release.

    Stable across runs, which is what makes the upsert idempotent.
    """
    return f"{source_id}::{sheet or 'unnamed'}"


def parse_source_titles(raw: str | None) -> dict[str, str]:
    """Split a ``source_titles_raw`` cell into ``{"Table 13": "<original title>"}``.

    Titles are stored verbatim. Two extracted tables in this repository carry a
    numeric prefix that does not match the table they came from; that anomaly is
    preserved rather than silently normalised, because the pipeline must record
    what the source published, not what a reviewer assumed it meant.
    """
    if not raw or not isinstance(raw, str):
        return {}
    titles: dict[str, str] = {}
    for part in raw.split("|"):
        part = part.strip()
        if not part:
            continue
        head, _, rest = part.partition(":")
        head = head.strip()
        if not head:
            continue
        titles[head] = part
        _ = rest
    return titles


def indicator_codes_for_file(filename: str) -> list[str]:
    """Indicator codes sourced from one processed file, in catalogue order."""
    return [item.code for item in INDICATORS if item.source_file == filename]


def validate_catalogue() -> list[str]:
    """Return a list of catalogue defects (empty means the catalogue is sound).

    Used by the loader before it writes anything, and by the test suite, so a
    typo in a unit code cannot reach the database as a dangling reference.
    """
    problems: list[str] = []
    seen: set[str] = set()
    for item in INDICATORS:
        if item.code in seen:
            problems.append(f"duplicate indicator code: {item.code}")
        seen.add(item.code)
        if item.unit not in UNITS_BY_CODE:
            problems.append(f"{item.code}: unknown unit {item.unit!r}")
        if not item.geographic_levels:
            problems.append(f"{item.code}: no geographic level declared")
        for level in item.geographic_levels:
            if level not in ("district", "province", "national"):
                problems.append(f"{item.code}: invalid geographic level {level!r}")
        if item.domain not in DOMAIN_ORDER:
            problems.append(f"{item.code}: unknown domain {item.domain!r}")
        if item.has_crop_dimension and item.source_column == "":
            problems.append(f"{item.code}: crop-dimension indicator needs a source column")
    return problems
