"""Loader quality-flag policy: published-yield vs production/area disagreement.

Five real inconsistencies exist in the NISR source workbooks (four 2024B
"Other cereals" district rows; Rubavu 2026B "Other crops" where the published
yield is 4575.484 kg/ha but production/harvested area implies 493.922). The
policy under test: official values are never altered, but the row is flagged
``review`` with a note, so a UI can warn and a forecast trainer can exclude it.

Every row below is **synthetic** - fabricated numbers that mimic the shape of
the published discrepancy. They are labels for the flagging policy only and
bear no relation to real observations beyond the five documented cases, which
are asserted through the processed panel in the canonical integration suite.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.data.load_postgres import (  # noqa: E402
    YIELD_CONSISTENCY_TOLERANCE_KG_HA,
    panel_rows,
)
from scripts.data.common import (  # noqa: E402
    YIELD_CONSISTENCY_REL_TOLERANCE,
    is_material_yield_discrepancy,
    yield_discrepancy_tolerance,
)

CROP_NAMES = {"CROP-MAI": "Maize"}
DISTRICT_CODES = {"RW-KG-A"}


def _row(**overrides) -> dict:
    base = {
        "period_code": "2026B",
        "year": 2026,
        "season": "B",
        "geography_level": "DISTRICT",
        "geography_code": "RW-KG-A",
        "district": "Test District",
        "district_code": "RW-KG-A",
        "province": "Test Province",
        "crop_code": "CROP-MAI",
        "canonical_crop_name": "Maize",
        "crop_name_raw": "Maize",
        "farmer_scale": "all",
        "cultivated_area_ha": 100.0,
        "harvested_area_ha": 100.0,
        "production_mt": 200.0,
        # consistent with production/area: 200 MT * 1000 / 100 ha = 2000 kg/ha
        "yield_kg_ha": 2000.0,
        "source_id": "NISR_SAS_TEST",
        "source_sheets": "Table 9|Table 10|Table 11|Table 13",
    }
    base.update(overrides)
    return base


def _load(rows: list[dict]) -> list[dict]:
    frame = pd.DataFrame(rows)
    loaded, _stats = panel_rows(frame, version="test", crop_names=CROP_NAMES, district_codes=DISTRICT_CODES)
    return loaded


def test_a_consistent_row_is_flagged_ok():
    (row,) = _load([_row()])
    assert row["quality_flag"] == "ok"
    assert row["quality_note"] is None


def test_yield_disagreeing_with_production_area_is_flagged_review():
    # 4575.484 published vs 653.47 MT / 1323.02 ha = 493.92 implied: the
    # Rubavu 2026B "Other crops" shape, with synthetic stand-in numbers.
    (row,) = _load([_row(yield_kg_ha=4575.484, production_mt=653.47, harvested_area_ha=1323.02)])
    assert row["quality_flag"] == "review"
    assert "differs from production/harvested area" in row["quality_note"]
    # The official values are preserved exactly - never overwritten by the
    # implied ratio.
    assert row["yield_kg_ha"] == 4575.484
    assert row["production_mt"] == 653.47
    assert row["harvested_area_ha"] == 1323.02


def test_disagreement_within_tolerance_is_not_flagged():
    implied = 200.0 * 1000.0 / 100.0  # 2000.0
    (row,) = _load([_row(yield_kg_ha=implied + YIELD_CONSISTENCY_TOLERANCE_KG_HA)])
    assert row["quality_flag"] == "ok"


def test_rounding_scale_disagreement_is_not_flagged():
    """The 2023 release prints whole numbers, so a 0.5% gap is rounding.

    2,000.0 kg/ha implied against 2,010.0 published is inside the documented
    1% relative allowance and must not be reported as an inconsistency.
    """
    (row,) = _load([_row(yield_kg_ha=2010.0, production_mt=200.0, harvested_area_ha=100.0)])
    assert row["quality_flag"] == "ok"


def test_material_disagreement_is_flagged():
    """2% off is past the documented tolerance, so the row is flagged."""
    (row,) = _load([_row(yield_kg_ha=2040.0, production_mt=200.0, harvested_area_ha=100.0)])
    assert row["quality_flag"] == "review"
    assert "differs from production/harvested area" in row["quality_note"]


def test_zero_harvested_area_never_divides_and_never_flags_yield():
    # Zero harvested area with a published yield is a different anomaly; the
    # yield check must not divide by zero or invent a ratio.
    (row,) = _load([_row(harvested_area_ha=0.0, production_mt=0.0, yield_kg_ha=1500.0)])
    assert row["quality_flag"] == "ok"


def test_missing_production_or_yield_skips_the_check():
    (row,) = _load([_row(production_mt=None)])
    assert row["quality_flag"] == "ok"
    (row,) = _load([_row(yield_kg_ha=None)])
    assert row["quality_flag"] == "ok"


def test_both_flags_compose_without_downgrading():
    # harvested > cultivated AND yield disagreement: keep "review", keep both
    # notes so neither anomaly is hidden by the other.
    (row,) = _load(
        [
            _row(
                cultivated_area_ha=50.0,
                harvested_area_ha=100.0,
                production_mt=653.47,
                yield_kg_ha=4575.484,
            )
        ]
    )
    assert row["quality_flag"] == "review"
    assert "exceeds cultivated_area_ha" in row["quality_note"]
    assert "differs from production/harvested area" in row["quality_note"]


def test_tolerance_policy_is_the_documented_one():
    """The loader and the validator must share one tolerance definition.

    The policy lives in ``scripts/data/common.py``; the validator imports it
    rather than repeating a literal, so the report's warning count and the
    per-row ``review`` flags cannot disagree.
    """
    validator = (REPO_ROOT / "scripts" / "data" / "validate_raw.py").read_text()
    assert "YIELD_CONSISTENCY_ABS_TOLERANCE_KG_HA" in validator
    assert "YIELD_CONSISTENCY_REL_TOLERANCE" in validator
    assert YIELD_CONSISTENCY_TOLERANCE_KG_HA == 1.0
    assert YIELD_CONSISTENCY_REL_TOLERANCE == 0.01
    # The scale-aware rule itself, stated once and tested at its boundaries.
    assert yield_discrepancy_tolerance(2000.0) == 20.0
    assert yield_discrepancy_tolerance(10.0) == 1.0
    assert not is_material_yield_discrepancy(200.0, 100.0, 2010.0)
    assert is_material_yield_discrepancy(200.0, 100.0, 2040.0)
