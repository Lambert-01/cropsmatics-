"""Tests for the optional NISR/AHS plot evidence extractor."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from scripts.data.extract_plot_observations import extract_frame, infer_period, main


def test_extracts_plot_area_and_production_without_inventing_geometry():
    frame = pd.DataFrame(
        [
            {
                "Province": "Eastern",
                "District": "Gatsibo",
                "Segment_ID": "SEG-1",
                "Farmer ID": "F-1",
                "Plot No": "P-1",
                "Plot area (sqm)": 10_000,
                "Crop name": "Maize",
                "Total quantity of harvest for this season in this plot (in kg)": 2_500,
            }
        ]
    )
    result = extract_frame(
        frame,
        source_file="data/raw/nisr/sas_microdata/2024/season_b/production.csv",
    )

    assert len(result) == 1
    row = result.iloc[0]
    assert row["period_code"] == "2024B"
    assert row["area_ha"] == 1
    assert row["production_kg"] == 2_500
    assert row["yield_kg_ha"] == 2_500
    assert bool(row["geometry_available"]) is False
    assert row["district_code"]
    assert bool(row["is_synthetic"]) is False


def test_extracts_hectares_and_sums_multiple_crop_harvest_columns():
    frame = pd.DataFrame(
        [{
            "district": "Gatsibo",
            "s2q4_ha": 2.5,
            "s2q4": "Maize",
            "s3_q20_5": 100,
            "s3_q20_6": 50,
            "latitude": -1.7,
            "longitude": 30.4,
        }]
    )
    result = extract_frame(frame, source_file="ahs2024/season_a/records.csv")
    row = result.iloc[0]

    assert row["area_ha"] == 2.5
    assert row["production_kg"] == 150
    assert bool(row["geometry_available"]) is True
    assert row["latitude"] == -1.7
    assert row["longitude"] == 30.4


def test_extracts_ahs_wide_crop_slots_and_nisr_codes():
    frame = pd.DataFrame(
        [
            {
                "hhid": 123,
                "province": 5,
                "district": 52,
                "Season": 2,
                "s2q1": 7,
                "s2q2": 10_000,
                "s3_q4_1": 101,
                "s3_q4_1a": 75,
                "s3_q20_1": 2_500,
                "s3_q4_2": 106,
                "s3_q4_2a": 25,
                "s3_q20_2": 500,
            }
        ]
    )

    result = extract_frame(
        frame,
        source_file="data/raw/nisr/sas_microdata/2024/ahs/AHS2024_crop_production.dta",
    )

    assert len(result) == 2
    assert set(result["period_code"]) == {"2024B"}
    assert set(result["district"]) == {"Gatsibo"}
    assert set(result["district_code"]) == {"RW-EA-GAT"}
    maize = result.loc[result["canonical_crop_name"] == "Maize"].iloc[0]
    beans = result.loc[result["canonical_crop_name"] == "Beans"].iloc[0]
    assert maize["area_ha"] == 0.75
    assert beans["area_ha"] == 0.25
    assert maize["production_kg"] == 2_500
    assert beans["production_kg"] == 500


def test_period_inference_does_not_guess_a_season():
    assert infer_period(Path("SAS_2025_annual/production.csv")) == "2025"
    assert infer_period(Path("SAS_2025/season_c/production.csv")) == "2025C"


def test_strict_cli_reports_missing_microdata(tmp_path):
    output = tmp_path / "field_crop_observations.csv"
    assert main(["--input-dir", str(tmp_path / "empty"), "--output", str(output), "--require-data"]) == 2
    assert output.exists()
