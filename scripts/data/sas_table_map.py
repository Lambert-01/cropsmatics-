#!/usr/bin/env python3
"""Explicit SAS workbook/sheet -> domain/period mapping (the data contract).

Periods and domains are assigned from **workbook + sheet position**, never from
free-text sheet titles alone. The source titles contain documented anomalies
(e.g. ``Table 60`` of the 2024 annual release says "2023 Season C" although the
table sits in the 2024 A/B/C sequence; ``Table 66`` of the 2025 release is
titled "Season C 2023"). Those titles are preserved verbatim as
``source_title_raw`` while the normalized period comes from the reviewed
mapping here, with ``period_override_reason`` documenting every override.

Structure notes verified against the extraction:

* Productivity tables have one row per district plus ``Total`` / ``Small scale
  farmers (SSF)`` / ``Large scale farmer (LSF)`` rows and a trailing source line.
* Parent crop columns (``Cereals``, ``Tubers and Roots``, ``Bean``, ``Banana``,
  ``Vegetables and Fruits``) duplicate their own subtypes. We ingest parents
  only and skip subtypes to avoid double counting.
* Some district names appear with stray whitespace (``National ``,
  ``Disrtict`` typo in the header) - the parser normalizes and the district
  dictionary is the authority.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TableSpec:
    """One mapped SAS sheet.

    ``release`` is the extraction folder key (see ``common.SAS_RELEASES``),
    ``sheet`` is the exact sheet/table name used in the extraction manifest,
    ``period_code`` is the canonical period the table's rows belong to.
    """

    release: str
    sheet: str
    period_code: str
    domain: str
    metric: str | None = None
    unit: str | None = None
    geography_level: str = "DISTRICT"
    period_override_reason: str | None = None


def _override(reason: str) -> str:
    return reason


# --- productivity (cultivated/harvested area, yield, production) -------------
# 2024/2025 annual workbooks: three parallel metric blocks of three seasons.
# 2026 season workbooks: one metric block each (season releases).
PRODUCTIVITY_TABLES: tuple[TableSpec, ...] = (
    # 2024 annual: cultivated area (10-12), harvested area (13-15),
    # yield (16-18), production (21-23). (19/20 and 22/23 variants for
    # large-scale-only yield are separate tables and are not the all-farmer
    # yield series.)
    TableSpec("SAS_2024_ANNUAL", "Table 10", "2024A", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 11", "2024B", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 12", "2024C", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 13", "2024A", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 14", "2024B", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 15", "2024C", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 16", "2024A", "productivity", "yield", "kg/ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 17", "2024B", "productivity", "yield", "kg/ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 18", "2024C", "productivity", "yield", "kg/ha"),
    TableSpec("SAS_2024_ANNUAL", "Table 21", "2024A", "productivity", "production", "mt"),
    TableSpec("SAS_2024_ANNUAL", "Table 22", "2024B", "productivity", "production", "mt"),
    TableSpec("SAS_2024_ANNUAL", "Table 23", "2024C", "productivity", "production", "mt"),
    # 2025 annual: cultivated (13-15), harvested (16-18), yield (19-21),
    # production (24-26).
    TableSpec("SAS_2025_ANNUAL", "Table 13", "2025A", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 14", "2025B", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 15", "2025C", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 16", "2025A", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 17", "2025B", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 18", "2025C", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 19", "2025A", "productivity", "yield", "kg/ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 20", "2025B", "productivity", "yield", "kg/ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 21", "2025C", "productivity", "yield", "kg/ha"),
    TableSpec("SAS_2025_ANNUAL", "Table 24", "2025A", "productivity", "production", "mt"),
    TableSpec("SAS_2025_ANNUAL", "Table 25", "2025B", "productivity", "production", "mt"),
    TableSpec("SAS_2025_ANNUAL", "Table 26", "2025C", "productivity", "production", "mt"),
    # 2026 Season A: cultivated (11), harvested (12), yield (13), production (15).
    TableSpec("SAS_2026A", "Table 11", "2026A", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2026A", "Table 12", "2026A", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2026A", "Table 13", "2026A", "productivity", "yield", "kg/ha"),
    TableSpec(
        "SAS_2026A",
        "Table 15",
        "2026A",
        "productivity",
        "production",
        "mt",
        period_override_reason=_override(
            "Sheet 15 carries the production block; sheet 14 is the large-scale-only "
            "yield variant, so the all-farmer production table skips to 15."
        ),
    ),
    # 2026 Season B: cultivated (9), harvested (10), yield (11), production (13).
    TableSpec("SAS_2026B", "Table 9", "2026B", "productivity", "cultivated_area", "ha"),
    TableSpec("SAS_2026B", "Table 10", "2026B", "productivity", "harvested_area", "ha"),
    TableSpec("SAS_2026B", "Table 11", "2026B", "productivity", "yield", "kg/ha"),
    TableSpec(
        "SAS_2026B",
        "Table 13",
        "2026B",
        "productivity",
        "production",
        "mt",
        period_override_reason=_override(
            "Sheet 13 carries the production block; sheet 12 is the large-scale-only "
            "yield variant."
        ),
    ),
)

# --- production use / post-harvest (crop-level national shares) --------------
POSTHARVEST_TABLES: tuple[TableSpec, ...] = (
    TableSpec("SAS_2024_ANNUAL", "Table 24", "2024A", "postharvest", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 25", "2024B", "postharvest", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 26", "2024C", "postharvest", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 27", "2025A", "postharvest", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 28", "2025B", "postharvest", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 29", "2025C", "postharvest", unit="percent"),
    TableSpec("SAS_2026A", "Table 16", "2026A", "postharvest", unit="percent"),
    TableSpec("SAS_2026B", "Table 14", "2026B", "postharvest", unit="percent"),
)

# --- district agricultural practice percentages ------------------------------
# improved_seed / organic_fertilizer / inorganic_fertilizer / pesticide use
# ("by farmer type per district"), plus the multi-practice table.
PRACTICE_TABLES: tuple[TableSpec, ...] = (
    # Seed use (farmers using improved seeds) - 2024 names the family "Use of
    # seeds", 2025 identical, 2026 "Seed type by crops" is crop-level and not
    # district, so 2026 district seed use comes from the practice table.
    TableSpec("SAS_2024_ANNUAL", "Table 30", "2024A", "practice", "improved_seed_use", "percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 31", "2024B", "practice", "improved_seed_use", "percent"),
    TableSpec(
        "SAS_2024_ANNUAL",
        "Table 32",
        "2024C",
        "practice",
        "improved_seed_use",
        "percent",
        period_override_reason=_override(
            "Season C table sits after the A/B pair; title omitted the season."
        ),
    ),
    TableSpec("SAS_2025_ANNUAL", "Table 33", "2025A", "practice", "improved_seed_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 34", "2025B", "practice", "improved_seed_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 35", "2025C", "practice", "improved_seed_use", "percent"),
    # Organic fertilizer use.
    TableSpec("SAS_2024_ANNUAL", "Table 40", "2024A", "practice", "organic_fertilizer_use", "percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 41", "2024B", "practice", "organic_fertilizer_use", "percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 42", "2024C", "practice", "organic_fertilizer_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 43", "2025A", "practice", "organic_fertilizer_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 44", "2025B", "practice", "organic_fertilizer_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 45", "2025C", "practice", "organic_fertilizer_use", "percent"),
    TableSpec("SAS_2026A", "Table 24", "2026A", "practice", "organic_fertilizer_use", "percent"),
    TableSpec("SAS_2026B", "Table 22", "2026B", "practice", "organic_fertilizer_use", "percent"),
    # Inorganic fertilizer use.
    TableSpec("SAS_2024_ANNUAL", "Table 43", "2024A", "practice", "inorganic_fertilizer_use", "percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 44", "2024B", "practice", "inorganic_fertilizer_use", "percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 45", "2024C", "practice", "inorganic_fertilizer_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 46", "2025A", "practice", "inorganic_fertilizer_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 47", "2025B", "practice", "inorganic_fertilizer_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 48", "2025C", "practice", "inorganic_fertilizer_use", "percent"),
    TableSpec("SAS_2026A", "Table 25", "2026A", "practice", "inorganic_fertilizer_use", "percent"),
    TableSpec("SAS_2026B", "Table 23", "2026B", "practice", "inorganic_fertilizer_use", "percent"),
    # Pesticide use. 2024 Table 60's title says "2023 Season C" - documented
    # override: it sits in the 2024 annual A/B/C pesticide sequence.
    TableSpec("SAS_2024_ANNUAL", "Table 55", "2024A", "practice", "pesticide_use", "percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 56", "2024B", "practice", "pesticide_use", "percent"),
    TableSpec(
        "SAS_2024_ANNUAL",
        "Table 57",
        "2024C",
        "practice",
        "pesticide_use",
        "percent",
    ),
    TableSpec("SAS_2025_ANNUAL", "Table 58", "2025A", "practice", "pesticide_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 59", "2025B", "practice", "pesticide_use", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 60", "2025C", "practice", "pesticide_use", "percent"),
    TableSpec("SAS_2026A", "Table 29", "2026A", "practice", "pesticide_use", "percent"),
    TableSpec("SAS_2026B", "Table 27", "2026B", "practice", "pesticide_use", "percent"),
    # Agricultural practices (erosion protection, mechanization, irrigation,
    # agroforestry). 2024/2025 Table 63/66 titles say "Season C 2023" -
    # documented override: same annual A/B/C sequence.
    TableSpec("SAS_2024_ANNUAL", "Table 61", "2024A", "practice", "agricultural_practices", "percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 62", "2024B", "practice", "agricultural_practices", "percent"),
    TableSpec(
        "SAS_2024_ANNUAL",
        "Table 63",
        "2024C",
        "practice",
        "agricultural_practices",
        "percent",
        period_override_reason=_override(
            "Sheet title says 'Season C 2023'; the 2024 annual A/B/C sequence and "
            "the Season C column layout identify it as the 2024C counterpart."
        ),
    ),
    TableSpec("SAS_2025_ANNUAL", "Table 64", "2025A", "practice", "agricultural_practices", "percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 65", "2025B", "practice", "agricultural_practices", "percent"),
    TableSpec(
        "SAS_2025_ANNUAL",
        "Table 66",
        "2025C",
        "practice",
        "agricultural_practices",
        "percent",
        period_override_reason=_override(
            "Sheet title says 'Season C 2023'; 2025 annual A/B/C sequence."
        ),
    ),
    TableSpec("SAS_2026A", "Table 31", "2026A", "practice", "agricultural_practices", "percent"),
    TableSpec("SAS_2026B", "Table 29", "2026B", "practice", "agricultural_practices", "percent"),
)

# --- irrigation technique mix (district percentages) --------------------------
IRRIGATION_TABLES: tuple[TableSpec, ...] = (
    TableSpec("SAS_2024_ANNUAL", "Table 64", "2024A", "irrigation", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 65", "2024B", "irrigation", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 66", "2024C", "irrigation", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 67", "2025A", "irrigation", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 68", "2025B", "irrigation", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 69", "2025C", "irrigation", unit="percent"),
    TableSpec("SAS_2026A", "Table 32", "2026A", "irrigation", unit="percent"),
    TableSpec("SAS_2026B", "Table 30", "2026B", "irrigation", unit="percent"),
)

# --- water source mix (district percentages) ----------------------------------
WATER_SOURCE_TABLES: tuple[TableSpec, ...] = (
    TableSpec("SAS_2024_ANNUAL", "Table 67", "2024A", "water_source", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 68", "2024B", "water_source", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 69", "2024C", "water_source", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 70", "2025A", "water_source", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 71", "2025B", "water_source", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 72", "2025C", "water_source", unit="percent"),
    TableSpec("SAS_2026A", "Table 33", "2026A", "water_source", unit="percent"),
    TableSpec("SAS_2026B", "Table 31", "2026B", "water_source", unit="percent"),
)

# --- anti-erosion activities (district percentages, multi-response) ----------
EROSION_CONTROL_TABLES: tuple[TableSpec, ...] = (
    TableSpec("SAS_2024_ANNUAL", "Table 70", "2024A", "erosion_control", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 71", "2024B", "erosion_control", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 72", "2024C", "erosion_control", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 73", "2025A", "erosion_control", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 74", "2025B", "erosion_control", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 75", "2025C", "erosion_control", unit="percent"),
    TableSpec("SAS_2026A", "Table 34", "2026A", "erosion_control", unit="percent"),
    TableSpec("SAS_2026B", "Table 32", "2026B", "erosion_control", unit="percent"),
)

# --- erosion severity (degree of erosion per district) ------------------------
EROSION_SEVERITY_TABLES: tuple[TableSpec, ...] = (
    TableSpec("SAS_2024_ANNUAL", "Table 73", "2024A", "erosion_severity", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 74", "2024B", "erosion_severity", unit="percent"),
    TableSpec("SAS_2024_ANNUAL", "Table 75", "2024C", "erosion_severity", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 76", "2025A", "erosion_severity", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 77", "2025B", "erosion_severity", unit="percent"),
    TableSpec("SAS_2025_ANNUAL", "Table 78", "2025C", "erosion_severity", unit="percent"),
    TableSpec("SAS_2026A", "Table 35", "2026A", "erosion_severity", unit="percent"),
    TableSpec("SAS_2026B", "Table 33", "2026B", "erosion_severity", unit="percent"),
)

# Every mapped table, for uniqueness/coverage validation.
ALL_TABLES: tuple[TableSpec, ...] = (
    *PRODUCTIVITY_TABLES,
    *POSTHARVEST_TABLES,
    *PRACTICE_TABLES,
    *IRRIGATION_TABLES,
    *WATER_SOURCE_TABLES,
    *EROSION_CONTROL_TABLES,
    *EROSION_SEVERITY_TABLES,
)

DOMAINS: tuple[str, ...] = (
    "productivity",
    "postharvest",
    "practice",
    "irrigation",
    "water_source",
    "erosion_control",
    "erosion_severity",
)

METRICS_BY_DOMAIN: dict[str, tuple[str, ...]] = {
    "irrigation": (
        "surface_irrigation_pct",
        "flood_irrigation_pct",
        "drip_irrigation_pct",
        "sprinkler_irrigation_pct",
        "pivot_irrigation_pct",
        "traditional_irrigation_pct",
    ),
    "water_source": (
        "rainwater_source_pct",
        "water_treatment_source_pct",
        "underground_source_pct",
        "lake_stream_source_pct",
        "water_catchment_source_pct",
    ),
    "erosion_control": (
        "ditches_pct",
        "trees_windbreak_pct",
        "bench_terraces_pct",
        "progressive_terraces_pct",
        "cover_plants_pct",
        "water_drainage_pct",
        "mulching_pct",
        "beds_ridges_pct",
        "water_channels_pct",
        "others_pct",
    ),
    "erosion_severity": (
        "erosion_severe_pct",
        "erosion_moderate_pct",
        "erosion_low_pct",
        "erosion_very_low_pct",
    ),
    "postharvest": (
        "sold_pct",
        "own_consumption_pct",
        "hired_labour_wages_pct",
        "farm_rent_pct",
        "gift_pct",
        "barter_pct",
        "seeds_pct",
        "fodder_pct",
        "stored_pct",
        "post_harvest_losses_pct",
        "other_usage_pct",
    ),
}


def tables_for(domain: str | None = None, release: str | None = None) -> list[TableSpec]:
    """Filtered view of the mapping (used by parsers and tests)."""
    out = list(ALL_TABLES)
    if domain is not None:
        out = [t for t in out if t.domain == domain]
    if release is not None:
        out = [t for t in out if t.release == release]
    return out


def get_spec(release: str, sheet: str) -> TableSpec | None:
    for spec in ALL_TABLES:
        if spec.release == release and spec.sheet == sheet:
            return spec
    return None


def check_mapping() -> list[str]:
    """Contract checks: uniqueness and required coverage.

    Returns a list of human-readable problems (empty means the map is valid).
    """
    problems: list[str] = []

    # Uniqueness of (release, sheet, domain, metric).
    seen: dict[tuple, TableSpec] = {}
    for spec in ALL_TABLES:
        key = (spec.release, spec.sheet, spec.domain, spec.metric)
        if key in seen:
            problems.append(
                f"duplicate mapping key {key}: {seen[key].sheet} and {spec.sheet}"
            )
        seen[key] = spec

    # Every (release, sheet) pair must be unique per domain as well - two
    # domains may share a sheet only if one of them is explicitly split, which
    # the current contract never does.
    sheet_seen: dict[tuple, TableSpec] = {}
    for spec in ALL_TABLES:
        key = (spec.release, spec.sheet)
        if key in sheet_seen:
            problems.append(f"sheet {key} mapped more than once: {spec.domain}")
        sheet_seen[key] = spec

    # Productivity coverage: all four metrics for all eight periods.
    expected_metrics = {"cultivated_area", "harvested_area", "yield", "production"}
    for period in ("2024A", "2024B", "2024C", "2025A", "2025B", "2025C", "2026A", "2026B"):
        have = {
            s.metric for s in PRODUCTIVITY_TABLES if s.period_code == period
        }
        missing = expected_metrics - have
        if missing:
            problems.append(f"period {period} missing productivity metrics: {sorted(missing)}")

    # Periods must all be canonical.
    from scripts.data.common import VALID_PERIODS

    for spec in ALL_TABLES:
        if spec.period_code not in VALID_PERIODS:
            problems.append(f"non-canonical period {spec.period_code} on {spec.release}/{spec.sheet}")

    return problems


if __name__ == "__main__":
    issues = check_mapping()
    if issues:
        print("MAPPING PROBLEMS:")
        for problem in issues:
            print(f"  - {problem}")
        raise SystemExit(1)
    print(f"OK: {len(ALL_TABLES)} mapped tables across {len(DOMAINS)} domains")
