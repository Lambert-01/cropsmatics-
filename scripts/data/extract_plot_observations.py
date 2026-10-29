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

import hashlib
import re
import sys
from collections.abc import Iterable
from pathlib import Path

import numpy as np
import pandas as pd

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

_MISSING = {"", "-", "—", "na", "n/a", "nan", "none", "null", "."}


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
        prefix = "NISR_RAHS_MICRODATA"
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
    crop_column = _first_column(
        columns,
        ("canonical_crop_name", "crop", "crop name", "cropcategory", "s2q4"),
    )
    district_column = _first_column(columns, ("district", "district name & code", "s1q2"))
    district_code_column = _first_column(columns, ("district_code", "district code"))
    province_column = _first_column(columns, ("province", "s1q1"))
    segment_column = _first_column(columns, ("segment_id", "segment id", "idquest", "s1q4"))
    farmer_column = _first_column(
        columns,
        ("farmer_id", "farmer id", "household_id", "household id", "lsf_id", "s1q6"),
    )
    plot_column = _first_column(columns, ("plot_id", "plot no", "plot number", "s2q1"))
    latitude_column = _first_column(columns, ("latitude", "lat", "gps latitude", "gps_latitude"))
    longitude_column = _first_column(columns, ("longitude", "lon", "lng", "gps longitude", "gps_longitude"))
    geometry_column = _first_column(columns, ("geometry_wkt", "wkt", "geometry"))
    crops = _crop_dictionary()
    districts = _district_dictionary()
    resolved_period = period_code or infer_period(Path(source_file))
    resolved_source = source_id or infer_source_id(Path(source_file), resolved_period)
    source_unit = _production_unit(production_columns)
    year = int(resolved_period[:4]) if resolved_period and resolved_period[:4].isdigit() else None
    season = resolved_period[4:] if resolved_period and len(resolved_period) == 5 else None
    rows: list[dict] = []

    for index, (_, row) in enumerate(frame.iterrows(), start=2):
        crop_raw = _text(_row_value(row, crop_column))
        district = _text(_row_value(row, district_column))
        area_value = _number(_row_value(row, area_column))
        if area_value is not None and area_unit == "sqm":
            area_value /= 10_000

        production_parts = [_number(_row_value(row, column)) for column in production_columns]
        production_parts = [value for value in production_parts if value is not None]
        production_original = sum(production_parts) if production_parts else None
        production_kg = production_original
        if production_kg is not None and source_unit == "mt":
            production_kg *= 1_000

        latitude = _number(_row_value(row, latitude_column))
        longitude = _number(_row_value(row, longitude_column))
        geometry = _text(_row_value(row, geometry_column))
        geometry_available = bool(geometry or (latitude is not None and longitude is not None))
        if not any(value is not None for value in (crop_raw, district, area_value, production_kg)):
            continue

        plot_id = _text(_row_value(row, plot_column))
        stable_key = "|".join(
            str(value or "")
            for value in (resolved_source, source_file, source_table, index, plot_id, crop_raw)
        )
        observation_id = hashlib.sha256(stable_key.encode("utf-8")).hexdigest()[:24]
        canonical_crop = crops.get(crop_raw.lower()) if crop_raw else None
        district_code = _text(_row_value(row, district_code_column))
        if district_code is None and district:
            district_code = districts.get(district.lower())

        rows.append(
            {
                "field_observation_id": observation_id,
                "period_code": resolved_period,
                "year": year,
                "season": season,
                "source_id": resolved_source,
                "source_file": source_file,
                "source_table": source_table,
                "source_row": index,
                "district": district,
                "district_code": district_code,
                "province": _text(_row_value(row, province_column)),
                "segment_id": _text(_row_value(row, segment_column)),
                "farmer_or_household_id": _text(_row_value(row, farmer_column)),
                "plot_id": plot_id,
                "crop_raw": crop_raw,
                "canonical_crop_name": canonical_crop,
                "area_ha": area_value,
                "production_kg": production_kg,
                "production_unit_original": source_unit,
                "production_original": production_original,
                "yield_kg_ha": (
                    production_kg / area_value
                    if production_kg is not None and area_value and area_value > 0
                    else None
                ),
                "latitude": latitude,
                "longitude": longitude,
                "geometry_wkt": geometry,
                "geometry_available": geometry_available,
                "access_level": "restricted_microdata",
                "record_scope": "plot",
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
        return [("", pd.read_stata(path))]
    if suffix == ".sav":
        return [("", pd.read_spss(path))]
    return []


def build(raw_dir: Path = RAW_SAS_MICRODATA_DIR, output: Path = PROCESSED_DIR / "field_crop_observations.csv") -> pd.DataFrame:
    """Extract every supported local microdata file into one deterministic CSV."""
    output_rows: list[pd.DataFrame] = []
    if raw_dir.exists():
        paths = sorted(
            path
            for path in raw_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in {".csv", ".tsv", ".xlsx", ".xls", ".dta", ".sav"}
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
    log(f"built {output.relative_to(DATA_DIR.parent)}: {len(result)} plot observations")
    if not result.empty and not result["geometry_available"].any():
        log("plot geometry: none supplied; no field locations were inferred")
    return result


def main() -> int:
    try:
        build()
    except (OSError, ValueError, ImportError) as error:
        print(f"plot microdata extraction failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
