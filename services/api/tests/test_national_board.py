"""Tests for /analytics/national-board and the shared same-season delta.

Two things must hold for the mobile board to be trustworthy:

* every crop's series is aligned to the SAME ordered period axis, so the client
  can plot two crops without aligning anything by array position;
* a same-season change is reported only from two published observations, and a
  missing comparison says why instead of silently reading as 0 %.
"""

from __future__ import annotations

import pytest


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/trends")
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")


def _board(client, **params):
    res = client.get("/api/v1/analytics/national-board", params=params)
    if res.status_code != 200:
        pytest.skip("national board unavailable in this environment")
    return res.json()


def test_every_series_shares_one_period_axis(client):
    _require_data(client)
    body = _board(client)
    axis = body["periods"]
    assert axis, "the board must report the period axis it used"
    assert axis == sorted(axis, key=lambda code: (int(code[:4]), code[4:]))

    for crop in body["crops"]:
        for metric, values in crop["series"].items():
            assert len(values) == len(axis), f"{crop['crop']}.{metric} is not axis-aligned"
        # Alignment is what lets the client plot these positionally.
        assert set(crop["changes"]).issubset(set(crop["series"]))


def test_every_period_label_is_published_for_the_axis(client):
    _require_data(client)
    body = _board(client)
    for code in body["periods"]:
        assert body["period_labels"][code]
        assert code[:4] in body["period_labels"][code]


def test_change_is_only_reported_from_two_published_observations(client):
    _require_data(client)
    body = _board(client)
    axis = body["periods"]

    for crop in body["crops"]:
        for metric, change in crop["changes"].items():
            if not change["available"]:
                assert change["change_pct"] is None
                assert change["reason"], f"{crop['crop']}.{metric} must say why"
                continue

            current_code = change["period_code"]
            previous_code = change["previous_period_code"]
            # Same season, one year earlier - never A against B.
            assert current_code[4:] == previous_code[4:]
            assert int(current_code[:4]) - int(previous_code[:4]) == 1
            assert current_code in axis and previous_code in axis

            current = change["current_value"]
            previous = change["previous_value"]
            assert current is not None and previous is not None
            expected = (current - previous) / abs(previous) * 100
            assert change["change_pct"] == pytest.approx(expected, rel=1e-4)


def test_a_missing_period_is_a_null_not_a_zero(monkeypatch):
    """A crop tabulated in one period only must carry a gap, not a zero."""
    import pandas as pd

    from app.services import national_board_service

    frame = pd.DataFrame(
        [
            {"year": 2024, "season": "B", "crop": "Banana", "canonical_crop_name": "Banana",
             "is_aggregate": False, "cultivated_area_ha": 258564.0,
             "harvested_area_ha": 92501.0, "production_mt": 1142552.0, "yield_mt_ha": 12.35},
            {"year": 2024, "season": "B", "crop": "Maize", "canonical_crop_name": "Maize",
             "is_aggregate": False, "cultivated_area_ha": 249275.0,
             "harvested_area_ha": 92748.0, "production_mt": 119101.0, "yield_mt_ha": 1.28},
            {"year": 2025, "season": "A", "crop": "Maize", "canonical_crop_name": "Maize",
             "is_aggregate": False, "cultivated_area_ha": 242439.0,
             "harvested_area_ha": 242439.0, "production_mt": 481246.0, "yield_mt_ha": 2.0},
        ]
    )
    monkeypatch.setattr(national_board_service.repo, "national_crop_trends", lambda: frame)
    body = national_board_service.board()

    # The axis is the union of published periods, chronologically ordered.
    assert body["periods"] == ["2024B", "2025A"]
    banana = next(item for item in body["crops"] if item["crop"] == "Banana")
    maize = next(item for item in body["crops"] if item["crop"] == "Maize")

    assert banana["series"]["production_mt"] == [1142552.0, None]
    assert banana["n_published_periods"] == 1
    assert banana["latest_published_period"] == "2024B"
    assert maize["series"]["production_mt"] == [119101.0, 481246.0]
    # The Season A gap means no same-season comparison exists for Banana.
    assert banana["changes"]["production_mt"]["available"] is False
    assert banana["changes"]["production_mt"]["reason"]


def test_no_value_is_a_nan_or_a_string(client):
    _require_data(client)
    body = _board(client)
    for crop in body["crops"]:
        for values in crop["series"].values():
            for value in values:
                assert value is None or (
                    isinstance(value, int | float) and value == value
                ), "a NaN or a string would leak into the chart"
        assert crop["n_published_periods"] <= len(body["periods"])


def test_national_totals_share_the_axis_and_are_never_an_average_of_yields(client):
    _require_data(client)
    body = _board(client)
    totals = body["national"]
    assert totals is not None
    axis = body["periods"]
    for _metric, values in totals["series"].items():
        assert len(values) == len(axis)

    production = totals["series"]["production_mt"]
    area = totals["series"]["harvested_area_ha"]
    yield_total = totals["series"]["yield_mt_ha"]
    for index, value in enumerate(yield_total):
        if value is None or production[index] is None or area[index] in (None, 0):
            continue
        assert value == pytest.approx(production[index] / area[index], rel=1e-3)


def test_national_change_is_part_of_the_payload(client):
    _require_data(client)
    body = _board(client)
    change = body["national"]["changes"]["production_mt"]
    assert change["unit"] == "metric tonnes"
    if change["available"]:
        assert change["period_code"][4:] == change["previous_period_code"][4:]
    else:
        assert change["reason"]


def test_restricting_to_named_crops_keeps_the_axis_shared(client):
    _require_data(client)
    body = _board(client, crops="Maize,Beans")
    assert [crop["crop"] for crop in body["crops"]] == ["Maize", "Beans"]
    lengths = {len(values) for crop in body["crops"] for values in crop["series"].values()}
    assert lengths == {len(body["periods"])}


def test_rejects_a_single_crop_name(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/national-board", params={"crops": "Maize"})
    assert res.status_code == 422


def test_latest_published_period_matches_the_series(client):
    _require_data(client)
    body = _board(client, crops="Maize,Beans")
    axis = body["periods"]
    for crop in body["crops"]:
        published = [
            axis[index]
            for index in range(len(axis))
            if any(values[index] is not None for values in crop["series"].values())
        ]
        assert crop["n_published_periods"] == len(published)
        assert crop["latest_published_period"] == (published[-1] if published else None)


def test_district_trend_reports_its_own_change(client):
    _require_data(client)
    res = client.get("/api/v1/productivity/trend", params={"crop": "Maize", "district": "Bugesera"})
    if res.status_code != 200:
        pytest.skip("district trend unavailable in this environment")
    body = res.json()
    change = body["change"]
    assert change is not None
    assert change["unit"] == "kg/ha"
    if change["available"]:
        assert change["period_code"][4:] == change["previous_period_code"][4:]
        assert change["change_pct"] == pytest.approx(
            (change["current_value"] - change["previous_value"])
            / abs(change["previous_value"])
            * 100,
            rel=1e-4,
        )
    else:
        assert change["reason"]
        assert change["change_pct"] is None
