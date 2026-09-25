"""Pipeline tests: raw validation rules and the MINAGRI add-on ingestion.

These assert the *rules* (mutually-exclusive sums, null preservation, national
level of analysis) rather than re-deriving the values, so they fail when a rule
is broken rather than when a number changes slightly.
"""

from __future__ import annotations

import json

import pandas as pd

from scripts.tests.conftest import require

# --- registered sources -----------------------------------------------------


def test_source_registry_includes_minagri_add_on(processed_dir):
    df = pd.read_csv(require(processed_dir / "data_sources.csv"))
    assert len(df) >= 8, "expected the 6 primary plus 2 MINAGRI add-on sources"
    text = " ".join(df.astype(str).values.ravel())
    assert "MINAGRI" in text
    assert "Post-Harvest Infrastructure" in text


# --- irrigation -------------------------------------------------------------


def test_irrigation_validation_rules(raw_dir):
    df = pd.read_csv(raw_dir / "03_irrigation_water_2025B.csv")
    pct = [c for c in df.columns if c.endswith("_pct")]

    assert df["district"].nunique() == 30
    assert not df[["year", "season", "district"]].duplicated().any()

    # Percentages stay inside 0-100 and are never negative.
    for col in pct:
        assert df[col].min() >= 0, f"{col} has a negative value"
        assert df[col].max() <= 100, f"{col} exceeds 100"

    # The technique mix is a single-response allocation: it is either 0 (district
    # reports no irrigation) or approximately 100.
    techniques = [
        "surface_irrigation_pct",
        "flood_irrigation_pct",
        "drip_irrigation_pct",
        "sprinkler_irrigation_pct",
        "pivot_irrigation_pct",
        "traditional_irrigation_pct",
    ]
    totals = df[techniques].sum(axis=1)
    assert ((totals == 0) | ((totals - 100).abs() <= 1.0)).all()


# --- erosion ----------------------------------------------------------------


def test_erosion_severity_bands_sum_to_100(raw_dir):
    df = pd.read_csv(raw_dir / "04_erosion_control_2025B.csv")
    severity = [
        "erosion_severe_pct",
        "erosion_moderate_pct",
        "erosion_low_pct",
        "erosion_very_low_pct",
    ]
    assert set(severity).issubset(df.columns)
    totals = df[severity].sum(axis=1)
    # Mutually exclusive land bands: the district's land is in exactly one band.
    assert ((totals - 100).abs() <= 1.0).all()


def test_erosion_techniques_are_not_forced_to_100(raw_dir):
    """Techniques are a multi-response question, so 100% is not required.

    Recorded as an observation only: asserting a sum here would encode a claim
    the source does not make.
    """
    df = pd.read_csv(raw_dir / "04_erosion_control_2025B.csv")
    techniques = [
        c for c in df.columns if c.endswith("_pct") and not c.startswith("erosion_")
    ]
    totals = df[techniques].sum(axis=1)
    assert totals.min() >= 0  # sanity: no negative allocation
    # No assertion on the total: multi-response by design.


# --- post-harvest composition ----------------------------------------------


def test_postharvest_allocation_sums_to_100(raw_dir):
    df = pd.read_csv(raw_dir / "05_crop_postharvest_use_2025B.csv")
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
    totals = df[allocation].sum(axis=1)
    # Production use is mutually exhaustive: every tonne is accounted for once.
    assert ((totals - 100).abs() <= 0.05).all()
    for col in allocation:
        assert df[col].min() >= 0
        assert df[col].max() <= 100


# --- national trends --------------------------------------------------------


def test_national_trends_keys_and_aggregates(raw_dir):
    df = pd.read_csv(raw_dir / "06_national_crop_trends_2024_2026.csv")

    assert not df[["year", "season", "crop"]].duplicated().any()
    assert (df["cultivated_area_ha"].dropna() >= 0).all()
    assert (df["production_mt"].dropna() >= 0).all()

    aggregates = {"Cereals", "Tubers and Roots", "Legumes and Pulses", "Vegetables and Fruits"}
    assert aggregates.issubset(set(df["crop"])), "aggregate groups should be present"

    # Aggregate groups carry no published yield: they must not be presented as
    # a measured yield, and they must never be summed with their components.
    agg_rows = df[df["crop"].isin(aggregates)]
    assert agg_rows["yield_mt_ha"].isna().all()

    # Where a yield is published it must agree with production / harvested area.
    measured = df.dropna(subset=["yield_mt_ha", "harvested_area_ha"])
    measured = measured[measured["harvested_area_ha"] > 0]
    diff = (measured["production_mt"] / measured["harvested_area_ha"] - measured["yield_mt_ha"]).abs()
    assert (diff <= 0.05).all()


# --- cold chain -------------------------------------------------------------


def test_cold_chain_capacity_is_null_not_zero(processed_dir, raw_dir):
    raw = pd.read_csv(raw_dir / "08_verified_cold_chain_context_2026.csv")
    assert raw["capacity"].isna().all(), "raw capacity must be blank"

    processed = pd.read_csv(require(processed_dir / "cold_chain_context.csv"))
    assert processed["capacity"].isna().all(), "null capacity must survive processing"
    assert (processed["capacity_status"] == "not_verified").all()
    # The null -> 0 rule: a blank capacity must never be read back as a facility
    # with zero capacity.
    assert not (pd.to_numeric(processed["capacity"], errors="coerce") == 0).any()


# --- MINAGRI add-on ingestion ----------------------------------------------


def test_postharvest_infrastructure_is_national_only(processed_dir):
    df = pd.read_csv(require(processed_dir / "national_postharvest_infrastructure.csv"))
    published = df[df["is_derived_total"] != True]  # noqa: E712

    assert (published["geographic_level"] == "national").all()
    assert len(published) == 5
    # Never joined to districts: a national total on a district would be a false
    # claim, so the table carries no district column at all.
    assert "district" not in df.columns

    # Published totals must equal existing + new on every row.
    assert (
        (published["total_number"] - published["existing_number"] - published["new_number"]).abs() < 1e-6
    ).all()
    assert (
        (
            published["total_capacity_mt"]
            - published["existing_capacity_mt"]
            - published["new_capacity_mt"]
        ).abs()
        < 1e-6
    ).all()

    derived = df[df["is_derived_total"] == True]  # noqa: E712
    assert len(derived) == 1
    assert derived.iloc[0]["total_capacity_mt"] == published["total_capacity_mt"].sum()


def test_cold_chain_network_program_districts_are_real(processed_dir, dicts_dir):
    df = pd.read_csv(require(processed_dir / "cold_chain_network_summary.csv"))
    assert (df["capacity_status"] == "not_verified").all()
    assert (df["capacity"].isna()).all()

    known = set(pd.read_csv(dicts_dir / "districts.csv")["district"].astype(str))
    row = df[df["indicator"] == "Program districts named"]
    assert len(row) == 1
    names = [n.strip() for n in str(row.iloc[0]["district_names"]).split(",") if n.strip()]
    assert names, "program districts must be extracted, not left in a free-text note"
    assert set(names).issubset(known), "program districts must be real district names"
    assert len(names) == 6


def test_add_on_tables_are_registered_for_export(processed_dir):
    for name in ("national_postharvest_infrastructure.csv", "cold_chain_network_summary.csv"):
        df = pd.read_csv(require(processed_dir / name))
        for column in ("source_id", "source_period", "processing_script", "is_synthetic"):
            assert column in df.columns, f"{name} missing provenance column {column}"
        assert not df["is_synthetic"].any()


# --- coverage + manifest ----------------------------------------------------


def test_coverage_includes_add_on_datasets(processed_dir):
    df = pd.read_csv(require(processed_dir / "data_coverage.csv"))
    datasets = set(df["dataset"])
    assert "postharvest_infrastructure" in datasets
    assert "cold_chain_network_summary" in datasets
    # The national add-on must be recorded as national, never as district data.
    add_on = df[df["dataset"].isin(["postharvest_infrastructure", "cold_chain_network_summary"])]
    assert set(add_on["coverage_level"]) == {"national"}


def test_data_manifest_records_build_identity(processed_dir):
    manifest = json.loads(require(processed_dir / "manifest.json").read_text())

    for key in ("pipeline_version", "git_sha", "build_timestamp", "sources", "outputs", "row_counts"):
        assert key in manifest, f"manifest missing {key}"

    # Row counts are keyed by logical dataset name (see PROCESSED_FILES).
    assert manifest["row_counts"]["training"] == 510
    assert manifest["row_counts"]["district_crop_productivity"] == 510
    assert manifest["row_counts"]["national_crop_trends"] == 108
    assert manifest["validation"]["status"] in {"passed", "failed"}

    # Source hashes make the build reproducible and auditable.
    assert all(len(v["sha256"]) == 64 for v in manifest["sources"].values())
    assert manifest["sources"]["postharvest_infrastructure"]["origin"] == "minagri-addon"


def test_validation_report_keeps_documented_warnings(interim_dir):
    report = json.loads(require(interim_dir / "validation_report.json").read_text())
    assert report["status"] == "passed"
    assert report["errors"] == 0

    messages = {i["message"]: i["count"] for i in report["issues"]}
    # The known data-quality notes must still be reported, not silenced.
    blank = next(c for m, c in messages.items() if "blank cultivated_area_ha" in m)
    assert blank == 49
    excess = next(c for m, c in messages.items() if "exceeds cultivated_area_ha" in m)
    assert excess == 62


def test_area_consistency_report_categorises_raw_values(interim_dir, raw_dir):
    report = pd.read_csv(require(interim_dir / "area_consistency_report.csv"))
    assert len(report) == 510
    assert set(report["area_consistency_flag"]).issubset(
        {"CONSISTENT", "ROUNDING_TOLERANCE", "REVIEW", "SEVERE", "MISSING_CULTIVATED_AREA"}
    )

    # The report must not have altered the official raw values.
    raw = pd.read_csv(raw_dir / "01_district_crop_productivity_2025B.csv")
    merged = report.merge(
        raw,
        on=["year", "season", "district", "crop"],
        suffixes=("_report", "_raw"),
        how="inner",
    )
    assert len(merged) == len(report)
    cultivated_report = merged["cultivated_area_ha_report"]
    cultivated_raw = merged["cultivated_area_ha_raw"]
    both_null = cultivated_report.isna() & cultivated_raw.isna()
    equal = (cultivated_report == cultivated_raw).fillna(False)
    assert (both_null | equal).all()
