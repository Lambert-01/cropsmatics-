#!/usr/bin/env python3
"""Load processed analytical datasets into the canonical PostgreSQL schema.

    python scripts/data/load_postgres.py --dry-run
    python scripts/data/load_postgres.py

This sits at the end of the pipeline:

    processed CSV -> validation -> PostgreSQL upsert -> dataset version -> API

Properties it is required to have, and how each is met:

* **Idempotent / rerunnable.** Every table has a stable business key and is
  written with ``INSERT ... ON CONFLICT``. Running twice changes nothing the
  second time, and the second run reports those rows as *unchanged*.
* **Transaction safe.** One transaction per run. A failure rolls the whole run
  back, so a partial load can never be mistaken for a complete one.
* **Deterministic.** The dataset version is a content hash of the manifest, the
  reference rows are derived from the processed files, and nothing reads the
  clock except the run's own start/finish timestamps.
* **Not destructive.** Rows are upserted, never deleted or truncated. Raw data is
  untouched; a stale row is a visibility problem for a later pass, not something
  this loader silently removes.

It does not create tables. Schema changes belong to Alembic (``make migrate``);
if the canonical tables are missing this exits with that instruction rather than
creating them out of band.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, sessionmaker

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
# The catalogue lives with the application so the API and the loader share one
# definition of every indicator and source.
API_DIR = ROOT / "services" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.data.catalogue import (  # noqa: E402
    INDICATORS,
    SOURCES,
    UNITS,
    UNITS_BY_CODE,
    observation_source_attribution,
    parse_source_titles,
    source_table_id,
    validate_catalogue,
)
from scripts.data.common import (  # noqa: E402
    PROCESSED_DIR,
    VALID_PERIODS,
    log,
    normalize_period,
)

TABLES = (
    "period",
    "unit",
    "indicator",
    "dataset_version",
    "source_table",
    "data_ingestion_run",
    "crop_productivity",
    "agricultural_observation",
)

# The published tables these files were extracted from, per release. Used only to
# record provenance rows; no value is derived from this map.
PANEL_GEOGRAPHY_LEVELS = {"DISTRICT": "district", "NATIONAL": "national"}

METRIC_COLUMNS = (
    "cultivated_area_ha",
    "harvested_area_ha",
    "production_mt",
    "yield_kg_ha",
)


# --------------------------------------------------------------------------
# stats
# --------------------------------------------------------------------------


@dataclass
class TableStats:
    table: str
    source_rows: int = 0
    accepted_rows: int = 0
    rejected_rows: int = 0
    inserted_rows: int = 0
    updated_rows: int = 0
    unchanged_rows: int = 0
    reject_reasons: Counter = field(default_factory=Counter)

    def as_run_kwargs(self) -> dict:
        return {
            "source_rows": self.source_rows,
            "accepted_rows": self.accepted_rows,
            "rejected_rows": self.rejected_rows,
            "inserted_rows": self.inserted_rows,
            "updated_rows": self.updated_rows,
            "unchanged_rows": self.unchanged_rows,
            "reject_reasons": dict(self.reject_reasons) or None,
        }


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------


def clean(value):
    """Convert a pandas missing value to ``None``.

    Missing is not zero: a blank cell in the source means "not measured", so it
    must arrive in the database as NULL rather than as a fabricated ``0``.
    """
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def as_float(value) -> float | None:
    value = clean(value)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def as_bool(value) -> bool | None:
    value = clean(value)
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "t"}


def values_match(left, right) -> bool:
    """Compare two column values for equality, treating NaN as None."""
    left, right = clean(left), clean(right)
    if isinstance(left, float) and isinstance(right, float):
        return abs(left - right) < 1e-9
    return left == right


def content_version(manifest: dict) -> str:
    """Content-addressed dataset version — stable for identical inputs."""
    payload = json.dumps(
        {
            "pipeline_version": manifest.get("pipeline_version"),
            "git_sha": manifest.get("git_sha"),
            "build_timestamp": manifest.get("build_timestamp"),
            "row_counts": manifest.get("row_counts"),
        },
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    pipeline = manifest.get("pipeline_version") or "0.0.0"
    return f"{pipeline}-{digest}"


# --------------------------------------------------------------------------
# upsert
# --------------------------------------------------------------------------


def existing_index(session: Session, model, key_columns: tuple[str, ...]) -> dict:
    """Key -> existing ORM object, for the whole table.

    The canonical tables hold thousands of rows, not millions, so reading the
    keys once is cheaper than a per-row probe — and it is what makes an exact
    inserted/updated/unchanged split possible.
    """
    rows = session.execute(select(model)).scalars().all()
    return {tuple(getattr(row, column) for column in key_columns): row for row in rows}


def load_rows(
    session: Session,
    model,
    rows: list[dict],
    key_columns: tuple[str, ...],
    compare_columns: tuple[str, ...] | None = None,
    *,
    dry_run: bool = False,
) -> TableStats:
    """Upsert rows and report exactly what happened to each one."""
    stats = TableStats(table=model.__tablename__, source_rows=len(rows), accepted_rows=len(rows))
    if not rows:
        return stats

    compare = compare_columns or tuple(
        column.name for column in model.__table__.columns if column.name not in {"id", "created_at", "updated_at"}
    )
    index = existing_index(session, model, key_columns)

    to_write: list[dict] = []
    for row in rows:
        key = tuple(row.get(column) for column in key_columns)
        current = index.get(key)
        if current is None:
            stats.inserted_rows += 1
            to_write.append(row)
            continue
        if all(values_match(current.__dict__.get(c), row.get(c)) for c in compare):
            stats.unchanged_rows += 1
        else:
            stats.updated_rows += 1
            to_write.append(row)

    if dry_run or not to_write:
        return stats

    update_columns = [c for c in compare if c not in set(key_columns)]
    for start in range(0, len(to_write), 500):
        chunk = to_write[start : start + 500]
        statement = pg_insert(model).values(chunk)
        statement = statement.on_conflict_do_update(
            index_elements=list(key_columns),
            set_={column: getattr(statement.excluded, column) for column in update_columns},
        )
        session.execute(statement)

    return stats


# --------------------------------------------------------------------------
# reference rows
# --------------------------------------------------------------------------


def period_rows() -> list[dict]:
    periods = {}
    for code in VALID_PERIODS:
        year, season = int(code[:4]), code[4]
        periods[code] = {
            "period_id": code,
            "year": year,
            "season": season,
            "label": f"{year} Season {season}",
            "sort_key": f"{year}:{season}",
            "has_district_coverage": False,
            "has_national_coverage": False,
        }
    coverage = PROCESSED_DIR / "data_coverage.csv"
    if coverage.exists():
        frame = pd.read_csv(coverage)
        for _, row in frame.iterrows():
            period = str(clean(row.get("period")) or "")
            entry = periods.get(period)
            if entry is None:
                continue
            if str(row.get("coverage_level")) == "district":
                entry["has_district_coverage"] = True
            else:
                entry["has_national_coverage"] = True
    return list(periods.values())


def unit_rows() -> list[dict]:
    return [{"unit_code": u.code, "name": u.name, "dimension": u.dimension} for u in UNITS]


def indicator_rows() -> list[dict]:
    return [
        {
            "indicator_code": item.code,
            "name": item.name,
            "description": item.description or None,
            "unit_code": item.unit,
            "domain": item.domain,
            "geographic_levels": ",".join(item.geographic_levels),
            "has_crop_dimension": item.has_crop_dimension,
            "source_domains": item.source_domains or None,
        }
        for item in INDICATORS
    ]


def source_rows(registry: pd.DataFrame) -> list[dict]:
    by_name = {
        str(clean(row.get("source"))): row
        for _, row in registry.iterrows()
        if clean(row.get("source"))
    }
    rows = []
    for source in SOURCES:
        entry = by_name.get(source.registry_name) if source.registry_name else None
        rows.append(
            {
                "source_id": source.source_id,
                "owner": source.owner,
                "dataset_name": source.dataset_name,
                "source_url": str(clean(entry.get("url"))) if entry is not None else None,
                "access_type": source.access_type,
                "license_or_terms": (
                    str(clean(entry.get("redistribution_note"))) if entry is not None else None
                ),
                "notes": None if source.is_official else "non-official source",
            }
        )
    return rows


def source_table_rows(panel: pd.DataFrame) -> list[dict]:
    """One row per published workbook table the panel draws on."""
    rows: dict[str, dict] = {}
    for _, row in panel.iterrows():
        source_id = str(clean(row.get("source_id")) or "")
        if not source_id:
            continue
        workbook = clean(row.get("source_workbook"))
        titles = parse_source_titles(clean(row.get("source_titles_raw")))
        sheets = clean(row.get("source_sheets"))
        if not sheets:
            continue
        for sheet in str(sheets).split("|"):
            sheet = sheet.strip()
            if not sheet:
                continue
            table_id = source_table_id(source_id, sheet)
            rows.setdefault(
                table_id,
                {
                    "source_table_id": table_id,
                    "source_id": source_id,
                    "workbook": str(workbook) if workbook else None,
                    "sheet": sheet,
                    # Stored verbatim, including a title whose numeric prefix
                    # looks wrong. The anomaly is the record.
                    "source_title_original": titles.get(sheet),
                    "period_id": None,
                    # The release-level URL lives on `data_source`; a single
                    # workbook table does not have its own URL in this source.
                    "source_url": None,
                    "extraction_date": None,
                    "granularity": "worksheet",
                },
            )
    return list(rows.values())


def observation_source_table_rows() -> list[dict]:
    """One provenance row per observation extract, at the granularity it supports.

    Some extracts name a single published table ("... - Table 14") and are
    attributed to that worksheet. Others name several, or none - and one file even
    draws on different tables in different rows - so each distinct (source, source
    description) pair is attributed on its own terms and lands either on a
    worksheet row or on the release-level (`dataset`) row.
    """
    rows: dict[str, dict] = {}
    for filename in sorted({item.source_file for item in INDICATORS}):
        path = PROCESSED_DIR / filename
        if not path.exists():
            continue
        frame = pd.read_csv(path)
        if frame.empty or "source_id" not in frame.columns:
            continue
        texts = frame["source"] if "source" in frame.columns else [None] * len(frame)
        seen: set[tuple[str, str]] = set()
        for raw_id, raw_text in zip(frame["source_id"], texts, strict=False):
            source_id = str(clean(raw_id) or "")
            if not source_id:
                continue
            text = clean(raw_text)
            key = (source_id, str(text or ""))
            if key in seen:
                continue
            seen.add(key)

            table_id, references = observation_source_attribution(source_id, text)
            rows.setdefault(
                table_id,
                {
                    "source_table_id": table_id,
                    "source_id": source_id,
                    # The extract is a flat table, so no workbook is named.
                    "workbook": None,
                    "sheet": references[0] if len(references) == 1 else None,
                    # The source's own description, verbatim.
                    "source_title_original": str(text) if text else None,
                    "period_id": None,
                    "source_url": None,
                    "extraction_date": None,
                    "granularity": "worksheet" if len(references) == 1 else "dataset",
                },
            )
    return list(rows.values())


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------


def validate_observation_value(
    indicator_code: str, unit_code: str, value: float
) -> str | None:
    """Unit-aware plausibility check for one observation value.

    Returns a rejection reason, or ``None`` when the value is acceptable.

    A share (a percentage) cannot exceed 100. Nothing may be negative. There is
    deliberately **no generic upper bound**: a hectare total can legitimately be
    large, and the old ``value <= 100000`` rule rejected a real published figure.
    """
    if value < 0:
        return "negative_value"
    unit = UNITS_BY_CODE.get(unit_code)
    if unit is not None and unit.dimension == "share" and value > 100:
        return f"share_above_100:{indicator_code}"
    return None


def dictionaries() -> tuple[dict, dict, dict]:
    """(crop_code -> crop_name, canonical crop name -> crop_code, district codes)."""
    crops_path = ROOT / "data" / "dictionaries" / "crops.csv"
    districts_path = ROOT / "data" / "dictionaries" / "districts.csv"
    crops = pd.read_csv(crops_path) if crops_path.exists() else pd.DataFrame()
    districts = pd.read_csv(districts_path) if districts_path.exists() else pd.DataFrame()

    crop_names = {
        str(row["crop_code"]): str(row["crop_name"]) for _, row in crops.iterrows()
    } if not crops.empty else {}
    by_name = {
        str(row["crop_name"]).strip().lower(): str(row["crop_code"])
        for _, row in crops.iterrows()
    } if not crops.empty else {}
    district_codes = (
        {str(code) for code in districts["district_code"].dropna()}
        if not districts.empty and "district_code" in districts.columns
        else set()
    )
    return crop_names, by_name, district_codes


# --------------------------------------------------------------------------
# fact rows
# --------------------------------------------------------------------------


def panel_rows(
    panel: pd.DataFrame, version: str, crop_names: dict, district_codes: set[str]
) -> tuple[list[dict], TableStats]:
    stats = TableStats(table="crop_productivity", source_rows=len(panel))
    out: list[dict] = []

    for _, row in panel.iterrows():
        raw_level = str(clean(row.get("geography_level")) or "").upper()
        level = PANEL_GEOGRAPHY_LEVELS.get(raw_level)
        if level is None:
            stats.rejected_rows += 1
            stats.reject_reasons[f"invalid_geography_level:{raw_level or 'blank'}"] += 1
            continue

        period_id = str(clean(row.get("period_code")) or "")
        if period_id not in VALID_PERIODS:
            stats.rejected_rows += 1
            stats.reject_reasons[f"invalid_period:{period_id or 'blank'}"] += 1
            continue

        crop_code = str(clean(row.get("crop_code")) or "")
        if not crop_code:
            stats.rejected_rows += 1
            stats.reject_reasons["missing_crop_code"] += 1
            continue

        district_code = clean(row.get("district_code"))
        district_code = str(district_code) if district_code else None
        geography_code = str(clean(row.get("geography_code")) or "").strip()
        if not geography_code:
            stats.rejected_rows += 1
            stats.reject_reasons["missing_geography_code"] += 1
            continue

        metrics = {column: as_float(row.get(column)) for column in METRIC_COLUMNS}
        negative = [c for c, v in metrics.items() if v is not None and v < 0]
        if negative:
            # A negative published area is not a value to publish; it is a source
            # error. Reject and record it rather than clamping to zero.
            stats.rejected_rows += 1
            stats.reject_reasons[f"negative_metric:{','.join(sorted(negative))}"] += 1
            continue

        quality_flag = "ok"
        notes: list[str] = []
        cultivated, harvested = metrics["cultivated_area_ha"], metrics["harvested_area_ha"]
        if cultivated is not None and harvested is not None and harvested > cultivated:
            quality_flag = "review"
            notes.append(
                "harvested_area_ha exceeds cultivated_area_ha; published value preserved unaltered"
            )
        if level == "district" and district_code and district_codes and district_code not in district_codes:
            quality_flag = "review" if quality_flag == "ok" else quality_flag
            notes.append(f"district_code {district_code} is not in the district dictionary")
        if crop_names and crop_code not in crop_names:
            quality_flag = "unknown"
            notes.append(f"crop_code {crop_code} is not in the crop dictionary")

        sheets_raw = clean(row.get("source_sheets"))
        sheets = [s.strip() for s in str(sheets_raw).split("|") if s.strip()] if sheets_raw else []
        source_id = str(clean(row.get("source_id")) or "")
        out.append(
            {
                "period_id": period_id,
                "year": int(clean(row.get("year")) or period_id[:4]),
                "season": period_id[4],
                "geography_level": level,
                "geography_code": geography_code,
                "province_code": None,  # the source publishes a province name, not a code
                "district_code": district_code,
                "district_name": str(clean(row.get("district"))) if clean(row.get("district")) else None,
                "province_name": str(clean(row.get("province"))) if clean(row.get("province")) else None,
                "crop_code": crop_code,
                "crop_name": str(clean(row.get("canonical_crop_name")) or crop_code),
                "farmer_scale": str(clean(row.get("farmer_scale")) or "all"),
                "row_scope": str(clean(row.get("row_scope"))) if clean(row.get("row_scope")) else None,
                **metrics,
                "harvest_ratio": as_float(row.get("harvest_ratio")),
                "cultivated_area_reported": as_bool(row.get("cultivated_area_reported")),
                "yield_reported": as_bool(row.get("yield_reported")),
                "source_id": source_id,
                # Only attribute a single table when the row genuinely came from
                # one. A multi-table row keeps the list in metadata instead of
                # claiming a precision the source does not support.
                "source_table_id": (
                    source_table_id(source_id, sheets[0])
                    if source_id and len(sheets) == 1
                    else None
                ),
                "dataset_version": version,
                "quality_flag": quality_flag,
                "quality_note": "; ".join(notes) or None,
                "is_synthetic": bool(as_bool(row.get("is_synthetic")) or False),
                # Provenance and descriptive columns that have no dedicated
                # column in the canonical table are carried here verbatim, so a
                # canonical read can reproduce the processed row's full contract
                # instead of dropping context a consumer still needs.
                "metadata_json": {
                    "source_sheets": sheets,
                    "metric_source_map": clean(row.get("metric_source_map")),
                    "period_override_reason": clean(row.get("period_override_reason")),
                    "source_row_min": clean(row.get("source_row_min")),
                    "source_period": clean(row.get("source_period")),
                    "crop_name_raw": clean(row.get("crop_name_raw")),
                    "agro_ecological_zone": clean(row.get("agro_ecological_zone")),
                    "row_scope_raw": clean(row.get("row_scope_raw")),
                    "category": clean(row.get("category")),
                    "perishability": clean(row.get("perishability")),
                    "cold_chain_recommended": clean(row.get("cold_chain_recommended")),
                    "source_release": clean(row.get("source_release")),
                    "source_workbook": clean(row.get("source_workbook")),
                    "source_titles_raw": clean(row.get("source_titles_raw")),
                    "processing_script": clean(row.get("processing_script")),
                    "processing_version": clean(row.get("processing_version")),
                },
            }
        )

    stats.accepted_rows = len(out)
    return out, stats


def observation_rows(
    version: str, crop_by_name: dict[str, str], district_codes: set[str]
) -> tuple[list[dict], TableStats]:
    """Build normalized observations from every indicator file in the catalogue.

    One candidate observation is one (file row x indicator) pair, which is the
    only meaningful denominator here: the files are wide, so a row count per file
    would neither describe the target table nor the work done.
    """
    stats = TableStats(table="agricultural_observation")
    out: list[dict] = []
    frames: dict[str, pd.DataFrame] = {}

    for indicator in INDICATORS:
        filename = indicator.source_file
        if filename not in frames:
            path = PROCESSED_DIR / filename
            frames[filename] = pd.read_csv(path) if path.exists() else pd.DataFrame()
        frame = frames[filename]
        if frame.empty:
            continue

        for _, row in frame.iterrows():
            stats.source_rows += 1
            value = as_float(row.get(indicator.source_column))
            if value is None:
                # Not measured. No row is written, and no zero is invented.
                continue

            # The unit is known here, so the bound is applied here rather than as
            # a generic rule in the schema (which cannot join `unit`).
            problem = validate_observation_value(indicator.code, indicator.unit, value)
            if problem:
                stats.rejected_rows += 1
                stats.reject_reasons[problem] += 1
                continue

            try:
                period_id = normalize_period(clean(row.get("year")), clean(row.get("season")))
            except (TypeError, ValueError):
                stats.rejected_rows += 1
                stats.reject_reasons["invalid_period"] += 1
                continue

            level = indicator.geographic_levels[0]
            district_code = clean(row.get("district_code"))
            district_code = str(district_code) if district_code else None
            geography_code = district_code or "RW"

            crop_code = None
            crop_variant = ""
            if indicator.has_crop_dimension:
                raw_code = clean(row.get("crop_code"))
                if raw_code:
                    crop_code = str(raw_code)
                else:
                    name = str(clean(row.get("canonical_crop_name")) or "").strip().lower()
                    crop_code = crop_by_name.get(name)
                if not crop_code:
                    stats.rejected_rows += 1
                    stats.reject_reasons["unknown_crop"] += 1
                    continue
                # NISR publishes use-of-production per variety, so several rows can
                # share a canonical crop. Keep the published variety rather than
                # collapsing them, which would overwrite distinct observations.
                published = str(clean(row.get("crop")) or "").strip()
                canonical = str(clean(row.get("canonical_crop_name")) or "").strip()
                if published and published.lower() != canonical.lower():
                    crop_variant = published

            note = None
            quality_flag = "ok"
            if district_code and district_codes and district_code not in district_codes:
                quality_flag = "review"
                note = f"district_code {district_code} is not in the district dictionary"

            # Provenance at the finest granularity the extract supports. A row
            # whose source description names one table is attributed to that
            # worksheet; otherwise it points at the release-level row and keeps
            # the (possibly several) table references in metadata.
            source_id = str(clean(row.get("source_id")) or "")
            source_text = clean(row.get("source"))
            if source_id:
                source_table, source_tables = observation_source_attribution(source_id, source_text)
            else:
                source_table, source_tables = None, []

            out.append(
                {
                    "period_id": period_id,
                    "geography_level": level,
                    "geography_code": geography_code,
                    "province_code": None,
                    "district_code": district_code,
                    "crop_code": crop_code,
                    "crop_variant": crop_variant,
                    "farmer_scale": "all",
                    "indicator_code": indicator.code,
                    "value": value,
                    "unit_code": indicator.unit,
                    "source_id": source_id,
                    "source_table_id": source_table,
                    "dataset_version": version,
                    "quality_flag": quality_flag,
                    "quality_note": note,
                    "is_synthetic": bool(as_bool(row.get("is_synthetic")) or False),
                    # The source file is wide, so the columns that describe the row
                    # rather than measure it (its district, agro-ecological zone,
                    # published crop name, source title) are carried here. Without
                    # them a canonical read could reproduce the numbers but not the
                    # row, and the processed contract could not be honoured.
                    "metadata_json": {
                        "source_column": indicator.source_column,
                        "year": clean(row.get("year")),
                        "season": clean(row.get("season")),
                        "district": clean(row.get("district")),
                        "province": clean(row.get("province")),
                        "agro_ecological_zone": clean(row.get("agro_ecological_zone")),
                        "source": clean(row.get("source")),
                        "source_period": clean(row.get("source_period")),
                        "processing_script": clean(row.get("processing_script")),
                        "processing_version": clean(row.get("processing_version")),
                        "crop": clean(row.get("crop")),
                        "canonical_crop_name": clean(row.get("canonical_crop_name")),
                        "shares_sum_pct": clean(row.get("shares_sum_pct")),
                        "shares_sum_ok": clean(row.get("shares_sum_ok")),
                        # Every published table this row draws on (`[]` when the
                        # source description names none).
                        "source_tables": source_tables,
                    },
                }
            )

    stats.accepted_rows = len(out)
    return out, stats


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Load processed datasets into PostgreSQL.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report exactly what would change without writing anything",
    )
    parser.add_argument("--url", default=None, help="override DATABASE_URL")
    parser.add_argument(
        "--skip-observations",
        action="store_true",
        help="load only the productivity panel (useful for a quick verification)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    problems = validate_catalogue()
    if problems:
        for problem in problems:
            log(f"ERROR catalogue: {problem}")
        return 1

    manifest_path = PROCESSED_DIR / "manifest.json"
    panel_path = PROCESSED_DIR / "crop_productivity.csv"
    if not manifest_path.exists() or not panel_path.exists():
        log("ERROR processed data missing. Run `make data` first.")
        return 1

    manifest = json.loads(manifest_path.read_text())
    version = content_version(manifest)
    log(f"dataset version: {version}")
    log(f"mode: {'DRY RUN (no writes)' if args.dry_run else 'apply'}")

    from app.core.config import get_settings

    url = args.url or get_settings().database_url
    engine = create_engine(url, pool_pre_ping=True, future=True)

    try:
        existing = set(inspect(engine).get_table_names())
    except Exception as error:  # noqa: BLE001 - report and exit, do not traceback
        log(f"ERROR cannot reach the database: {error}")
        return 1
    missing = [name for name in TABLES if name not in existing]
    if missing:
        log(f"ERROR canonical tables missing: {', '.join(missing)}")
        log("      apply the schema first:  make migrate")
        return 1

    registry_path = ROOT / "data" / "source_registry" / "data_sources.csv"
    registry = pd.read_csv(registry_path) if registry_path.exists() else pd.DataFrame()

    panel = pd.read_csv(panel_path)
    crop_names, crop_by_name, district_codes = dictionaries()

    log(f"panel rows: {len(panel)} | crops in dictionary: {len(crop_names)}")

    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = session_factory()
    started = datetime.now(UTC)
    report: list[TableStats] = []

    try:
        from app.models.analytics import ModelVersion  # noqa: F401  (registers metadata)
        from app.models.canonical import (
            AgriculturalObservation,
            CropProductivity,
            DataIngestionRun,
            DatasetVersion,
            Indicator,
            Period,
            SourceTable,
            Unit,
        )
        from app.models.ops import DataSource

        # --- reference ---------------------------------------------------
        report.append(
            load_rows(session, Period, period_rows(), ("period_id",), dry_run=args.dry_run)
        )
        report.append(load_rows(session, Unit, unit_rows(), ("unit_code",), dry_run=args.dry_run))
        report.append(
            load_rows(session, Indicator, indicator_rows(), ("indicator_code",), dry_run=args.dry_run)
        )
        report.append(
            load_rows(session, DataSource, source_rows(registry), ("source_id",), dry_run=args.dry_run)
        )
        report.append(
            load_rows(session, DatasetVersion, [{
                "version": version,
                "pipeline_version": manifest.get("pipeline_version"),
                "git_sha": manifest.get("git_sha"),
                "build_timestamp": manifest.get("build_timestamp"),
                "source_hash": hashlib.sha256(
                    json.dumps(manifest.get("sources", {}), sort_keys=True, default=str).encode()
                ).hexdigest(),
                "transformation_version": manifest.get("pipeline_version"),
                "row_counts": manifest.get("row_counts"),
                "validation": manifest.get("validation"),
                "warnings": manifest.get("validation", {}).get("issues"),
                "loaded_at": None if args.dry_run else started,
            }], ("version",), dry_run=args.dry_run)
        )
        # Panel worksheets and observation extracts share one provenance table,
        # so an observation's source_table_id always resolves.
        report.append(
            load_rows(
                session,
                SourceTable,
                source_table_rows(panel) + observation_source_table_rows(),
                ("source_table_id",),
                dry_run=args.dry_run,
            )
        )

        # Reference rows must be committed before the facts that reference them
        # if this run is a dry run and therefore writes nothing.
        if not args.dry_run:
            session.flush()

        # --- facts -------------------------------------------------------
        rows, panel_stats = panel_rows(panel, version, crop_names, district_codes)
        panel_written = load_rows(
            session,
            CropProductivity,
            rows,
            ("period_id", "geography_level", "geography_code", "crop_code", "farmer_scale"),
            dry_run=args.dry_run,
        )
        # Rows rejected during normalization never reached `load_rows`, so carry
        # both the original count and the reasons onto the reported stats.
        panel_written.source_rows = panel_stats.source_rows
        panel_written.rejected_rows = panel_stats.rejected_rows
        panel_written.reject_reasons.update(panel_stats.reject_reasons)
        report.append(panel_written)

        if not args.skip_observations:
            observations, observation_stats = observation_rows(
                version, crop_by_name, district_codes
            )
            written = load_rows(
                session,
                AgriculturalObservation,
                observations,
                (
                    "period_id",
                    "geography_level",
                    "geography_code",
                    "crop_code",
                    "crop_variant",
                    "farmer_scale",
                    "indicator_code",
                ),
                dry_run=args.dry_run,
            )
            # `load_rows` counts what reached the table; the rejected candidates
            # were dropped earlier, so carry them across explicitly.
            written.source_rows = observation_stats.source_rows
            written.accepted_rows = observation_stats.accepted_rows
            written.rejected_rows = observation_stats.rejected_rows
            written.reject_reasons.update(observation_stats.reject_reasons)
            report.append(written)

        # --- lineage -----------------------------------------------------
        finished = datetime.now(UTC)
        runs = [
            DataIngestionRun(
                dataset_version=version,
                target_table=stats.table,
                status="succeeded",
                started_at=started,
                finished_at=finished,
                dry_run=args.dry_run,
                **stats.as_run_kwargs(),
            )
            for stats in report
        ]
        if not args.dry_run:
            session.add_all(runs)
            session.commit()
        else:
            session.rollback()
    except Exception as error:  # noqa: BLE001 - a loader must report, not traceback
        session.rollback()
        log(f"ERROR load failed and was rolled back: {error}")
        return 1
    finally:
        session.close()

    # A rejected row is a defect worth failing on: the canonical tables would be
    # silently incomplete otherwise.
    rejected = sum(stats.rejected_rows for stats in report)
    _print_report(report, version, args.dry_run)
    if rejected:
        log(f"FAILED: {rejected} source rows were rejected; see the reasons above.")
        return 1
    log("done.")
    return 0


def _print_report(report: list[TableStats], version: str, dry_run: bool) -> None:
    log("")
    log(f"dataset_version {version}{'  (dry run)' if dry_run else ''}")
    header = (
        f"{'table':<28}{'source':>8}{'accepted':>10}{'rejected':>10}"
        f"{'inserted':>10}{'updated':>10}{'unchanged':>11}"
    )
    log(header)
    log("-" * len(header))
    for stats in report:
        log(
            f"{stats.table:<28}{stats.source_rows:>8}{stats.accepted_rows:>10}"
            f"{stats.rejected_rows:>10}{stats.inserted_rows:>10}{stats.updated_rows:>10}"
            f"{stats.unchanged_rows:>11}"
        )
    reasons: Counter = Counter()
    for stats in report:
        reasons.update(stats.reject_reasons)
    if reasons:
        log("")
        log("rejection reasons:")
        for reason, count in sorted(reasons.items()):
            log(f"  {reason}: {count}")


if __name__ == "__main__":
    sys.exit(main())
