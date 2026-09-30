"""Regression tests: a crop family must not be added to its own varieties.

The national trend table carries ``Banana`` alongside ``Cooking banana`` /
``Dessert banana`` / ``Banana for beer``, and ``Beans`` alongside ``Bush bean`` /
``Climbing bean`` / ``Pea``, all under one ``canonical_crop_name``. The canonical
layer stores varieties as separate observations on purpose, and the family row
already aggregates them, so the trend service previously reported roughly double
the published production and area for those two crops - and the no-crop national
total inherited the same inflation.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.services import trend_service


def _frame():
    return pd.DataFrame(
        [
            # Banana family total = the sum of its three varieties below.
            {"year": 2024, "season": "B", "crop": "Banana", "canonical_crop_name": "Banana",
             "is_aggregate": False, "cultivated_area_ha": 258564.0,
             "harvested_area_ha": 92501.0, "production_mt": 1142552.0, "yield_mt_ha": 12.35},
            {"year": 2024, "season": "B", "crop": "Cooking banana", "canonical_crop_name": "Banana",
             "is_aggregate": False, "cultivated_area_ha": 90123.0,
             "harvested_area_ha": 30323.0, "production_mt": 515798.0, "yield_mt_ha": 17.0},
            {"year": 2024, "season": "B", "crop": "Dessert banana", "canonical_crop_name": "Banana",
             "is_aggregate": False, "cultivated_area_ha": 48808.0,
             "harvested_area_ha": 13441.0, "production_mt": 152891.0, "yield_mt_ha": 11.37},
            # An ordinary crop with a single row per period.
            {"year": 2024, "season": "B", "crop": "Maize", "canonical_crop_name": "Maize",
             "is_aggregate": False, "cultivated_area_ha": 249275.0,
             "harvested_area_ha": 92748.0, "production_mt": 119101.0, "yield_mt_ha": 1.28},
            # An official aggregate group, excluded before the collapse.
            {"year": 2024, "season": "B", "crop": "Cereals", "canonical_crop_name": "Cereals",
             "is_aggregate": True, "cultivated_area_ha": 1.0,
             "harvested_area_ha": 1.0, "production_mt": 1.0, "yield_mt_ha": 1.0},
        ]
    )


def test_collapse_keeps_the_family_row(monkeypatch):
    collapsed = trend_service.collapse_crop_breakdown(_frame())
    banana = collapsed[collapsed["canonical_crop_name"] == "Banana"]
    assert len(banana) == 1
    assert banana.iloc[0]["crop"] == "Banana"
    assert banana.iloc[0]["production_mt"] == 1142552.0


def test_single_row_crops_are_untouched():
    collapsed = trend_service.collapse_crop_breakdown(_frame())
    assert len(collapsed[collapsed["canonical_crop_name"] == "Maize"]) == 1
    # An ordinary table is returned unchanged, so the rule cannot alter the
    # numbers of crops that never had a breakdown.
    plain = _frame()[_frame()["crop"] == _frame()["canonical_crop_name"]]
    assert len(trend_service.collapse_crop_breakdown(plain)) == len(plain)


def test_crop_trends_does_not_double_count_a_family(monkeypatch):
    monkeypatch.setattr(trend_service.repo, "national_crop_trends", _frame)
    banana = trend_service.crop_trends("Banana")["points"][0]["values"]
    assert banana["production_mt"] == 1142552.0
    assert banana["harvested_area_ha"] == 92501.0
    assert banana["cultivated_area_ha"] == 258564.0
    # The family yield is the published one, not an average of the varieties.
    assert banana["yield_mt_ha"] == 12.35


def test_national_total_counts_each_crop_once(monkeypatch):
    monkeypatch.setattr(trend_service.repo, "national_crop_trends", _frame)
    combined = trend_service.crop_trends()["points"][0]["values"]
    # Banana (family only) + Maize; the aggregate group is still excluded.
    assert combined["production_mt"] == pytest.approx(1142552.0 + 119101.0, rel=1e-9)
    assert combined["cultivated_area_ha"] == pytest.approx(258564.0 + 249275.0, rel=1e-9)


def test_compare_view_is_also_collapsed(monkeypatch):
    monkeypatch.setattr(trend_service.repo, "national_crop_trends", _frame)
    result = trend_service.crop_trends(compare_crops=["Banana", "Maize"])
    values = result["points"][0]["values"]
    assert values["production_mt:Banana"] == 1142552.0
    assert values["production_mt:Maize"] == 119101.0


def test_real_table_reports_the_published_banana_total(client):
    """The shipped table's family row must be what the API reports."""
    res = client.get("/api/v1/analytics/trends", params={"crop": "Banana"})
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    assert res.status_code == 200
    points = res.json()["points"]
    assert points
    published = pd.read_csv(
        __import__("pathlib").Path(__file__).resolve().parents[3]
        / "data"
        / "processed"
        / "national_crop_trends.csv"
    )
    for point in points:
        code = point["period"]
        family = published[
            (published["canonical_crop_name"] == "Banana")
            & (published["crop"] == "Banana")
            & ((published["year"].astype(str) + published["season"]) == code)
        ]
        if family.empty:
            continue
        assert point["values"]["production_mt"] == pytest.approx(
            float(family.iloc[0]["production_mt"]), rel=1e-6
        )
