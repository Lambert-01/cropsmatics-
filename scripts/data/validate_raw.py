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
    PROCESSED_DIR,
    PROCESSED_FILES,
    VALID_PERIODS,
    YIELD_CONSISTENCY_ABS_TOLERANCE_KG_HA,
    YIELD_CONSISTENCY_REL_TOLERANCE,
    log,
    raw_path,
)

HARD_FAIL = False
ISSUES: list[dict] = []

KNOWN_SEASONS = {"A", "B", "C"}
# The package covers every NISR release the source registry lists (2022-2026).
# The set is derived from the canonical period dimension rather than hardcoded,
# so adding a release updates the check instead of silently failing it. A year
# outside this set still means an unexpected release (or a typo) and is an error.
PLAUSIBLE_YEARS = {int(period[:4]) for period in VALID_PERIODS}
# The canonical period dimension: exactly the periods NISR has published as of
# September 2026. A period outside this set is either a typo or a fabricated
# season (2026C does not exist), so it fails.
EXPECTED_PERIODS = frozenset(VALID_PERIODS)

# Canonical market price types (see scripts/data/ingest_market_prices.py).
MARKET_PRICE_TYPES = (
    "FARMGATE",
    "PRODUCER",
    "WHOLESALE",
    "RETAIL",
    "ASSEMBLY",
    "UNSPECIFIED",
)

# The legacy curated pack is a single-release district extract (2025 Season B).
# It stays restricted to exactly that period - a 2024 district value appearing
# in it would be silently presented as a 2025B observation.
LEGACY_DISTRICT_PERIODS = frozenset({"2025B"})

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


def _check_period(
    name: str,
    df: pd.DataFrame,
    *,
    allowed_periods: frozenset[str] | set[str] | None = None,
) -> None:
    """Validate season codes and years, and record the observed periods.

    This checks *validity*: the national tables legitimately publish different
    period sets from each other, so no allow-list is imposed unless the caller
    passes ``allowed_periods``. District-keyed datasets do pass one, because a
    district value published for a period with no district coverage would be
    presented as a real district observation.
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

    if allowed_periods is not None:
        unexpected = sorted(set(observed) - set(allowed_periods))
        if unexpected:
            issue(
                "error",
                name,
                f"unexpected periods {unexpected}; allowed={sorted(allowed_periods)}",
            )
        else:
            issue(
                "info",
                name,
                f"period set within allowed {sorted(allowed_periods)}",
                len(observed),
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
    _check_period(name, prod, allowed_periods=LEGACY_DISTRICT_PERIODS)
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
    _check_period(name, factors, allowed_periods=LEGACY_DISTRICT_PERIODS)
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
    _check_period(name, df, allowed_periods=LEGACY_DISTRICT_PERIODS)
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
    _check_period(name, df, allowed_periods=LEGACY_DISTRICT_PERIODS)
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


def _validate_crop_productivity(known_districts: set[str], known_crops: set[str]) -> None:
    """Validate the multi-period canonical panel built from the SAS extraction.

    This dataset spans every published period (2024A-2026B), so it is checked
    against the canonical period dimension rather than a single release.
    """
    name = "crop_productivity (multi-period)"
    path = PROCESSED_DIR / PROCESSED_FILES["crop_productivity"]
    if not path.exists():
        issue("info", name, "not built in this run (run build_crop_productivity.py)")
        return

    df = pd.read_csv(path)
    _check_columns(
        name,
        df,
        [
            "period_code",
            "year",
            "season",
            "geography_level",
            "geography_code",
            "crop_code",
            "cultivated_area_ha",
            "harvested_area_ha",
            "production_mt",
            "yield_kg_ha",
            "source_id",
        ],
    )
    if not {"year", "season"}.issubset(df.columns):
        return

    _check_period(name, df, allowed_periods=EXPECTED_PERIODS)
    # ``farmer_scale`` is part of the key: the national total and the SSF/LSF
    # breakdown are separate published series for the same geography and crop.
    _check_duplicate_keys(
        name,
        df,
        ["period_code", "geography_level", "geography_code", "crop_code", "farmer_scale"],
    )
    _dictionary_coverage(name, df, "district", known_districts)
    # ``crop_name_raw`` holds the normalized published crop label, which the
    # ingest resolves to the dictionary before the panel is assembled.
    _dictionary_coverage(name, df, "crop_name_raw", known_crops)
    _check_nonnegative(
        name,
        df,
        ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_kg_ha"],
    )

    categories = _pct_columns(df)
    _check_pct_range(name, df, categories)

    if "source_id" in df.columns:
        blank = int(df["source_id"].isna().sum() + (df["source_id"].astype(str).str.strip() == "").sum())
        if blank:
            issue("error", name, "rows without source lineage", blank)
        else:
            issue("info", name, "every row carries a source_id")

    _check_published_yield_consistency(name, df)


def _check_published_yield_consistency(name: str, df: pd.DataFrame) -> None:
    """Reconcile published yield against published production / harvested area.

    NISR publishes yield independently of the other two, so they do not always
    agree. The shared policy in ``scripts/data/common.py`` is scale-aware: a gap
    within ``max(ABS, REL x published yield)`` is release *rounding* (the 2023
    workbook prints whole numbers) and is reported as info; a larger gap is a
    *material* source inconsistency and is reported as a warning naming the
    affected rows. Official values are never modified - the loader flags the
    same rows ``review`` so the UI can warn and a forecast trainer can exclude
    them.
    """
    if not {"production_mt", "harvested_area_ha", "yield_kg_ha"}.issubset(df.columns):
        return

    production = pd.to_numeric(df["production_mt"], errors="coerce")
    harvested = pd.to_numeric(df["harvested_area_ha"], errors="coerce")
    published = pd.to_numeric(df["yield_kg_ha"], errors="coerce")
    implied = (production * 1000.0 / harvested.where(harvested > 0)).replace(
        [float("inf"), float("-inf")], pd.NA
    )
    gap = (implied - published).abs()
    tolerance = published.abs().mul(YIELD_CONSISTENCY_REL_TOLERANCE).clip(
        lower=YIELD_CONSISTENCY_ABS_TOLERANCE_KG_HA
    )
    comparable = gap.notna() & published.notna()

    rounding = int((comparable & (gap <= tolerance)).sum())
    material = comparable & (gap > tolerance)
    if rounding:
        issue(
            "info",
            name,
            "published yield reconciles with production/area within rounding tolerance",
            rounding,
        )
    if bool(material.any()):
        keys = sorted(
            f"{row.period_code}/{row.row_scope}/{row.district or 'national'}/{row.crop_name_raw}"
            for row in df[material].itertuples()
        )
        issue(
            "warn",
            name,
            "published yield disagrees with production/area beyond the documented "
            f"tolerance ({YIELD_CONSISTENCY_ABS_TOLERANCE_KG_HA} kg/ha or "
            f"{YIELD_CONSISTENCY_REL_TOLERANCE:.0%}) - official values preserved, "
            f"rows flagged review: {', '.join(keys[:12])}"
            + (" ..." if len(keys) > 12 else ""),
            int(material.sum()),
        )


def _validate_market_prices() -> None:
    """Validate the provider-neutral market observation table.

    The rules that matter are the ones that protect meaning: an observation key
    must be unique, a price type must be one of the canonical buckets, and a
    RWF/kg figure may only exist when a documented mass conversion produced it.
    """
    name = "market_price_observation"
    path = PROCESSED_DIR / PROCESSED_FILES["market_prices"]
    if not path.exists():
        issue(
            "info",
            name,
            "not built in this run (run scripts.data.ingest_market_prices)",
        )
        return

    df = pd.read_csv(path)
    _check_columns(
        name,
        df,
        [
            "observation_key",
            "observation_date",
            "commodity_name_raw",
            "price_value_original",
            "currency_original",
            "unit_original",
            "price_type",
            "source_id",
        ],
    )
    if df.empty:
        issue(
            "info",
            name,
            "no market observations yet - no provider export has been placed "
            "under data/raw/markets/ (the canonical schema is written with 0 rows)",
        )
        return

    _check_duplicate_keys(name, df, ["observation_key"])
    _check_nonnegative(name, df, ["price_value_original"])

    unknown_types = sorted(set(df["price_type"].dropna()) - set(MARKET_PRICE_TYPES))
    if unknown_types:
        issue("error", name, f"price_type outside the canonical vocabulary: {unknown_types}")

    if df["commodity_name_raw"].isna().any():
        issue(
            "error",
            name,
            "rows without the published commodity name",
            int(df["commodity_name_raw"].isna().sum()),
        )

    blank_source = int(df["source_id"].isna().sum())
    if blank_source:
        issue("error", name, "rows without source lineage", blank_source)

    # A canonical RWF/kg value is only legitimate with a conversion factor.
    if {"price_rwf_per_kg", "conversion_to_kg"}.issubset(df.columns):
        converted = df["price_rwf_per_kg"].notna()
        without_factor = int((converted & df["conversion_to_kg"].isna()).sum())
        if without_factor:
            issue(
                "error",
                name,
                "price_rwf_per_kg present without a documented kg conversion",
                without_factor,
            )

        non_rwf = int((converted & (df["currency_original"].str.upper() != "RWF")).sum())
        if non_rwf:
            issue(
                "error",
                name,
                "price_rwf_per_kg computed from a non-RWF price (FX rate missing)",
                non_rwf,
            )

        without_basis = int(
            (df["conversion_to_kg"].notna() & df["conversion_basis"].isna()).sum()
        )
        if without_basis:
            issue(
                "warn",
                name,
                "kg conversion without a recorded basis",
                without_basis,
            )

    unknown_units = int(df["unit_original"].isna().sum())
    if unknown_units:
        issue("error", name, "rows without the published unit", unknown_units)

    unmapped_commodities = sorted(
        str(v)
        for v in df.loc[df["commodity_code"].isna(), "commodity_name_raw"].unique()
    ) if "commodity_code" in df.columns else []
    if unmapped_commodities:
        issue(
            "info",
            name,
            "commodities kept with a null code (no dictionary match): "
            f"{unmapped_commodities}",
            len(unmapped_commodities),
        )

    providers = sorted(set(df["source_id"]))
    canonical = int(df["price_rwf_per_kg"].notna().sum()) if "price_rwf_per_kg" in df.columns else 0
    issue(
        "info",
        name,
        f"{len(df)} observations from {providers}; "
        f"{canonical} have a canonical RWF/kg value, "
        f"{len(df) - canonical} keep only the published original",
    )


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
    _validate_crop_productivity(known_districts, known_crops)
    _validate_market_prices()

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
