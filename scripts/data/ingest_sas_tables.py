#!/usr/bin/env python3
"""Ingest mapped SAS tables into long-format interim datasets.

Reads every mapped table (see ``sas_table_map``) from the extraction CSVs and
converts the published wide layouts into normalized long frames:

* ``sas_productivity_long.csv``   one row per period x district x crop x metric
* ``sas_practices_long.csv``      one row per period x district x indicator
                                  (with SSF/LSF scopes where published)
* ``sas_irrigation_water_long.csv`` technique mix + water source by district
* ``sas_erosion_long.csv``        control techniques + severity bands
* ``sas_postharvest_long.csv``    production use shares by crop x period

Nothing is imputed: blank cells (including the workbook's ``-`` marker) stay
null, and district rows that NISR left blank stay blank. Aggregate rows
(``Total``, ``National``, SSF, LSF) are captured - with an explicit ``row_scope``
and ``row_scope_raw`` - rather than being silently dropped, and district rows are
identified strictly against the district dictionary. ``Total`` and ``National``
both mean the national aggregate and are normalized to ``total``.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass

import pandas as pd

from scripts.data import sas_table_map as tmap
from scripts.data.common import (
    DICTS_DIR,
    INTERIM_DIR,
    SAS_SOURCE_IDS,
    log,
    split_period,
)
from scripts.data.io_sas import read_table

# Rows that are not districts in the district-keyed tables.
_NON_DISTRICT_ROWS = {"total", "small scale farmers (ssf)", "large scale farmer (lsf)", "national"}

# The annual 2022 workbook labels its published aggregate rows in several
# period-bearing forms (for example ``National 2022 A`` and ``National Level
# 2022``). They are still national totals, but the year-bearing variants also
# include the previous-year comparison row. Matching the requested period here
# prevents that comparison row from being loaded as a duplicate aggregate.
_NATIONAL_PERIOD_LABEL = re.compile(
    r"^national(?:\s+level)?(?:\s+(\d{4})(?:\s+([abc]))?)?$",
    re.IGNORECASE,
)

# Crop columns that double-count their children (kept OUT of the canonical
# panel; the aggregates live only in the national trends dataset).
_AGGREGATE_CROPS = {
    "cereals",
    "tubers and roots",
    "legumes and pulses",
    "vegetables and fruits",
    "total developed land",
    "developed land",
    # 2022 Table 14 prints the aggregate column as "Developped land" (source
    # spelling). It is a land aggregate, not a crop, so it must never enter the
    # crop panel.
    "developped land",
    "total",
}
# Child crop columns dropped because their parent level is kept instead
# (parent Banana = cooking + dessert + beer; parent Bean = bush + climbing + pea).
_SUBTYPE_CROPS = {
    "cooking banana",
    "dessert banana",
    "banana for beer",
    "bush bean",
    "climbing bean",
    "pea",
    "peas",
}

# Workbook crop label (normalized) -> canonical dictionary crop name. This is
# the level the canonical crop dictionary and the legacy 2025B pack use:
# cereal/tuber subtypes individually, banana and bean at parent level.
_CROP_CANONICAL = {
    "maize": "Maize",
    "sorghum": "Sorghum",
    "paddy rice": "Paddy rice",
    "wheat": "Wheat",
    "other cereals": "Other cereals",
    "cassava": "Cassava",
    "sweet potato": "Sweet potato",
    "sweet potatoes": "Sweet potato",
    "irish potato": "Irish potato",
    "irish potatoes": "Irish potato",
    "yams & taro": "Yams & Taro",
    "yam & taro": "Yams & Taro",
    # Published label variants across releases, kept verbatim as source:
    #   2022 Table 12  "Taro & Yams"   (word order)
    #   2023 Table 13  "Yarms & Taro"  (source typo, verified in the workbook)
    #   2022/2023      "Ground nuts"   (two words)
    "taro & yams": "Yams & Taro",
    "yarms & taro": "Yams & Taro",
    "ground nuts": "Groundnut",
    "banana": "Banana",
    "bananas": "Banana",
    "bean": "Beans",
    "beans": "Beans",
    "groundnut": "Groundnut",
    "groundnuts": "Groundnut",
    "soybean": "Soybean",
    "soybeans": "Soybean",
    "soya beans": "Soybean",
    "vegetables": "Vegetables",
    "fruits": "Fruits",
    "fodder crops": "Fodder crops",
    "other crops": "Other crops",
}

MISSING_MARKERS = {"", "-", "–", "—"}


def _clean(value: object) -> str:
    return str(value).replace("\u00a0", " ").strip()


def _clean_label(value: object) -> str:
    """Column/row label normalization: collapse internal whitespace."""
    return " ".join(_clean(value).split())


def _aggregate_scope(label: str, period_code: str | None) -> str | None:
    """Return an aggregate row scope when ``label`` names this release.

    NISR uses ``Total``/``National`` for current aggregates, while the 2022
    annual tables use labels such as ``National 2022 A`` and
    ``National Level 2022`` followed by a prior-year comparison. The latter
    must be period-aware: loading both would create duplicate keys and would
    mix the comparison row into the current release.
    """
    lowered = label.lower()
    if lowered in _NON_DISTRICT_ROWS:
        return {
            "total": "total",
            "national": "total",
            "small scale farmers (ssf)": "ssf",
            "large scale farmer (lsf)": "lsf",
        }[lowered]

    match = _NATIONAL_PERIOD_LABEL.fullmatch(label)
    if not match:
        return None
    year_text, season = match.groups()
    if year_text and period_code:
        target_year, target_season = split_period(period_code)
        if int(year_text) != target_year:
            return None
        if season and season.upper() != target_season:
            return None
    elif year_text:
        # A caller without a target period cannot safely distinguish the
        # current aggregate from a previous-year comparison row.
        return None
    return "total"


def _num(value: object) -> float | None:
    text = _clean(value)
    if text.lower() in MISSING_MARKERS:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def _season_from_title(title: str) -> str | None:
    """Best-effort season token from a raw title (used only for QA warnings)."""
    lowered = title.lower()
    for season in ("season a", "season b", "season c"):
        if season in lowered:
            return season[-1].upper()
    # "Season A 2024" / "Season B 2026" style appears reversed in some titles.
    for token in ("a", "b", "c"):
        if lowered.startswith(f"season {token} "):
            return token.upper()
    return None


def _read_grid(spec) -> tuple[pd.DataFrame, str]:
    """Read a mapped table into a cleaned grid (values untouched, labels clean)."""
    raw, kind = read_table(spec)
    grid = raw.copy()
    # Normalize the label columns (index 0/1) but keep value cells as-is.
    return grid, kind


# Row labels that name the row dimension of a published table.
_HEADER_LABEL_TOKENS = (
    "district",
    "disrtict",  # the 2024 workbook's own typo, kept verbatim
    "crops",
    "crop",
    "fertilizer name",
)
_HEADER_SCAN_ROWS = 12


@dataclass(frozen=True)
class _Layout:
    """Where one published table keeps its row labels and column labels.

    NISR is not internally consistent across releases, so the layout is
    resolved per sheet instead of assuming a fixed shape:

    * most sheets put the row label in column 1 and the column labels on the
      same row (2024-2026 annual releases);
    * some 2022 Season C sheets indent every label into column 2, leaving
      column 1 empty (``SAS 2022 / Table 13``);
    * the 2023 production sheets stack the crop labels *above* the
      ``District`` row (``SAS 2023 / Table 22``: crops on row 3, district
      label on row 4);
    * practice sheets keep the district label row and print the indicator
      names one row above it.

    ``label_col`` is the column holding row labels, ``header_idx`` is the row
    naming the rows, and ``crop_row`` is the row holding the column labels - the
    same row as ``header_idx`` unless the published sheet stacked them.
    """

    label_col: int
    header_idx: int
    crop_row: int


def _looks_like_label(text: object) -> bool:
    return _clean_label(text).lower().startswith(_HEADER_LABEL_TOKENS)


def _resolve_layout(grid: pd.DataFrame, max_scan: int = _HEADER_SCAN_ROWS) -> _Layout:
    """Find the label column, the header row and the column-label row.

    The district-name row check runs before the token check on each row so a
    table whose label cell is blank (erosion-severity) or whose label sits in an
    indented column (2022 Season C) still resolves.
    """
    probe_cols = range(min(4, grid.shape[1]))
    for i in range(min(max_scan, len(grid))):
        if i + 1 < len(grid):
            for col in probe_cols:
                below = _clean_label(grid.iat[i + 1, col]).lower()
                if below in _DISTRICT_LOWER_NAMES:
                    return _finish_layout(grid, i, col)
        for col in probe_cols:
            if _looks_like_label(grid.iat[i, col]):
                return _finish_layout(grid, i, col)
        # Erosion-severity sheets leave the label cell empty and start the band
        # names in column 2.
        if grid.shape[1] > 2 and not _clean_label(grid.iat[i, 1]):
            second = _clean_label(grid.iat[i, 2]).lower()
            if second.startswith(("severe", "moderate", "ditches")):
                return _finish_layout(grid, i, 1)
    raise ValueError(f"no header row found in first {max_scan} rows")


def _finish_layout(grid: pd.DataFrame, header_idx: int, label_col: int) -> _Layout:
    crop_row = header_idx
    if not _crop_cells(grid, header_idx, label_col) and header_idx >= 1:
        if _crop_cells(grid, header_idx - 1, label_col):
            crop_row = header_idx - 1
    return _Layout(label_col=label_col, header_idx=header_idx, crop_row=crop_row)


_DISTRICT_LOWER_NAMES: frozenset[str] = frozenset()


def _crop_cells(grid: pd.DataFrame, row: int, label_col: int) -> dict[int, str]:
    """Canonical crops named on one candidate header row (may be empty)."""
    out: dict[int, str] = {}
    for col in range(label_col + 1, grid.shape[1]):
        label = _clean_label(grid.iat[row, col]).lower()
        if not label or label in _AGGREGATE_CROPS or label in _SUBTYPE_CROPS:
            continue
        canonical = _CROP_CANONICAL.get(label)
        if canonical is None:
            # Unknown label: drop it here; the validator reports unmapped crops
            # as a data-quality error so nothing silently disappears.
            continue
        out[col] = canonical
    return out


def _crop_columns(grid: pd.DataFrame, layout: _Layout) -> dict[int, str]:
    """Map column index -> canonical crop name for crop-keyed tables.

    Keeps exactly the dictionary-level crops (skipping aggregates that would
    double-count their own components and banana/bean subtypes whose parent is
    kept) so the panel matches the canonical crop dimension.
    """
    return _crop_cells(grid, layout.crop_row, layout.label_col)


def _find_title(grid: pd.DataFrame, layout: _Layout) -> str:
    """Nearest non-empty label-column cell above the header (the table title).

    Some sheets (Season C mini tables) carry blank rows above the title, so a
    fixed row index cannot be used. Scans the label column *and* column 1 so a
    2022 Season C sheet - whose title sits in column 1 while its data labels are
    indented into column 2 - still reports its printed title.
    """
    for i in range(layout.header_idx - 1, -1, -1):
        text = _clean_label(grid.iat[i, layout.label_col]) if grid.shape[1] > layout.label_col else ""
        if not text and layout.label_col != 1 and grid.shape[1] > 1:
            text = _clean_label(grid.iat[i, 1])
        if text:
            return text
    return ""


def _district_lookup(districts: pd.DataFrame) -> dict[str, str]:
    """lower-cased district name -> official name."""
    lookup = {
        _clean_label(name).lower(): _clean_label(name) for name in districts["district"]
    }
    # Keep the header scanner in sync (module-level set, populated lazily).
    global _DISTRICT_LOWER_NAMES
    _DISTRICT_LOWER_NAMES = frozenset(lookup)
    return lookup


def _iter_district_rows(
    grid: pd.DataFrame,
    layout: _Layout,
    known_lower: dict[str, str],
    period_code: str | None = None,
) -> tuple[list[tuple[int, str, str]], str]:
    """Yield ``(row_index, raw_label, scope)`` for rows below the header.

    ``scope`` is ``district`` when the label matches the dictionary (case/
    whitespace-insensitive), otherwise ``total``, ``ssf`` or ``lsf``.

    NISR labels the national total row ``Total`` on most sheets and ``National``
    on the production sheets. Both are the same national aggregate, and a
    published metric never appears under both labels for the same
    period/crop - so both map to ``total``, and the printed label is preserved
    separately as ``row_scope_raw``. Without this, the national row of a period
    would be split across two half-empty rows in the panel.
    """
    rows: list[tuple[int, str, str]] = []
    source_title = ""
    for i in range(layout.header_idx + 1, len(grid)):
        label = (
            _clean_label(grid.iat[i, layout.label_col])
            if grid.shape[1] > layout.label_col
            else ""
        )
        if not label:
            continue
        lowered = label.lower()
        if lowered.startswith("source:"):
            source_title = label
            break
        scope = _aggregate_scope(label, period_code)
        if scope:
            rows.append((i, label, scope))
            continue
        if lowered in known_lower:
            rows.append((i, label, "district"))
    return rows, source_title


def _source_id(release: str) -> str:
    return SAS_SOURCE_IDS[release]


def _source_row(
    spec, year: int, season: str, district: str | None, scope: str, indicator: str,
    value: float | None, kind: str, title: str, row_idx: int, raw_label: str = "",
) -> dict:
    """One lineage-complete long row (district-keyed tables)."""
    return {
        "period_code": spec.period_code,
        "year": year,
        "season": season,
        "district": district,
        "row_scope": scope,
        "row_scope_raw": raw_label or scope,
        "indicator_code": indicator,
        "value": value,
        "unit": "percent",
        "source_id": _source_id(spec.release),
        "source_release": spec.release,
        "source_sheet": spec.sheet,
        "source_title_raw": title,
        "source_row": row_idx + 1,
        "source_kind": kind,
        "period_override_reason": spec.period_override_reason,
    }


def parse_productivity(districts: pd.DataFrame) -> pd.DataFrame:
    """All four productivity metrics, all periods, as one long frame."""
    known = _district_lookup(districts)
    rows_out: list[dict] = []
    for spec in tmap.PRODUCTIVITY_TABLES:
        grid, kind = read_table(spec)
        layout = _resolve_layout(grid)
        year, season = split_period(spec.period_code)
        title = _find_title(grid, layout)
        title_season = _season_from_title(title)
        if title_season is not None and title_season != season:
            # A documented mapping already handles known anomalies; anything
            # else is surfaced so reviewers see it instead of it being silent.
            print(
                f"[data] NOTE {spec.release}/{spec.sheet}: title mentions "
                f"Season {title_season}, mapped to {spec.period_code}"
                + (f" ({spec.period_override_reason})" if spec.period_override_reason else "")
            )

        rows, _ = _iter_district_rows(grid, layout, known, spec.period_code)
        for row_idx, raw_label, scope in rows:
            # Aggregate rows carry a label ("Total", "National", SSF, LSF) in
            # ``row_scope_raw``; ``district`` stays a real district or null so a
            # national total can never be read as a district observation - and so
            # the two labels NISR uses for the same national row collapse into a
            # single panel row instead of two half-empty ones.
            official = known.get(raw_label.lower()) if scope == "district" else None
            for col, crop_name in _crop_columns(grid, layout).items():
                value = _num(grid.iat[row_idx, col])
                rows_out.append(
                    {
                        "period_code": spec.period_code,
                        "year": year,
                        "season": season,
                        "district": official,
                        "row_scope": scope,
                        "row_scope_raw": raw_label,
                        "crop": crop_name,
                        "metric": spec.metric,
                        "value": value,
                        "unit": spec.unit,
                        "source_id": _source_id(spec.release),
                        "source_release": spec.release,
                        "source_sheet": spec.sheet,
                        "source_title_raw": title,
                        "source_row": row_idx + 1,
                        "source_kind": kind,
                        "period_override_reason": spec.period_override_reason,
                    }
                )
    return pd.DataFrame(rows_out)


def parse_district_indicator_tables(
    specs: tuple, districts: pd.DataFrame, indicator_from_column
) -> pd.DataFrame:
    """Generic district x percentage-column parser.

    ``indicator_from_column`` maps a (column_index, grid) pair to an indicator
    name; returning ``None`` skips the column.
    """
    known = _district_lookup(districts)
    rows_out: list[dict] = []
    for spec in specs:
        grid, kind = read_table(spec)
        layout = _resolve_layout(grid)
        year, season = split_period(spec.period_code)
        title = _find_title(grid, layout)
        rows, _ = _iter_district_rows(grid, layout, known, spec.period_code)
        for row_idx, raw_label, scope in rows:
            official = known.get(raw_label.lower())
            for col in range(layout.label_col + 1, grid.shape[1]):
                indicator = indicator_from_column(col, grid, layout)
                if indicator is None:
                    continue
                value = _num(grid.iat[row_idx, col])
                rows_out.append(
                    _source_row(
                        spec, year, season, official, scope, indicator, value,
                        kind, title, row_idx, raw_label,
                    )
                )
    return pd.DataFrame(rows_out)


def _practice_indicator(col: int, grid: pd.DataFrame, layout: _Layout) -> str | None:
    """Indicator for the practice tables.

    Two layouts exist:

    * single-row header (Season C style): each column is one indicator;
    * two-row header (A/B style): row ``header_idx`` names indicator groups,
      row ``header_idx + 1`` names the Overall/SSF/LSF scope.
    """
    header_idx = layout.header_idx
    label = _clean_label(grid.iat[header_idx, col])
    lowered = label.lower()

    # Layout B (2024-2026 inorganic-fertilizer and pesticide tables): the
    # scanner's header row is actually the scope row (District | Overall | SSF
    # | LSF) because the district data row sits directly beneath it. The
    # indicator names live one row above; the scope is this row's own label.
    if lowered.startswith(("overall", "ssf", "lsf")):
        indicator_label = _clean_label(grid.iat[header_idx - 1, col]) if header_idx >= 1 else ""
        scope = {"overall": "", "ssf": "_ssf", "lsf": "_lsf"}[
            "overall" if lowered.startswith("overall") else lowered
        ]
        return _practice_indicator_for(indicator_label, scope)

    scope_row = header_idx + 1
    scope_label = _clean_label(grid.iat[scope_row, col]).lower() if len(grid) > scope_row else ""
    if scope_label.startswith(("overall", "ssf", "lsf")):
        scope = {"overall": "", "ssf": "_ssf", "lsf": "_lsf"}[
            "overall" if scope_label.startswith("overall") else scope_label
        ]
    else:
        scope = ""

    return _practice_indicator_for(label, scope)


def _practice_indicator_for(label: str, scope: str) -> str | None:
    """Indicator name for a practice-table column label + scope suffix."""
    lowered = label.lower()
    if "protected land against erosion" in lowered:
        return f"erosion_protection_farmers{scope}"
    if "mechanical equipment" in lowered:
        return f"mechanization_farmers{scope}"
    if "practiced irrigation" in lowered:
        return f"irrigation_farmers{scope}"
    if "agroforestry" in lowered:
        return f"agroforestry_farmers{scope}"

    # The fertilizer/pesticide/seed tables name three published measures:
    # farmers applying, plots treated, land size treated. The plot/land
    # columns keep their own Overall/SSF/LSF scope sub-columns, so the scope
    # check above must run for every column, not just the first group.
    # NB: "inorganic fertilizer" contains the substring "organic fertilizer",
    # so the inorganic branch must be tested first.
    if "inorganic fertili" in lowered:
        if "plots" in lowered:
            return f"inorganic_fertilizer_plots{scope}"
        if "land" in lowered or "area" in lowered:
            return f"inorganic_fertilizer_land{scope}"
        return f"inorganic_fertilizer_farmers{scope}"
    if "organic fertilizer" in lowered:
        if "plots" in lowered:
            return f"organic_fertilizer_plots{scope}"
        if "land" in lowered or "area" in lowered:
            return f"organic_fertilizer_land{scope}"
        return f"organic_fertilizer_farmers{scope}"
    if "improved seed" in lowered:
        if "plots" in lowered:
            return f"improved_seed_plots{scope}"
        if "land" in lowered or "area" in lowered:
            return f"improved_seed_land{scope}"
        return f"improved_seed_farmers{scope}"
    if "pesticide" in lowered:
        if "plots" in lowered:
            return f"pesticide_plots{scope}"
        if "land" in lowered or "area" in lowered:
            return f"pesticide_land{scope}"
        return f"pesticide_farmers{scope}"
    return None


def _fixed_indicator_factory(mapping: dict[int, str]):
    def pick(col: int, grid: pd.DataFrame, layout: _Layout) -> str | None:
        return mapping.get(col)

    return pick


def _irrigation_water_mapping(grid: pd.DataFrame, layout: _Layout) -> dict[int, str]:
    """Column -> indicator for irrigation/water tables.

    Two published layouts: technique tables put the modern-technique labels on
    the row *below* the header and ``Traditional techniques`` on the header
    row itself; water-source tables put every label on the header row. Scan
    both rows so both layouts resolve.
    """
    header_idx = layout.header_idx
    mapping: dict[int, str] = {}
    for col in range(layout.label_col + 1, grid.shape[1]):
        indicator = None
        for row in (header_idx + 1, header_idx):
            if row >= len(grid):
                continue
            label = _clean_label(grid.iat[row, col]).lower()
            if not label:
                continue
            if "surface" in label:
                indicator = "surface_irrigation_pct"
            elif "flood" in label:
                indicator = "flood_irrigation_pct"
            elif "drip" in label:
                indicator = "drip_irrigation_pct"
            elif "sprinkler" in label:
                indicator = "sprinkler_irrigation_pct"
            elif "pivot" in label:
                indicator = "pivot_irrigation_pct"
            elif "traditional" in label:
                indicator = "traditional_irrigation_pct"
            elif "rainwater" in label:
                indicator = "rainwater_source_pct"
            elif "water treatment" in label:
                indicator = "water_treatment_source_pct"
            elif "underground" in label:
                indicator = "underground_source_pct"
            elif "lake" in label:
                indicator = "lake_stream_source_pct"
            elif "catchment" in label:
                indicator = "water_catchment_source_pct"
            if indicator:
                break
        if indicator:
            mapping[col] = indicator
    return mapping


def parse_irrigation_water(districts: pd.DataFrame) -> pd.DataFrame:
    """Irrigation technique mix and water source mix (six + five columns)."""
    rows_out: list[dict] = []
    known = _district_lookup(districts)
    for specs in (tmap.IRRIGATION_TABLES, tmap.WATER_SOURCE_TABLES):
        for spec in specs:
            grid, kind = read_table(spec)
            layout = _resolve_layout(grid)
            mapping = _irrigation_water_mapping(grid, layout)
            year, season = split_period(spec.period_code)
            title = _find_title(grid, layout)
            rows, _ = _iter_district_rows(grid, layout, known, spec.period_code)
            for row_idx, raw_label, scope in rows:
                official = known.get(raw_label.lower())
                for col, indicator in mapping.items():
                    value = _num(grid.iat[row_idx, col])
                    rows_out.append(
                        _source_row(
                            spec, year, season, official, scope, indicator, value,
                            kind, title, row_idx, raw_label,
                        )
                    )
    return pd.DataFrame(rows_out)


def _severity_indicator(label: str) -> str | None:
    lowered = label.lower()
    if "very low" in lowered:
        return "erosion_very_low_pct"
    if "severe" in lowered:
        return "erosion_severe_pct"
    if "moderate" in lowered:
        return "erosion_moderate_pct"
    if lowered.startswith("low"):
        return "erosion_low_pct"
    return None


def parse_erosion(districts: pd.DataFrame) -> pd.DataFrame:
    """Anti-erosion techniques (multi-response) + severity bands."""
    rows_out: list[dict] = []
    known = _district_lookup(districts)
    for specs in (tmap.EROSION_CONTROL_TABLES, tmap.EROSION_SEVERITY_TABLES):
        for spec in specs:
            grid, kind = read_table(spec)
            layout = _resolve_layout(grid)
            year, season = split_period(spec.period_code)
            title = _find_title(grid, layout)
            is_severity = spec.domain == "erosion_severity"
            rows, _ = _iter_district_rows(grid, layout, known, spec.period_code)
            for row_idx, raw_label, scope in rows:
                official = known.get(raw_label.lower())
                for col in range(layout.label_col + 1, grid.shape[1]):
                    if is_severity:
                        indicator = _severity_indicator(
                            _clean(grid.iat[layout.crop_row, col])
                        )
                    else:
                        indicator = _technique_indicator(grid, layout, col)
                    if indicator is None:
                        continue
                    value = _num(grid.iat[row_idx, col])
                    rows_out.append(
                        _source_row(
                            spec, year, season, official, scope, indicator, value,
                            kind, title, row_idx, raw_label,
                        )
                    )
    return pd.DataFrame(rows_out)


def _technique_indicator(grid: pd.DataFrame, layout: _Layout, col: int) -> str | None:
    """Indicator for erosion-control tables (two published layouts).

    2024/2025 annual releases: one header row naming the control technique
    (ditches, terraces, mulching, ...). 2026 season releases: a redesigned
    table - ``Plots under erosion control measures`` (adoption) plus three
    ``Measures to control <rate> erosion`` categories, named on a banner row.
    """
    header_idx = layout.header_idx
    label = _clean_label(grid.iat[header_idx, col]).lower()
    if not label and len(grid) > header_idx + 3:
        # Probe the banner rows below the header and prefer text that actually
        # names a technique/category (a merged banner cell can sit over the
        # first category column, e.g. "Categories of erosion control measures").
        candidates = [
            _clean_label(grid.iat[probe, col]).lower()
            for probe in (header_idx + 1, header_idx + 2, header_idx + 3)
        ]
        matched = [
            t for t in candidates if "measures to control" in t or _match_technique(t)
        ]
        label = matched[0] if matched else next((t for t in candidates if t), "")
    if not label:
        return None
    # 2026 redesigned layout: adoption column + three rate categories.
    if "plots under erosion control" in label:
        return "erosion_control_adoption_pct"
    if "measures to control" in label:
        if "low" in label:
            return "erosion_control_low_rate_pct"
        if "moderate" in label:
            return "erosion_control_moderate_rate_pct"
        if "severe" in label:
            return "erosion_control_severe_rate_pct"
    return _match_technique(label)


_TECHNIQUE_WORDS = {
    "ditches": "ditches_pct",
    "trees/windbreak/shelterbelt": "trees_windbreak_pct",
    "trees/windbreak/ shelterbelt": "trees_windbreak_pct",
    "bench terraces": "bench_terraces_pct",
    "bench/radical terraces": "bench_terraces_pct",
    "progressive terraces": "progressive_terraces_pct",
    "cover plants": "cover_plants_pct",
    "water drainage": "water_drainage_pct",
    "mulching": "mulching_pct",
    "beds/ridges": "beds_ridges_pct",
    "water channels": "water_channels_pct",
    "others": "others_pct",
}


def _match_technique(label: str) -> str | None:
    """Legacy technique-table label -> indicator (text before any parenthesis)."""
    label = label.split("(")[0].strip()
    return _TECHNIQUE_WORDS.get(label)


def _alias_map() -> pd.DataFrame:
    """The crop alias map, derived rather than read from a previous build.

    ``normalize_crops`` (which writes ``data/interim/crop_alias_map.csv``) runs
    after this step, so reading that file made the parsed crop names depend on
    whether an earlier ``make data`` had left one behind: a pristine build (the
    API image, a fresh checkout, CI) kept the raw published labels while a second
    build in the same tree resolved them to canonical names. The two builds then
    hashed to two different dataset versions, and the deploy's own identity check
    rejected the load. The map is a pure function of committed inputs, so it is
    derived here from the same source of truth.
    """
    from scripts.data.normalize_crops import alias_map

    return alias_map()


def parse_postharvest(districts: pd.DataFrame, alias_map: pd.DataFrame | None = None) -> pd.DataFrame:
    """Production-use shares per crop per period (crop-level, national)."""
    use_cols = [
        ("sold", "sold_pct"),
        ("own consumption", "own_consumption_pct"),
        ("auto consumption", "own_consumption_pct"),
        ("wages for hired labour", "hired_labour_wages_pct"),
        ("farm rent", "farm_rent_pct"),
        ("offered as gift", "gift_pct"),
        ("barter trade/exchanged with other things", "barter_pct"),
        ("barter trade / exchanged with other things", "barter_pct"),
        ("barter", "barter_pct"),
        ("seeds", "seeds_pct"),
        ("fodder purpose", "fodder_pct"),
        ("fodder purposes", "fodder_pct"),
        ("fodder", "fodder_pct"),
        ("stored", "stored_pct"),
        ("post harvesting losses", "post_harvest_losses_pct"),
        ("post harvest losses", "post_harvest_losses_pct"),
        ("other usage", "other_usage_pct"),
    ]

    alias: dict[str, str] = {}
    if alias_map is not None and not alias_map.empty:
        alias = {
            _clean_label(r["raw_crop_name"]).lower(): _clean_label(r["canonical_crop_name"])
            for _, r in alias_map.iterrows()
        }

    rows_out: list[dict] = []
    for spec in tmap.POSTHARVEST_TABLES:
        grid, kind = read_table(spec)
        layout = _resolve_layout(grid)
        year, season = split_period(spec.period_code)
        title = _find_title(grid, layout)
        mapping: dict[int, str] = {}
        for col in range(layout.label_col + 1, grid.shape[1]):
            label = _clean_label(grid.iat[layout.crop_row, col]).lower()
            for match, indicator in use_cols:
                if label == match or label.startswith(match):
                    mapping[col] = indicator
                    break
        # Crop-keyed rows (no district lookup): row labels are crop names.
        for row_idx in range(layout.header_idx + 1, len(grid)):
            crop_raw = _clean_label(grid.iat[row_idx, layout.label_col])
            if not crop_raw or crop_raw.lower().startswith("source:"):
                continue
            crop_lower = crop_raw.lower()
            if crop_lower in ("crops",):
                continue
            canonical = alias.get(crop_lower, crop_raw)
            for col, indicator in mapping.items():
                value = _num(grid.iat[row_idx, col])
                rows_out.append(
                    {
                        "period_code": spec.period_code,
                        "year": year,
                        "season": season,
                        "crop_raw": crop_raw,
                        "crop": canonical,
                        "indicator_code": indicator,
                        "value": value,
                        "unit": "percent",
                        "source_id": _source_id(spec.release),
                        "source_release": spec.release,
                        "source_sheet": spec.sheet,
                        "source_title_raw": title,
                        "source_row": row_idx + 1,
                        "source_kind": kind,
                        "period_override_reason": spec.period_override_reason,
                    }
                )
    return pd.DataFrame(rows_out)


def main() -> int:
    districts = pd.read_csv(DICTS_DIR / "districts.csv")

    problems = tmap.check_mapping()
    if problems:
        log("ERROR: SAS table mapping contract violated:")
        for problem in problems:
            log(f"  - {problem}")
        return 1

    log("parsing productivity tables...")
    productivity = parse_productivity(districts)
    log("parsing practice tables...")
    practices = parse_district_indicator_tables(
        tmap.PRACTICE_TABLES, districts, _practice_indicator
    )
    log("parsing irrigation + water-source tables...")
    irrigation = parse_irrigation_water(districts)
    log("parsing erosion tables...")
    erosion = parse_erosion(districts)
    log("parsing post-harvest use tables...")
    try:
        alias_frame = _alias_map()
    except ValueError as error:
        log(f"ERROR: {error}")
        return 1
    postharvest = parse_postharvest(districts, alias_frame)

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    productivity.to_csv(INTERIM_DIR / "sas_productivity_long.csv", index=False)
    practices.to_csv(INTERIM_DIR / "sas_practices_long.csv", index=False)
    combined_dw = pd.concat([irrigation, erosion], ignore_index=True)
    combined_dw.to_csv(INTERIM_DIR / "sas_district_indicators_long.csv", index=False)
    postharvest.to_csv(INTERIM_DIR / "sas_postharvest_long.csv", index=False)

    log(
        f"productivity long: {len(productivity)} rows "
        f"({productivity['period_code'].nunique()} periods, "
        f"{productivity['crop'].nunique()} crops)"
    )
    log(
        f"practices long: {len(practices)} rows "
        f"({practices['indicator_code'].nunique()} indicators)"
    )
    log(f"district indicators long (irrigation/water/erosion): {len(combined_dw)} rows")
    log(f"postharvest long: {len(postharvest)} rows ({postharvest['period_code'].nunique()} periods)")
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
