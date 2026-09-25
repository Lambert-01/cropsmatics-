#!/usr/bin/env python3
"""Validate raw official datasets before any transform.

Checks: files present, required columns, duplicate keys, dictionary coverage,
signs, area/yield sanity, percentage ranges, mutually-exclusive sum
consistency, period validity and missingness.

Hard failures (``error``) make the pipeline exit non-zero. ``warn`` flags known
data-quality issues that are documented rather than "cleaned" -- official raw
values are never modified in place. ``info`` records semantics we verified but
deliberately do not enforce.

Writes:

* ``data/interim/validation_report.json``      machine-readable summary
* ``data/interim/area_consistency_report.csv`` per-row area discrepancy detail
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

KNOWN_SEASONS = {"A", "B", "C"}
# The package covers the NISR 2024-2026 releases. A year outside this range means
# an unexpected release (or a typo) and is treated as an error.
PLAUSIBLE_YEARS = {2024, 2025, 2026}
# District-level tables exist for exactly one release. Any other period in a
# district table would be silently rendered as a district estimate, so it fails.
DISTRICT_RELEASE = (2025, "B")

# Aggregate crop groups that must never be added to their own component crops.
TREND_AGGREGATES = {"Cereals", "Tubers and Roots", "Legumes and Pulses", "Vegetables and Fruits"}

# --- area discrepancy categories (report only, never applied to raw) -------
# A discrepancy is harvested area *exceeding* cultivated area. Harvested area
# below cultivated area is agronomically normal (partial harvest, crop failure)
# and is recorded as CONSISTENT, not as a defect.
ROUNDING_TOLERANCE_HA = 0.5
ROUNDING_TOLERANCE_PCT = 0.5
REVIEW_PCT = 5.0
EXCESS_EPSILON = 1e-6

# --- sum tolerances for mutually-exclusive percentage blocks --------------
SUM_TOLERANCE_PCT = 1.0


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


def _check_nonnegative(name: str, df: pd.DataFrame, columns: list[str]) -> None:
    for col in columns:
        if col in df.columns:
            negative = int((pd.to_numeric(df[col], errors="coerce") < 0).sum())
            if negative:
                issue("error", name, f"negative values in {col}", negative)


def _pct_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if str(c).endswith("_pct")]


def _check_pct_range(name: str, df: pd.DataFrame, columns: list[str] | None = None) -> None:
    """Every percentage field must sit inside 0-100."""
    for col in columns if columns is not None else _pct_columns(df):
        if col not in df.columns:
            continue
        values = pd.to_numeric(df[col], errors="coerce")
        bad = int(((values < 0) | (values > 100)).sum())
        if bad:
            issue("error", name, f"{col} outside 0-100", bad)


def _check_pct_sum(
    name: str,
    df: pd.DataFrame,
    columns: list[str],
    label: str,
    *,
    tolerance: float = SUM_TOLERANCE_PCT,
    allow_zero_row: bool = False,
    enforce: bool = True,
) -> None:
    """Check that a mutually-exclusive percentage block sums to 100.

    ``allow_zero_row`` covers districts that report no activity at all (e.g. a
    district with no irrigation), where a legitimate 0% total exists.
    ``enforce=False`` records the observation as ``info`` instead of ``warn``
    for blocks whose source semantics are multi-response.
    """
    present = [c for c in columns if c in df.columns]
    if not present:
        return
    totals = df[present].apply(pd.to_numeric, errors="coerce").sum(axis=1)
    mask = (totals - 100.0).abs() > tolerance
    if allow_zero_row:
        mask &= totals > tolerance
    count = int(mask.sum())
    if count:
        # Only the count is recorded; raw values are never modified in place.
        issue(
            "warn" if enforce else "info",
            name,
            f"{label} does not sum to 100% (tolerance {tolerance})",
            count,
        )


def _check_period(name: str, df: pd.DataFrame, *, district_level: bool = False) -> None:
    """Validate season codes and years, and record the observed periods.

    This checks *validity*, not a fixed allow-list: the national tables legitimately
    publish different period sets from each other. District tables, by contrast,
    must contain exactly the single district release, otherwise a district value
    would be presented for a period that has no district data.
    """
    _check_columns(name, df, ["year", "season"])
    if not {"year", "season"}.issubset(df.columns):
        return

    raw_seasons = df["season"].dropna().astype(str)
    bad_season = sorted(set(raw_seasons) - KNOWN_SEASONS)
    if bad_season:
        issue("error", name, f"unknown season codes: {bad_season}")

    years = {int(y) for y in pd.to_numeric(df["year"], errors="coerce").dropna().unique()}
    bad_year = sorted(years - PLAUSIBLE_YEARS)
    if bad_year:
        issue("error", name, f"years outside 2024-2026: {bad_year}")

    periods = sorted(f"{int(y)}{s}" for y, s in zip(df["year"], raw_seasons, strict=False))
    observed = sorted(set(periods))
    issue("info", name, f"periods observed: {observed}", len(observed))

    if district_level:
        unexpected = [p for p in observed if p != f"{DISTRICT_RELEASE[0]}{DISTRICT_RELEASE[1]}"]
        if unexpected:
            issue(
                "error",
                name,
                f"district table contains non-district periods {unexpected} "
                f"(only {DISTRICT_RELEASE[0]}-{DISTRICT_RELEASE[1]} has district rows)",
            )
        else:
            issue(
                "info",
                name,
                f"district release confined to {DISTRICT_RELEASE[0]}-{DISTRICT_RELEASE[1]}",
            )


# --- 01 district crop productivity -----------------------------------------


def _validate_district_crop(known_districts: set[str], known_crops: set[str]) -> None:
    name = "01_district_crop_productivity"
    prod = pd.read_csv(raw_path("district_crop_productivity"))
    _check_columns(
        name,
        prod,
        [
            "year",
            "season",
            "district",
            "crop",
            "cultivated_area_ha",
            "harvested_area_ha",
            "production_mt",
            "yield_kg_ha",
        ],
    )
    _check_duplicate_keys(name, prod, ["year", "season", "district", "crop"])
    _check_period(name, prod, district_level=True)
    _dictionary_coverage(name, prod, "district", known_districts)
    _dictionary_coverage(name, prod, "crop", known_crops)
    _check_nonnegative(
        name,
        prod,
        ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_kg_ha"],
    )

    if "cultivated_area_ha" in prod.columns:
        blank = int(prod["cultivated_area_ha"].isna().sum())
        if blank:
            issue(
                "warn",
                name,
                "blank cultivated_area_ha (no crop reported in district) - preserved as null",
                blank,
            )

    # Yield consistency: production_mt * 1000 / harvested_area_ha ~= yield_kg_ha
    if {"production_mt", "harvested_area_ha", "yield_kg_ha"}.issubset(prod.columns):
        computed = (prod["production_mt"] * 1000.0 / prod["harvested_area_ha"]).replace(
            [float("inf"), float("-inf")], pd.NA
        )
        mismatch = int(((computed - prod["yield_kg_ha"]).abs() > 1.0).sum())
        if mismatch:
            issue(
                "warn",
                name,
                "yield_kg_ha inconsistent with production/area (tolerance 1 kg/ha)",
                mismatch,
            )

    _area_consistency_detail(prod)


def _area_consistency_detail(prod: pd.DataFrame) -> None:
    """Write a per-row area discrepancy report. Official values are untouched.

    ``harvested_area_ha`` legitimately exceeds ``cultivated_area_ha`` in some
    rows (partial replanting, re-measurement between visits). Rather than
    "fixing" the official figures, each row is categorised so reviewers can see
    whether the difference looks like rounding or a genuine reporting issue.
    """
    if not {"cultivated_area_ha", "harvested_area_ha"}.issubset(prod.columns):
        return

    name = "01_district_crop_productivity"
    df = prod.copy()
    cultivated = pd.to_numeric(df["cultivated_area_ha"], errors="coerce")
    harvested = pd.to_numeric(df["harvested_area_ha"], errors="coerce")
    df["area_difference_ha"] = harvested - cultivated
    df["area_difference_pct"] = (df["area_difference_ha"].abs() / cultivated * 100).where(
        cultivated > 0
    )
    excess = df["area_difference_ha"] > EXCESS_EPSILON

    def categorise(row: pd.Series) -> str:
        if pd.isna(row["area_difference_ha"]):
            return "MISSING_CULTIVATED_AREA"
        diff = row["area_difference_ha"]
        if diff <= EXCESS_EPSILON:
            # Harvested at or below cultivated: normal, not a discrepancy.
            return "CONSISTENT"
        share = row["area_difference_pct"]
        if diff <= ROUNDING_TOLERANCE_HA or (pd.notna(share) and share <= ROUNDING_TOLERANCE_PCT):
            return "ROUNDING_TOLERANCE"
        if pd.isna(share) or share <= REVIEW_PCT:
            return "REVIEW"
        return "SEVERE"

    df["area_consistency_flag"] = df.apply(categorise, axis=1)

    detail_cols = [
        "year",
        "season",
        "district",
        "crop",
        "cultivated_area_ha",
        "harvested_area_ha",
        "area_difference_ha",
        "area_difference_pct",
        "area_consistency_flag",
    ]
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    df[detail_cols].to_csv(INTERIM_DIR / "area_consistency_report.csv", index=False)

    # Historic, documented warning - kept with identical semantics (strict excess).
    over = int(excess.sum())
    if over:
        issue(
            "warn",
            name,
            "harvested_area_ha exceeds cultivated_area_ha (raw values preserved; "
            "categorised in interim/area_consistency_report.csv)",
            over,
        )
    for flag in ("ROUNDING_TOLERANCE", "REVIEW", "SEVERE"):
        count = int((df["area_consistency_flag"] == flag).sum())
        if count:
            issue(
                "warn",
                name,
                f"area consistency {flag} (see interim/area_consistency_report.csv)",
                count,
            )


# --- 02 district factors ----------------------------------------------------


def _validate_district_factors(known_districts: set[str]) -> None:
    name = "02_district_productivity_factors"
    factors = pd.read_csv(raw_path("district_factors"))
    _check_columns(name, factors, ["year", "season", "district"])
    _check_duplicate_keys(name, factors, ["year", "season", "district"])
    _check_period(name, factors, district_level=True)
    _dictionary_coverage(name, factors, "district", known_districts)
    _check_pct_range(name, factors)


# --- 03 irrigation ----------------------------------------------------------


def _validate_irrigation(known_districts: set[str]) -> None:
    name = "03_irrigation_water"
    df = pd.read_csv(raw_path("irrigation_water"))

    _check_columns(
        name,
        df,
        [
            "year",
            "season",
            "district",
            "surface_irrigation_pct",
            "flood_irrigation_pct",
            "drip_irrigation_pct",
            "sprinkler_irrigation_pct",
            "pivot_irrigation_pct",
            "traditional_irrigation_pct",
            "rainwater_source_pct",
            "water_treatment_source_pct",
            "underground_source_pct",
            "lake_stream_source_pct",
            "water_catchment_source_pct",
        ],
    )
    _check_duplicate_keys(name, df, ["year", "season", "district"])
    _check_period(name, df, district_level=True)
    _dictionary_coverage(name, df, "district", known_districts)
    _check_nonnegative(name, df, _pct_columns(df))
    _check_pct_range(name, df)

    if "district" in df.columns:
        n = int(df["district"].nunique())
        if n != 30:
            issue("error", name, f"expected 30 unique districts, found {n}")
        else:
            issue("info", name, "30 unique districts present", n)

    # Technique mix is a single-response allocation: it sums to 100% (or to 0%
    # for a district reporting no irrigation at all).
    _check_pct_sum(
        name,
        df,
        [
            "surface_irrigation_pct",
            "flood_irrigation_pct",
            "drip_irrigation_pct",
            "sprinkler_irrigation_pct",
            "pivot_irrigation_pct",
            "traditional_irrigation_pct",
        ],
        "irrigation technique mix (single-response, 0% allowed)",
        allow_zero_row=True,
    )
    # Water source is also a complete allocation over the same respondents.
    _check_pct_sum(
        name,
        df,
        [
            "rainwater_source_pct",
            "water_treatment_source_pct",
            "underground_source_pct",
            "lake_stream_source_pct",
            "water_catchment_source_pct",
        ],
        "irrigation water-source mix (single-response, 0% allowed)",
        allow_zero_row=True,
    )
    issue(
        "info",
        name,
        "field semantics: *_irrigation_pct = technique mix, *_source_pct = water source mix (both single-response)",
    )


# --- 04 erosion -------------------------------------------------------------


def _validate_erosion(known_districts: set[str]) -> None:
    name = "04_erosion_control"
    df = pd.read_csv(raw_path("erosion_control"))

    _check_columns(name, df, ["year", "season", "district"])
    _check_duplicate_keys(name, df, ["year", "season", "district"])
    _check_period(name, df, district_level=True)
    _dictionary_coverage(name, df, "district", known_districts)
    _check_nonnegative(name, df, _pct_columns(df))
    _check_pct_range(name, df)

    severity = [
        "erosion_severe_pct",
        "erosion_moderate_pct",
        "erosion_low_pct",
        "erosion_very_low_pct",
    ]
    if not all(c in df.columns for c in severity):
        issue("error", name, f"missing erosion severity columns {severity}")
    else:
        # Severity bands are mutually exclusive: the district's land falls into
        # exactly one band, so the four shares must account for 100%.
        _check_pct_sum(name, df, severity, "erosion severity bands (mutually exclusive)")

    # Control techniques are a multi-response question: a farmer can use a
    # ditch AND terraces AND mulch, so a 100% sum is NOT required and is only
    # reported informationally.
    techniques = [c for c in df.columns if c.endswith("_pct") and c not in severity]
    _check_pct_sum(
        name,
        df,
        techniques,
        "erosion-control techniques (multi-response - informational only)",
        tolerance=2.0,
        enforce=False,
    )
    issue(
        "info",
        name,
        "field semantics: erosion_*_pct = severity bands (mutually exclusive); other *_pct = multi-response techniques",
    )


# --- 05 post-harvest use ----------------------------------------------------


def _validate_postharvest(known_crops: set[str]) -> None:
    name = "05_crop_postharvest_use"
    df = pd.read_csv(raw_path("crop_postharvest_use"))

    _check_columns(name, df, ["year", "season", "crop"])
    _check_duplicate_keys(name, df, ["year", "season", "crop"])
    _check_period(name, df)
    _check_nonnegative(name, df, _pct_columns(df))
    _check_pct_range(name, df)

    if "crop" in df.columns:
        # Raw crop names may be aliases that normalize_crops.py resolves into the
        # dictionary (e.g. "Cooking banana" -> "Banana"). Only names that are
        # neither canonical nor a known alias are a real problem.
        from scripts.data.normalize_crops import ALIASES

        resolvable = known_crops | set(ALIASES)
        unknown = sorted(set(df["crop"].dropna().astype(str)) - resolvable)
        if unknown:
            issue("error", name, f"crops with no canonical mapping or alias: {unknown}")
        else:
            issue("info", name, "every crop maps to the dictionary or a known alias")

    # Production use is a mutually exhaustive allocation of the crop: every
    # tonne is sold, consumed, stored, lost, re-used or otherwise disposed of.
    allocation = [
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
    ]
    missing = [c for c in allocation if c not in df.columns]
    if missing:
        issue("error", name, f"missing production-use share columns {missing}")
    else:
        _check_pct_sum(name, df, allocation, "production-use allocation (mutually exhaustive)")


# --- 06 national crop trends ------------------------------------------------


def _validate_national_trends() -> None:
    name = "06_national_crop_trends"
    df = pd.read_csv(raw_path("national_crop_trends"))

    _check_columns(
        name,
        df,
        ["year", "season", "crop", "cultivated_area_ha", "harvested_area_ha", "production_mt"],
    )
    _check_duplicate_keys(name, df, ["year", "season", "crop"])
    _check_period(name, df)
    _check_nonnegative(
        name, df, ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_mt_ha"]
    )

    if "crop" in df.columns:
        present = set(df["crop"].dropna().astype(str))
        aggregates = present & TREND_AGGREGATES
        if not aggregates:
            issue("warn", name, "no aggregate crop groups found - review the aggregate list")
        issue(
            "info",
            name,
            f"aggregate groups present (never summed with their components): {sorted(aggregates)}",
            len(aggregates),
        )

    # Consistency where a yield was published: production / harvested area.
    if {"production_mt", "harvested_area_ha", "yield_mt_ha"}.issubset(df.columns):
        computed = (df["production_mt"] / df["harvested_area_ha"]).replace(
            [float("inf"), float("-inf")], pd.NA
        )
        diff = (computed - df["yield_mt_ha"]).abs()
        mismatch = int((diff > 0.05).sum())
        if mismatch:
            issue(
                "warn",
                name,
                "yield_mt_ha inconsistent with production/harvested area (tolerance 0.05 mt/ha)",
                mismatch,
            )
        blank_yield = int(df["yield_mt_ha"].isna().sum())
        if blank_yield:
            issue(
                "info",
                name,
                "blank yield_mt_ha - aggregate groups carry no published yield (preserved as null)",
                blank_yield,
            )


# --- 07 national input trends ----------------------------------------------


def _validate_national_inputs() -> None:
    name = "07_national_input_trends"
    df = pd.read_csv(raw_path("national_input_trends"))

    _check_columns(name, df, ["year", "season"])
    _check_duplicate_keys(name, df, ["year", "season"])
    _check_period(name, df)
    _check_pct_range(name, df)
    _check_nonnegative(name, df, _pct_columns(df))

    # Adoption percentages are separate practice questions, not one allocation.
    issue(
        "info",
        name,
        "adoption percentages are independent practice questions and are not required to sum to 100",
    )


# --- 08 cold chain context --------------------------------------------------


def _validate_cold_chain(known_districts: set[str]) -> None:
    name = "08_verified_cold_chain_context"
    df = pd.read_csv(raw_path("cold_chain_context"))

    _check_columns(name, df, ["year", "district", "capacity", "capacity_note", "source"])
    _check_duplicate_keys(name, df, ["year", "district"])
    _dictionary_coverage(name, df, "district", known_districts)

    if "source" in df.columns:
        blank_source = int(df["source"].isna().sum() + (df["source"].astype(str).str.strip() == "").sum())
        if blank_source:
            issue("error", name, "rows without a source attribution", blank_source)

    if "capacity" in df.columns:
        verified = int(df["capacity"].notna().sum())
        if verified:
            issue(
                "warn",
                name,
                "capacity values present - confirm they are officially verified before publishing",
                verified,
            )
        else:
            issue(
                "info",
                name,
                "capacity is null on every row (correct: no facility-level capacity is published)",
            )

    # Guard the null -> 0 rule explicitly: a blank capacity must never be read
    # back as a zero-capacity facility.
    if "capacity" in df.columns:
        as_numeric = pd.to_numeric(df["capacity"], errors="coerce").fillna(-1)
        if (as_numeric == 0).any():
            issue("error", name, "capacity contains 0 - null capacity must never become 0")

    coordinate_cols = [c for c in ("latitude", "longitude", "lat", "lon") if c in df.columns]
    if coordinate_cols:
        populated = int(df[coordinate_cols].notna().any(axis=1).sum())
        if populated:
            issue(
                "warn",
                name,
                f"coordinates present in {coordinate_cols} - only publish if officially verified",
                populated,
            )
    else:
        issue("info", name, "no coordinate columns: exact facility location is not published")


# --- 10 / 11 MINAGRI national add-on ---------------------------------------


def _validate_postharvest_infrastructure() -> None:
    name = "10_national_postharvest_infrastructure"
    df = pd.read_csv(raw_path("postharvest_infrastructure"))

    _check_columns(
        name,
        df,
        [
            "infrastructure_type",
            "existing_number",
            "existing_capacity_mt",
            "new_number",
            "new_capacity_mt",
            "total_number",
            "total_capacity_mt",
            "period",
            "geographic_level",
            "source_url",
        ],
    )
    _check_duplicate_keys(name, df, ["infrastructure_type"])
    _check_nonnegative(
        name,
        df,
        [
            "existing_number",
            "existing_capacity_mt",
            "new_number",
            "new_capacity_mt",
            "total_number",
            "total_capacity_mt",
        ],
    )

    # This table is national. Joining it to districts would put a national total
    # on a single facility, which is exactly the error we are guarding against.
    if "geographic_level" in df.columns:
        levels = sorted(set(df["geographic_level"].dropna().astype(str)))
        if levels != ["national"]:
            issue("error", name, f"expected geographic_level == national, found {levels}")
        else:
            issue("info", name, "geographic_level == national on every row (never district-joined)")

    for total_col, parts in [
        ("total_number", ("existing_number", "new_number")),
        ("total_capacity_mt", ("existing_capacity_mt", "new_capacity_mt")),
    ]:
        if {total_col, *parts}.issubset(df.columns):
            diff = (
                pd.to_numeric(df[total_col], errors="coerce")
                - pd.to_numeric(df[parts[0]], errors="coerce")
                - pd.to_numeric(df[parts[1]], errors="coerce")
            ).abs()
            mismatched = int((diff > 1e-6).sum())
            if mismatched:
                issue(
                    "error",
                    name,
                    f"{total_col} != {parts[0]} + {parts[1]} on {mismatched} row(s)",
                    mismatched,
                )

    if "source_url" in df.columns:
        blank = int(df["source_url"].isna().sum())
        if blank:
            issue("error", name, "rows without a source URL", blank)


def _validate_cold_chain_network(known_districts: set[str]) -> None:
    name = "11_cold_chain_network_summary"
    df = pd.read_csv(raw_path("cold_chain_network_summary"))

    _check_columns(name, df, ["indicator", "value", "unit", "period", "geographic_level", "source_url"])
    _check_duplicate_keys(name, df, ["indicator"])
    _check_nonnegative(name, df, ["value"])

    if "source_url" in df.columns:
        blank = int(df["source_url"].isna().sum())
        if blank:
            issue("error", name, "rows without a source URL", blank)

    district_row = df[df["indicator"] == "Program districts named"]
    if district_row.empty:
        issue("warn", name, "no 'Program districts named' indicator - program coverage unknown")
    else:
        names = [
            n.strip() for n in str(district_row.iloc[0]["notes"]).split(",") if n.strip()
        ]
        unknown = sorted(set(names) - known_districts)
        if unknown:
            issue("error", name, f"program districts not in the district dictionary: {unknown}")
        declared = district_row.iloc[0]["value"]
        if pd.notna(declared) and int(declared) != len(names):
            issue(
                "error",
                name,
                f"declared district count ({int(declared)}) != named districts ({len(names)})",
            )
        issue("info", name, f"program districts verified: {names}", len(names))


def main() -> int:
    log(f"validate_raw (pipeline v{PIPELINE_VERSION})")

    districts = pd.read_csv(DICTS_DIR / "districts.csv")
    crops = pd.read_csv(DICTS_DIR / "crops.csv")
    known_districts = set(districts["district"].astype(str))
    known_crops = set(crops["crop_name"].astype(str))

    _validate_district_crop(known_districts, known_crops)
    _validate_district_factors(known_districts)
    _validate_irrigation(known_districts)
    _validate_erosion(known_districts)
    _validate_postharvest(known_crops)
    _validate_national_trends()
    _validate_national_inputs()
    _validate_cold_chain(known_districts)
    _validate_postharvest_infrastructure()
    _validate_cold_chain_network(known_districts)

    report = {
        "pipeline_version": PIPELINE_VERSION,
        "status": "failed" if HARD_FAIL else "passed",
        "errors": sum(1 for i in ISSUES if i["level"] == "error"),
        "warnings": sum(1 for i in ISSUES if i["level"] == "warn"),
        "infos": sum(1 for i in ISSUES if i["level"] == "info"),
        "issues": ISSUES,
    }
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    out = INTERIM_DIR / "validation_report.json"
    out.write_text(json.dumps(report, indent=2))

    for i in ISSUES:
        log(f"  {i['level']:5s} {i['dataset']}: {i['message']} ({i['count']})")
    log(
        f"status={report['status']} errors={report['errors']} "
        f"warnings={report['warnings']} infos={report['infos']}"
    )
    log(f"report -> {out.relative_to(INTERIM_DIR.parent.parent)}")
    return 1 if HARD_FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
