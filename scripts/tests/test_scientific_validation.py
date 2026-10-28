"""Regression tests for the scientific/data-quality release gate."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from scripts.data.build_manifest import _pipeline_source_sha256
from scripts.data.scientific_validation import _yield_reconciliation, run_validation, validate_panel


def test_yield_reconciliation_keeps_material_source_issue_visible() -> None:
    frame = pd.DataFrame(
        [
            {
                "period_code": "2026B",
                "district": "A",
                "canonical_crop_name": "Maize",
                "production_mt": 100,
                "harvested_area_ha": 100,
                "yield_kg_ha": 1000,
            },
            {
                "period_code": "2026B",
                "district": "B",
                "canonical_crop_name": "Maize",
                "production_mt": 100,
                "harvested_area_ha": 100,
                "yield_kg_ha": 500,
            },
        ]
    )

    result = _yield_reconciliation(frame)

    assert result.status == "UNRESOLVED"
    assert result.details["rows_checked"] == 2
    assert result.details["material_inconsistencies"] == 1
    assert result.details["formula"] == "yield_kg_ha = 1000 * production_mt / harvested_area_ha"


def test_national_farmer_scopes_are_not_false_duplicate_keys() -> None:
    rows = []
    for farmer_scale in ("all", "ssf", "lsf"):
        rows.append(
            {
                "period_code": "2026B",
                "geography_level": "NATIONAL",
                "geography_code": "RW",
                "crop_code": "CROP-MAI",
                "canonical_crop_name": "Maize",
                "farmer_scale": farmer_scale,
                "district_code": None,
                "is_synthetic": False,
                "cultivated_area_ha": 1,
                "harvested_area_ha": 1,
                "production_mt": 1,
                "yield_kg_ha": 1000,
                "source_id": "NISR_SAS_2026B",
                "source_workbook": "Tables_2026 Season B.xlsx",
                "source_sheets": "Table 11",
                "metric_source_map": '{"yield":"Table 11"}',
                "source_row_min": 2,
                "processing_script": "test",
                "processing_version": "0.2.0",
            }
        )
    checks = validate_panel(pd.DataFrame(rows), inventory_path=Path("/does/not/exist"))
    key_check = next(check for check in checks if check.check_id == "canonical_key_uniqueness")

    assert key_check.status == "PASS"
    assert key_check.details["duplicate_rows"] == 0


def test_current_panel_has_no_software_release_gate_failures() -> None:
    report = run_validation()

    assert report["summary"]["FAIL"] == 0
    assert report["summary"]["PASS"] >= 10
    assert report["summary"]["UNRESOLVED"] >= 1


def test_pipeline_source_identity_is_deterministic() -> None:
    assert _pipeline_source_sha256() == _pipeline_source_sha256()
    assert len(_pipeline_source_sha256()) == 64
