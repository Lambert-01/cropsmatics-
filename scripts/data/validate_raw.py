#!/usr/bin/env python3
"""Validate raw official datasets before any transform.

Checks: files present, required columns, duplicate keys, dictionary coverage,
signs, area/yield sanity and missingness. Writes a machine-readable report to
``data/interim/validation_report.json`` and exits non-zero on hard failures.
"""

from __future__ import annotations

import json
import sys

import pandas as pd

from scripts.data.common import (
    DICTS_DIR,
    INTERIM_DIR,
    PIPELINE_VERSION,
    log,
    raw_path,
)

HARD_FAIL = False
ISSUES: list[dict] = []


def issue(level: str, dataset: str, message: str, count: int = 0) -> None:
    global HARD_FAIL
    if level == "error":
        HARD_FAIL = True
    ISSUES.append({"level": level, "dataset": dataset, "message": message, "count": count})


def _check_columns(name: str, df: pd.DataFrame, required: list[str]) -> None:
    missing = [c for c in required if c not in df.columns]
    if missing:
        issue("error", name, f"missing required columns: {missing}")


def _check_duplicate_keys(name: str, df: pd.DataFrame, keys: list[str]) -> None:
    if all(k in df.columns for k in keys):
        dupes = int(df.duplicated(subset=keys).sum())
        if dupes:
            issue("error", name, f"duplicate key rows on {keys}", dupes)


def _dictionary_coverage(name: str, df: pd.DataFrame, column: str, allowed: set[str]) -> None:
    if column not in df.columns:
        return
    unknown = sorted(set(df[column].dropna().astype(str)) - allowed)
    if unknown:
        issue("error", name, f"values in '{column}' not in dictionary: {unknown}")


def main() -> int:
    log(f"validate_raw (pipeline v{PIPELINE_VERSION})")

    districts = pd.read_csv(DICTS_DIR / "districts.csv")
    crops = pd.read_csv(DICTS_DIR / "crops.csv")
    known_districts = set(districts["district"].astype(str))
    known_crops = set(crops["crop_name"].astype(str))

    # --- 01 district crop productivity -------------------------------------
    prod = pd.read_csv(raw_path("district_crop_productivity"))
    _check_columns(
        "01_district_crop_productivity",
        prod,
        ["year", "season", "district", "crop", "cultivated_area_ha", "harvested_area_ha",
         "production_mt", "yield_kg_ha"],
    )
    _check_duplicate_keys("01_district_crop_productivity", prod, ["year", "season", "district", "crop"])
    _dictionary_coverage("01_district_crop_productivity", prod, "district", known_districts)
    _dictionary_coverage("01_district_crop_productivity", prod, "crop", known_crops)

    num = ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_kg_ha"]
    for col in num:
        if col in prod.columns:
            negative = int((prod[col] < 0).sum())
            if negative:
                issue("error", "01_district_crop_productivity", f"negative values in {col}", negative)
    if {"harvested_area_ha", "cultivated_area_ha"}.issubset(prod.columns):
        over = int((prod["harvested_area_ha"] > prod["cultivated_area_ha"] + 1e-6).sum())
        if over:
            issue("warn", "01_district_crop_productivity",
                  "harvested_area_ha exceeds cultivated_area_ha (rounding?)", over)
    if "cultivated_area_ha" in prod.columns:
        blank = int(prod["cultivated_area_ha"].isna().sum())
        if blank:
            issue("warn", "01_district_crop_productivity",
                  "blank cultivated_area_ha (no crop reported in district)", blank)
    # Yield consistency: production_mt * 1000 / harvested_area_ha ~= yield_kg_ha
    if {"production_mt", "harvested_area_ha", "yield_kg_ha"}.issubset(prod.columns):
        computed = (prod["production_mt"] * 1000.0 / prod["harvested_area_ha"]).replace(
            [float("inf"), float("-inf")], pd.NA
        )
        mismatch = int(((computed - prod["yield_kg_ha"]).abs() > 1.0).sum())
        if mismatch:
            issue("warn", "01_district_crop_productivity",
                  "yield_kg_ha inconsistent with production/area (tolerance 1 kg/ha)", mismatch)

    # --- 02 district factors -----------------------------------------------
    factors = pd.read_csv(raw_path("district_factors"))
    _check_columns("02_district_productivity_factors", factors, ["year", "season", "district"])
    _check_duplicate_keys("02_district_productivity_factors", factors, ["year", "season", "district"])
    _dictionary_coverage("02_district_productivity_factors", factors, "district", known_districts)
    pct_cols = [c for c in factors.columns if c.endswith("_pct")]
    for col in pct_cols:
        bad = int(((factors[col] < 0) | (factors[col] > 100)).sum())
        if bad:
            issue("error", "02_district_productivity_factors", f"{col} outside 0-100", bad)

    # --- 05 post-harvest ----------------------------------------------------
    post = pd.read_csv(raw_path("crop_postharvest_use"))
    _check_columns("05_crop_postharvest_use", post, ["year", "season", "crop"])
    _check_duplicate_keys("05_crop_postharvest_use", post, ["year", "season", "crop"])

    # --- 06 / 07 national ---------------------------------------------------
    trends = pd.read_csv(raw_path("national_crop_trends"))
    _check_columns("06_national_crop_trends", trends, ["year", "season", "crop"])
    inputs = pd.read_csv(raw_path("national_input_trends"))
    _check_columns("07_national_input_trends", inputs, ["year", "season"])

    report = {
        "pipeline_version": PIPELINE_VERSION,
        "status": "failed" if HARD_FAIL else "passed",
        "errors": sum(1 for i in ISSUES if i["level"] == "error"),
        "warnings": sum(1 for i in ISSUES if i["level"] == "warn"),
        "issues": ISSUES,
    }
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    out = INTERIM_DIR / "validation_report.json"
    out.write_text(json.dumps(report, indent=2))

    for i in ISSUES:
        log(f"  {i['level']:5s} {i['dataset']}: {i['message']} ({i['count']})")
    log(f"status={report['status']} errors={report['errors']} warnings={report['warnings']}")
    log(f"report -> {out.relative_to(INTERIM_DIR.parent.parent)}")
    return 1 if HARD_FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
