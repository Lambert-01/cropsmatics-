"""The national board's period scope must select published periods, nothing else.

The Crops catalogue offers a year and a season filter. A year has to resolve to
the seasons NISR actually published for it - never an aggregate across
incompatible observations - and an unpublished or unmatched selection has to be
explained as a 422 rather than returned as a silently empty board.
"""

from __future__ import annotations


def _board(client, **params):
    response = client.get("/api/v1/analytics/national-board", params=params)
    return response


def test_unscoped_board_is_unchanged(client):
    """The scope is additive: the default response must be exactly as before."""
    response = _board(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["periods"]) > 1
    assert body["periods"] == sorted(body["periods"])


def test_period_code_restricts_the_axis_to_that_period(client):
    body = _board(client, period_code="2025B").json()
    assert body["periods"] == ["2025B"]
    # One period cannot have a same-season predecessor, so no metric may claim a
    # change; a fabricated delta is the failure mode this guards against.
    for crop in body["crops"]:
        for change in crop["changes"].values():
            assert change["available"] is False, crop["crop"]


def test_year_resolves_to_that_year_s_published_seasons(client):
    """Derived from the unscoped axis, so the assertion cannot outlive the data.

    The national trends table is national *context*: it covers a subset of the
    published periods, not the full district panel. This is exactly the trap the
    Crops filter must not fall into - a year offers the periods that table really
    has, not a season list assumed from the calendar.
    """
    axis = _board(client).json()["periods"]
    years = {int(period[:4]) for period in axis}
    assert len(years) > 1, "the axis must span more than one year for this to be meaningful"

    for year in sorted(years):
        body = _board(client, year=year).json()
        expected = [period for period in axis if period.startswith(str(year))]
        assert body["periods"] == expected, year
        # A year is never widened to a neighbouring year's observations.
        assert all(period.startswith(str(year)) for period in body["periods"])


def test_year_and_season_together_select_one_period(client):
    axis = _board(client).json()["periods"]
    code = axis[0]
    body = _board(client, year=int(code[:4]), season=code[-1]).json()
    assert body["periods"] == [code]


def test_season_code_is_case_insensitive(client):
    axis = _board(client).json()["periods"]
    code = axis[0]
    upper = _board(client, year=int(code[:4]), season=code[-1]).json()
    lower = _board(client, year=int(code[:4]), season=code[-1].lower()).json()
    assert upper["periods"] == lower["periods"] == [code]


def test_scoped_series_stay_aligned_with_the_scoped_axis(client):
    """Every crop's series must be as long as the axis it is plotted against."""
    code = _board(client).json()["periods"][0]
    body = _board(client, year=int(code[:4])).json()
    width = len(body["periods"])
    for crop in body["crops"]:
        for metric, values in crop["series"].items():
            assert len(values) == width, (crop["crop"], metric)


def test_unpublished_period_is_rejected_with_the_available_list(client):
    response = _board(client, period_code="2026C")
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "2026C" in detail
    assert "available" in detail


def test_unmatched_year_is_explained_not_returned_empty(client):
    response = _board(client, year=2001)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "2001" in detail


def test_invalid_season_is_rejected(client):
    year = int(_board(client).json()["periods"][0][:4])
    response = _board(client, year=year, season="D")
    assert response.status_code == 422
