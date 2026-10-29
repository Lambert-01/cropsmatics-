#!/usr/bin/env python3
"""Extract approved plot-level area and production observations.

This is an optional research-data stage, separate from the canonical SAS
worksheet pipeline. NISR/AHS microdata may contain plot measurements and crop
production, but the repository must not assume that a public download contains
GPS geometry. Coordinates and geometry are copied only when the source file
actually provides them; no district centroid is used as a substitute.

Expected input location::

    data/raw/nisr/sas_microdata/

The directory is intentionally empty in a normal checkout. Operators may place
an approved CSV, TSV, XLSX, XLS, DTA or SAV export there. The extractor uses
semantic column aliases because NISR releases use both question codes (for
example ``s2q2``) and descriptive labels (for example ``Plot area (sqm)``).

The output is an auditable row-level table for controlled analytical use. Public
API responses aggregate it by period, district and crop so plot identifiers and
potentially sensitive records are not exposed by default.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections.abc import Iterable
from pathlib import Path

import numpy as np
import pandas as pd

# Allow both `python -m scripts.data.extract_plot_observations` and direct
# execution from the repository root or any working directory.
if __package__ in {None, ""}:  # pragma: no cover - exercised by the CLI smoke test
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.data.common import (
    DATA_DIR,
    DICTS_DIR,
    PIPELINE_VERSION,
    PROCESSED_DIR,
    RAW_SAS_MICRODATA_DIR,
    log,
)

OUTPUT_COLUMNS = [
    "field_observation_id",
    "period_code",
    "year",
    "season",
    "source_id",
    "source_file",
    "source_table",
    "source_row",
    "district",
    "district_code",
    "province",
    "segment_id",
    "farmer_or_household_id",
    "plot_id",
    "crop_raw",
    "canonical_crop_name",
    "area_ha",
    "production_kg",
    "production_unit_original",
    "production_original",
    "yield_kg_ha",
    "latitude",
    "longitude",
    "geometry_wkt",
    "geometry_available",
    "access_level",
    "record_scope",
    "processing_script",
    "processing_version",
    "is_synthetic",
]

SUPPORTED_SUFFIXES = {".csv", ".tsv", ".xlsx", ".xls", ".dta", ".sav"}

_MISSING = {"", "-", "—", "na", "n/a", "nan", "none", "null", "."}

# The public AHS export keeps the NISR questionnaire codes instead of the
# display names used by the dashboard.  These mappings are deliberately kept
# here, beside the extraction rule, so a numeric code can never be mistaken
# for a crop or district name.
_NISR_PROVINCES = {
    1: "Kigali City",
    2: "Southern",
    3: "Western",
    4: "Northern",
    5: "Eastern",
}

_NISR_DISTRICTS = {
    11: ("Nyarugenge", "RW-KG-NYA"),
    12: ("Gasabo", "RW-KG-GAS"),
    13: ("Kicukiro", "RW-KG-KIC"),
    21: ("Gisagara", "RW-SO-GIS"),
    22: ("Huye", "RW-SO-HUY"),
    23: ("Kamonyi", "RW-SO-KAM"),
    24: ("Muhanga", "RW-SO-MUH"),
    25: ("Nyanza", "RW-SO-NYA"),
    26: ("Nyamagabe", "RW-SO-NYG"),
    27: ("Nyaruguru", "RW-SO-NYR"),
    28: ("Ruhango", "RW-SO-RUH"),
    31: ("Karongi", "RW-WE-KAR"),
    32: ("Ngororero", "RW-WE-NGO"),
    33: ("Nyabihu", "RW-WE-NYB"),
    34: ("Nyamasheke", "RW-WE-NYS"),
    35: ("Rubavu", "RW-WE-RUB"),
    36: ("Rusizi", "RW-WE-RUS"),
    37: ("Rutsiro", "RW-WE-RUT"),
    41: ("Burera", "RW-NO-BUR"),
    42: ("Gakenke", "RW-NO-GAK"),
    43: ("Gicumbi", "RW-NO-GIC"),
    44: ("Musanze", "RW-NO-MUS"),
    45: ("Rulindo", "RW-NO-RUL"),
    51: ("Bugesera", "RW-EA-BUG"),
    52: ("Gatsibo", "RW-EA-GAT"),
    53: ("Kayonza", "RW-EA-KAY"),
    54: ("Kirehe", "RW-EA-KIR"),
    55: ("Ngoma", "RW-EA-NGO"),
    56: ("Nyagatare", "RW-EA-NYG"),
    57: ("Rwamagana", "RW-EA-RWA"),
}

# AHS has detailed crop codes, while Cropmatics' official productivity panel
# publishes the canonical groups below.  The grouping is intentionally
# conservative: detail that cannot be joined to a canonical group remains
# unresolved rather than being silently renamed to a different crop.
_NISR_CROP_GROUPS = {
    **{code: name for code, name in {
        101: "Maize",
        102: "Paddy rice",
        103: "Sorghum",
        104: "Wheat",
        105: "Other cereals",
        110: "Irish potato",
        111: "Sweet potato",
        112: "Yams & Taro",
        113: "Yams & Taro",
        114: "Yams & Taro",
        122: "Soybean",
        123: "Groundnut",
        305: "Cassava",
    }.items()},
    106: "Beans",
    107: "Beans",
    108: "Beans",
    109: "Beans",
    130: "Beans",
    **{code: "Vegetables" for code in (115, 116, 117, 118, 119, 120, 121, 125, 126, 127, 128, 129, 131, 132, 133, 134, 135, 136, 137, 139)},
    **{code: "Other crops" for code in (124, 138, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 201, 202, 203, 205, 206, 207, 304, 306, 307, 308, 309, 310, 311)},
    **{code: "Fruits" for code in range(401, 420)},
    **{code: "Banana" for code in (301, 302, 303)},
    **{code: "Fodder crops" for code in range(501, 511)},
    204: "Fodder crops",
}


def normalize_column(value: object) -> str:
    """Make a source header comparable without changing its meaning."""
    text = str(value).strip().lower()
    return re.sub(r"[^a-z0-9]+", "", text)


def _text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    value = str(value).strip()
    return None if value.lower() in _MISSING else value


def _number(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, str):
        value = value.strip().replace(",", "")
        if value.lower() in _MISSING:
            return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if np.isfinite(result) else None


def _column_map(frame: pd.DataFrame) -> dict[str, str]:
    """Return normalized header -> original header, keeping first duplicates."""
    out: dict[str, str] = {}
    for column in frame.columns:
        out.setdefault(normalize_column(column), str(column))
    return out


def _first_column(columns: dict[str, str], aliases: Iterable[str]) -> str | None:
    for alias in aliases:
        if normalize_column(alias) in columns:
            return columns[normalize_column(alias)]
    return None


def _indexed_columns(columns: dict[str, str], base: str) -> dict[int, str]:
    """Find repeated questionnaire fields such as ``s3_q4_1`` by slot."""
    prefix = normalize_column(base)
    result: dict[int, str] = {}
    for normalized, original in columns.items():
        match = re.fullmatch(rf"{re.escape(prefix)}(\d+)", normalized)
        if match:
            result[int(match.group(1))] = original
    return result


def _indexed_columns_with_suffix(columns: dict[str, str], base: str, suffix: str) -> dict[int, str]:
    """Find repeated fields whose slot has a suffix, e.g. crop share ``1a``."""
    prefix = normalize_column(base)
    result: dict[int, str] = {}
    for normalized, original in columns.items():
        match = re.fullmatch(rf"{re.escape(prefix)}(\d+){re.escape(normalize_column(suffix))}", normalized)
        if match:
            result[int(match.group(1))] = original
    return result


def _matching_columns(
    columns: dict[str, str], *, exact: Iterable[str] = (), contains: Iterable[str] = ()
) -> list[str]:
    exact_keys = {normalize_column(value) for value in exact}
    contains_keys = tuple(normalize_column(value) for value in contains)
    result: list[str] = []
    for normalized, original in columns.items():
        if normalized in exact_keys or any(token in normalized for token in contains_keys):
            result.append(original)
    return result


def infer_period(path: Path) -> str | None:
    """Infer a period from a controlled microdata filename/path."""
    text = "_".join(path.parts).lower()
    year_match = re.search(r"(20\d{2})", text)
    if not year_match:
        return None
    year = year_match.group(1)
    season_match = re.search(r"season[_ -]?([abc])", text)
    if not season_match:
        season_match = re.search(r"(?:^|[_ -])([abc])(?:[_ -]|$)", text)
    return f"{year}{season_match.group(1).upper()}" if season_match else year


def infer_source_id(path: Path, period_code: str | None) -> str:
    text = str(path).lower()
    if "ahs" in text or "agriculture_household" in text:
        prefix = "NISR_AHS_MICRODATA"
    else:
        prefix = "NISR_SAS_MICRODATA"
    return f"{prefix}_{period_code}" if period_code else prefix


def _crop_dictionary() -> dict[str, str]:
    path = DICTS_DIR / "crops.csv"
    if not path.exists():
        return {}
    frame = pd.read_csv(path, dtype=str).fillna("")
    if not {"crop_name", "crop_code"}.issubset(frame.columns):
        return {}
    return {str(row.crop_name).strip().lower(): str(row.crop_name).strip() for row in frame.itertuples()}


def _district_dictionary() -> dict[str, str]:
    path = DICTS_DIR / "districts.csv"
    if not path.exists():
        return {}
    frame = pd.read_csv(path, dtype=str).fillna("")
    if not {"district", "district_code"}.issubset(frame.columns):
        return {}
    return {str(row.district).strip().lower(): str(row.district_code).strip() for row in frame.itertuples()}


def _integer_code(value: object) -> int | None:
    number = _number(value)
    if number is None or not number.is_integer():
        return None
    return int(number)


def _province_name(value: object) -> str | None:
    text = _text(value)
    if text is not None and _integer_code(text) is None:
        return text
    code = _integer_code(value)
    return _NISR_PROVINCES.get(code, text)


def _district_name_and_code(value: object, districts: dict[str, str]) -> tuple[str | None, str | None]:
    text = _text(value)
    code_number = _integer_code(value)
    if code_number in _NISR_DISTRICTS:
        name, code = _NISR_DISTRICTS[code_number]
        return name, code
    if text is None:
        return None, None
    normalized = text.lower()
    if normalized in districts:
        return text, districts[normalized]
    return text, None


def _canonical_crop(value: object, crops: dict[str, str]) -> str | None:
    text = _text(value)
    if text is None:
        return None
    code = _integer_code(text)
    if code in _NISR_CROP_GROUPS:
        return _NISR_CROP_GROUPS[code]
    normalized = text.lower()
    if normalized in crops:
        return crops[normalized]
    aliases = {
        "bush bean": "Beans",
        "climbing bean": "Beans",
        "pea": "Beans",
        "taro": "Yams & Taro",
        "yams": "Yams & Taro",
        "cassava": "Cassava",
        "cooking banana": "Banana",
        "dessert banana": "Banana",
        "banana for beer": "Banana",
        "napia grass": "Fodder crops",
    }
    return aliases.get(normalized)


def _row_period(value: object, base_period: str | None) -> str | None:
    """Resolve an explicit AHS season without guessing from row order."""
    text = _text(value)
    if text is None:
        return base_period
    direct = re.search(r"(20\d{2})\s*(?:season\s*)?([abc])", text, flags=re.IGNORECASE)
    if direct:
        return f"{direct.group(1)}{direct.group(2).upper()}"
    season = re.fullmatch(r"(?:season\s*)?([abc])", text, flags=re.IGNORECASE)
    if season and base_period and base_period[:4].isdigit():
        return f"{base_period[:4]}{season.group(1).upper()}"
    season_number = _integer_code(value)
    if season_number in {1, 2, 3} and base_period and base_period[:4].isdigit():
        return f"{base_period[:4]}{('A', 'B', 'C')[season_number - 1]}"
    return base_period


def _area_column(columns: dict[str, str]) -> tuple[str | None, str | None]:
    hectare = _first_column(
        columns,
        ("plot_area_ha", "plot size (ha)", "plot size ha", "area_ha", "s2q4_ha"),
    )
    if hectare:
        return hectare, "ha"
    square_metre = _first_column(
        columns,
        (
            "plot area (sqm)",
            "plot area (m2)",
            "plot size (m2)",
            "area in sqm",
            "area sqm",
            "s2q2",
        ),
    )
    if square_metre:
        return square_metre, "sqm"
    semantic = _matching_columns(columns, contains=("plotarea", "plotsize"))
    return (semantic[0], "sqm") if semantic else (None, None)


def _production_columns(columns: dict[str, str]) -> list[str]:
    """Find numeric production/harvest fields without treating price as output."""
    exact = (
        "production_kg",
        "production (kg)",
        "quantity harvested (kg)",
        "total harvest (kg)",
        "total production (kg)",
        "production_mt",
        "production (mt)",
        "total quantity of harvest for this season in this plot (in kg)",
    )
    result = _matching_columns(columns, exact=exact)
    for normalized, original in columns.items():
        if normalized.startswith("s3q20") or normalized.startswith("s3_q20"):
            result.append(original)
    semantic = _matching_columns(
        columns,
        contains=("production", "quantityharvest", "harvestquantity", "totalharvest"),
    )
    result.extend(semantic)
    return list(dict.fromkeys(result))


def _production_unit(columns: Iterable[str]) -> str:
    text = " ".join(normalize_column(column) for column in columns)
    if "mt" in text or "tonne" in text:
        return "mt"
    return "kg"


def _source_relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(DATA_DIR.parent.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def _row_value(row: pd.Series, column: str | None) -> object:
    return row[column] if column and column in row else None


def extract_frame(
    frame: pd.DataFrame,
    *,
    source_file: str,
    source_table: str | None = None,
    period_code: str | None = None,
    source_id: str | None = None,
) -> pd.DataFrame:
    """Convert one NISR/AHS file or worksheet into the stable output contract."""
    columns = _column_map(frame)
    area_column, area_unit = _area_column(columns)
    production_columns = _production_columns(columns)
    crop_slots = _indexed_columns(columns, "s3_q4_")
    production_slots = _indexed_columns(columns, "s3_q20_")
    crop_share_slots = _indexed_columns_with_suffix(columns, "s3_q4_", "a")
    crop_column = _first_column(
        columns,
        ("canonical_crop_name", "crop", "crop name", "cropcategory", "s2q4"),
    )
    district_column = _first_column(columns, ("district", "district name & code", "s1q2"))
    district_code_column = _first_column(columns, ("district_code", "district code"))
    province_column = _first_column(columns, ("province", "s1q1"))
    period_column = _first_column(columns, ("period_code", "period", "season"))
    segment_column = _first_column(
        columns, ("segment_id", "segment id", "idquest", "cluster_id", "clust", "s1q4")
    )
    farmer_column = _first_column(
        columns,
        ("farmer_id", "farmer id", "household_id", "household id", "hhid", "lsf_id", "s1q6"),
    )
    plot_column = _first_column(columns, ("plot_id", "plot no", "plot number", "s2q1"))
    latitude_column = _first_column(columns, ("latitude", "lat", "gps latitude", "gps_latitude"))
    longitude_column = _first_column(columns, ("longitude", "lon", "lng", "gps longitude", "gps_longitude"))
    geometry_column = _first_column(columns, ("geometry_wkt", "wkt", "geometry"))
    crops = _crop_dictionary()
    districts = _district_dictionary()
    resolved_period = period_code or infer_period(Path(source_file))
    resolved_source = source_id or infer_source_id(Path(source_file), resolved_period)
    rows: list[dict] = []

    for index, (_, row) in enumerate(frame.iterrows(), start=2):
        row_period = _row_period(_row_value(row, period_column), resolved_period)
        year = int(row_period[:4]) if row_period and row_period[:4].isdigit() else None
        season = row_period[4:] if row_period and len(row_period) == 5 else None

        district, inferred_district_code = _district_name_and_code(
            _row_value(row, district_column), districts
        )
        area_value = _number(_row_value(row, area_column))
        if area_value is not None and area_unit == "sqm":
            area_value /= 10_000

        latitude = _number(_row_value(row, latitude_column))
        longitude = _number(_row_value(row, longitude_column))
        geometry = _text(_row_value(row, geometry_column))
        geometry_available = bool(geometry or (latitude is not None and longitude is not None))
        plot_id = _text(_row_value(row, plot_column))
        district_code = _text(_row_value(row, district_code_column))
        if district_code is None:
            district_code = inferred_district_code

        province = _province_name(_row_value(row, province_column))
        segment_id = _text(_row_value(row, segment_column))
        farmer_or_household_id = _text(_row_value(row, farmer_column))

        # AHS stores up to seven crop records in one plot row.  Emit one
        # observation per crop slot, using the matching harvest column.  When
        # the source does not publish a crop share, a shared plot area is used
        # only for a single-crop row; multi-crop rows keep area unavailable
        # instead of duplicating the plot area.
        if crop_slots:
            active_slots = [
                slot for slot, column in sorted(crop_slots.items())
                if _text(_row_value(row, column)) is not None
            ]
            entries = []
            for slot in active_slots:
                crop_raw = _text(_row_value(row, crop_slots[slot]))
                share = _number(_row_value(row, crop_share_slots.get(slot)))
                crop_area = None
                if share is not None and area_value is not None and 0 <= share <= 100:
                    crop_area = area_value * share / 100
                elif len(active_slots) == 1:
                    crop_area = area_value
                production_column = production_slots.get(slot)
                production_original = _number(_row_value(row, production_column))
                entries.append((slot, crop_raw, crop_area, production_original, "kg"))
            if not entries and crop_column:
                entries = [(None, _text(_row_value(row, crop_column)), area_value, None, "kg")]
            record_scope = "plot_crop"
        else:
            crop_raw = _text(_row_value(row, crop_column))
            production_parts = [_number(_row_value(row, column)) for column in production_columns]
            production_parts = [value for value in production_parts if value is not None]
            production_original = sum(production_parts) if production_parts else None
            entries = [(None, crop_raw, area_value, production_original, _production_unit(production_columns))]
            record_scope = "plot"

        for slot, crop_raw, crop_area, production_original, source_unit in entries:
            production_kg = production_original
            if production_kg is not None and source_unit == "mt":
                production_kg *= 1_000
            if not any(value is not None for value in (crop_raw, district, crop_area, production_kg)):
                continue

            stable_key = "|".join(
                str(value or "")
                for value in (
                    resolved_source,
                    source_file,
                    source_table,
                    index,
                    slot,
                    plot_id,
                    crop_raw,
                )
            )
            observation_id = hashlib.sha256(stable_key.encode("utf-8")).hexdigest()[:24]
            rows.append(
                {
                    "field_observation_id": observation_id,
                    "period_code": row_period,
                    "year": year,
                    "season": season,
                    "source_id": resolved_source,
                    "source_file": source_file,
                    "source_table": source_table,
                    "source_row": index,
                    "district": district,
                    "district_code": district_code,
                    "province": province,
                    "segment_id": segment_id,
                    "farmer_or_household_id": farmer_or_household_id,
                    "plot_id": plot_id,
                    "crop_raw": crop_raw,
                    "canonical_crop_name": _canonical_crop(crop_raw, crops),
                    "area_ha": crop_area,
                    "production_kg": production_kg,
                    "production_unit_original": source_unit,
                    "production_original": production_original,
                    "yield_kg_ha": (
                        production_kg / crop_area
                        if production_kg is not None and crop_area and crop_area > 0
                        else None
                    ),
                    "latitude": latitude,
                    "longitude": longitude,
                    "geometry_wkt": geometry,
                    "geometry_available": geometry_available,
                    "access_level": "restricted_microdata",
                    "record_scope": record_scope,
                    "processing_script": "extract_plot_observations.py",
                    "processing_version": PIPELINE_VERSION,
                    "is_synthetic": False,
                }
            )
    return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)


def _read_file(path: Path) -> list[tuple[str, pd.DataFrame]]:
    suffix = path.suffix.lower()
    if suffix in {".csv", ".tsv"}:
        try:
            frame = pd.read_csv(path, sep="\t" if suffix == ".tsv" else ",", low_memory=False)
        except UnicodeDecodeError:
            frame = pd.read_csv(path, sep="\t" if suffix == ".tsv" else ",", encoding="latin-1", low_memory=False)
        return [("", frame)]
    if suffix in {".xlsx", ".xls"}:
        sheets = pd.read_excel(path, sheet_name=None)
        return [(str(sheet), frame) for sheet, frame in sheets.items()]
    if suffix == ".dta":
        # NISR/AHS codebooks can reuse a label (for example "Other season")
        # for several values. Preserve the numeric questionnaire codes and
        # resolve them explicitly above instead of constructing categoricals
        # with non-unique labels.
        return [("", pd.read_stata(path, convert_categoricals=False))]
    if suffix == ".sav":
        return [("", pd.read_spss(path))]
    return []


def supported_paths(raw_dir: Path) -> list[Path]:
    """Return deterministic supported input files under an optional source directory."""
    if not raw_dir.exists():
        return []
    return sorted(
        path
        for path in raw_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )


def build(
    raw_dir: Path = RAW_SAS_MICRODATA_DIR,
    output: Path = PROCESSED_DIR / "field_crop_observations.csv",
) -> pd.DataFrame:
    """Extract every supported local microdata file into one deterministic CSV."""
    output_rows: list[pd.DataFrame] = []
    paths = supported_paths(raw_dir)
    if not paths:
        log(
            "no supported plot microdata files found under "
            f"{raw_dir}; created an empty optional output"
        )
    for path in paths:
        period = infer_period(path)
        source_id = infer_source_id(path, period)
        for sheet, frame in _read_file(path):
            extracted = extract_frame(
                frame,
                source_file=_source_relative(path),
                source_table=sheet or None,
                period_code=period,
                source_id=source_id,
            )
            if not extracted.empty:
                output_rows.append(extracted)

    result = pd.concat(output_rows, ignore_index=True) if output_rows else pd.DataFrame(columns=OUTPUT_COLUMNS)
    if not result.empty:
        result = result.drop_duplicates(subset=["field_observation_id"], keep="first")
        result = result.sort_values(
            ["period_code", "district", "canonical_crop_name", "source_file", "source_row"],
            na_position="last",
        ).reset_index(drop=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(output, index=False)
    try:
        display_output = output.resolve().relative_to(DATA_DIR.parent.resolve()).as_posix()
    except ValueError:
        display_output = str(output)
    log(f"built {display_output}: {len(result)} plot observations")
    if not result.empty and not result["geometry_available"].any():
        log("plot geometry: none supplied; no field locations were inferred")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract approved NISR/AHS plot area and production observations."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=RAW_SAS_MICRODATA_DIR,
        help="directory containing approved microdata exports",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROCESSED_DIR / "field_crop_observations.csv",
        help="processed CSV output path",
    )
    parser.add_argument(
        "--require-data",
        action="store_true",
        help="fail when no supported input file or plot record is found",
    )
    args = parser.parse_args(argv)
    try:
        result = build(raw_dir=args.input_dir, output=args.output)
        if args.require_data and result.empty:
            print(
                "plot microdata extraction found no records; provide an approved "
                "CSV, TSV, XLSX, XLS, DTA or SAV export",
                file=sys.stderr,
            )
            return 2
    except (OSError, ValueError, ImportError) as error:
        print(f"plot microdata extraction failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
