"""Market Intelligence.

The domain is currently in its **zero-observation** state, which is a first-class
product state rather than an error. Two properties matter most and are pinned here:

* with no verified observation, every endpoint answers honestly - it says no price
  is available and why, and it never returns an illustrative, sample or default
  price to fill the page;
* when observations *do* exist, price types are never blended into a single
  number. That cannot be exercised through the API while the table is empty, so it
  is tested directly against the service with a fixture frame.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.services import market_service

MARKET_ENDPOINTS = [
    "/api/v1/markets/status",
    "/api/v1/markets/coverage",
    "/api/v1/markets/commodities",
    "/api/v1/markets/markets",
    "/api/v1/markets/observations",
    "/api/v1/markets/latest",
]


def _get(client, path: str, **params):
    res = client.get(path, params=params or None)
    assert res.status_code == 200, res.text
    return res.json()


# --- the zero-observation state (the real, current state) ----------------------


def test_status_states_that_no_price_is_loaded_and_why(client):
    body = _get(client, "/api/v1/markets/status")
    assert body["data_available"] is False
    assert body["observations"] == 0
    assert body["reason"]
    assert "schema" in body["reason"].lower()
    # The table is genuinely registered, so its absence is a data state, not a bug.
    assert body["table_present"] is True


def test_no_market_endpoint_returns_a_price_when_none_is_verified(client):
    """Nothing may be filled in to make the page look complete."""
    for path in MARKET_ENDPOINTS:
        body = _get(client, path)
        if path.endswith("/status"):
            continue
        assert body.get("data_available") is False, path
        for key in ("rows", "series", "groups"):
            assert not body.get(key), f"{path} returned {key} with no observations"
        assert body.get("reason"), f"{path} must explain why it is empty"


def test_commodities_and_markets_are_empty_rather_than_invented(client):
    assert _get(client, "/api/v1/markets/commodities")["commodities"] == []
    assert _get(client, "/api/v1/markets/markets")["markets"] == []


def test_trend_and_dispersion_are_empty_for_a_real_commodity(client):
    trend = _get(client, "/api/v1/markets/trend", commodity="Maize")
    assert trend["data_available"] is False
    assert trend["series"] == []
    assert trend["reason"]

    dispersion = _get(client, "/api/v1/markets/dispersion", commodity="Maize")
    assert dispersion["data_available"] is False
    assert dispersion["groups"] == []
    assert dispersion["reason"]


def test_the_response_never_offers_sample_or_illustrative_data(client):
    """A reader must never see a number presented as a price."""
    for path in MARKET_ENDPOINTS:
        text = str(_get(client, path)).lower()
        for banned in ("sample", "demo", "illustrative", "dummy", "placeholder"):
            assert banned not in text, f"{path} mentions {banned!r}"


def test_the_supported_price_types_are_declared_and_separate(client):
    status = _get(client, "/api/v1/markets/status")
    assert status["price_types_supported"] == list(market_service.PRICE_TYPES)
    # With no rows there is no type present, which is different from declaring none.
    assert status["price_types_present"] == []

    coverage = _get(client, "/api/v1/markets/coverage")
    assert coverage["price_types"] == []
    assert coverage["unrecognised_price_types"] == []


def test_status_names_the_missing_source_so_the_gap_is_actionable(client):
    body = _get(client, "/api/v1/markets/status")
    assert body["registered_sources"] == []
    assert any("source" in note.lower() for note in body["notes"])


def test_trend_and_dispersion_require_a_commodity(client):
    for path in ("/api/v1/markets/trend", "/api/v1/markets/dispersion"):
        assert client.get(path).status_code == 422


def test_observations_is_paginated_even_when_empty(client):
    body = _get(client, "/api/v1/markets/observations", limit=50, offset=10)
    assert body["total"] == 0
    assert body["limit"] == 50
    assert body["offset"] == 10
    assert body["rows"] == []
    assert body["mixes_price_types"] is False


# --- price-type separation, against a fixture frame ----------------------------


def _obs(price_type, price, date="2026-01-05", market="Kimironko"):
    return {
        "observation_key": f"{price_type}-{market}-{date}-{price}",
        "observation_date": date,
        "commodity_name_raw": "Maize",
        "market_name": market,
        "district": "Gasabo",
        "province": "Kigali City",
        "price_type": price_type,
        "price_value_original": price,
        "currency_original": "RWF",
        "unit_original": "kg",
        "conversion_basis": "per kg",
        "price_rwf_per_kg": price,
        "source_id": "TEST",
        "is_synthetic": False,
    }


def _fixture() -> pd.DataFrame:
    rows = [
        _obs("wholesale", 500.0),
        _obs("wholesale", 540.0, date="2026-01-06"),
        _obs("retail", 700.0),
        _obs("retail", 760.0, date="2026-01-06", market="Nyabugogo"),
        _obs("farmgate", 380.0, date="2026-01-06"),
        # Must never count as evidence.
        {**_obs("retail", 9.0, date="2026-01-07"), "is_synthetic": True},
        # An undefined label: kept and flagged, never folded into "unspecified".
        _obs("spot", 1234.0, date="2026-01-06"),
    ]
    return pd.DataFrame(rows)


@pytest.fixture
def fixture_market(monkeypatch):
    frame = _fixture()
    monkeypatch.setattr(market_service, "_table", lambda: (frame, None))
    return frame


def test_synthetic_rows_are_excluded_from_evidence(fixture_market):
    status = market_service.status()
    assert status["synthetic_rows"] == 1
    # 7 rows in the file, 6 of which are evidence.
    assert status["rows_in_file"] == 7
    assert status["observations"] == 6
    assert any("synthetic" in note.lower() for note in status["notes"])


def test_latest_returns_one_row_per_market_and_price_type(fixture_market):
    body = market_service.latest()
    assert body["data_available"] is True

    # One row per commodity x market x price type, so retail appears once for each
    # market rather than being averaged into a single retail price.
    pairs = [(row["market_name"], row["price_type"]) for row in body["rows"]]
    assert len(pairs) == len(set(pairs)), "a market/type pair must appear exactly once"
    assert {row["price_type"] for row in body["rows"]} == {
        "wholesale",
        "retail",
        "farmgate",
        "spot",
    }

    # The synthetic 9.0 must never be surfaced as a price.
    assert not any(
        row.get("price_rwf_per_kg") == 9.0 for row in body["rows"]
    ), "a synthetic row must never be surfaced as a price"

    # Each row carries exactly one price type, so nothing is a blend of two.
    assert all(row["price_type"] for row in body["rows"])


def test_trend_keeps_price_types_as_separate_series(fixture_market):
    body = market_service.trend(commodity="Maize")
    assert body["data_available"] is True
    series = {item["price_type"]: item for item in body["series"]}
    assert set(series) == {"wholesale", "retail", "farmgate", "spot"}
    # Two points for wholesale (two dates), and the values are the observations.
    assert len(series["wholesale"]["points"]) == 2
    assert [p["value"] for p in series["wholesale"]["points"]] == [500.0, 540.0]
    # Each series carries its own observation count, so a thin line is visible.
    assert all(item["n_observations"] > 0 for item in body["series"])


def test_filtering_to_one_price_type_never_returns_another(fixture_market):
    body = market_service.trend(commodity="Maize", price_type="retail")
    assert [item["price_type"] for item in body["series"]] == ["retail"]
    assert [p["value"] for item in body["series"] for p in item["points"]] == [700.0, 760.0]


def test_dispersion_groups_by_price_type(fixture_market):
    body = market_service.dispersion(commodity="Maize")
    groups = {item["price_type"]: item for item in body["groups"]}
    assert set(groups) == {"wholesale", "retail", "farmgate", "spot"}
    assert groups["retail"]["minimum"] == 700.0
    assert groups["retail"]["maximum"] == 760.0
    # A spread is reported inside a type, never across types.
    assert groups["retail"]["range"] == 60.0


def test_observations_reports_when_a_page_mixes_price_types(fixture_market):
    body = market_service.observations()
    assert body["mixes_price_types"] is True
    assert len(body["price_types_returned"]) > 1
    # Every row still carries its own type, so nothing can be blended by a client.
    assert all(row["price_type"] for row in body["rows"])
    assert body["rows"][0]["currency_original"] == "RWF"
    assert body["rows"][0]["unit_original"] == "kg"


def test_an_unrecognised_price_type_is_flagged_not_reclassified(fixture_market):
    coverage = market_service.coverage()
    assert coverage["unrecognised_price_types"] == ["spot"]
    labels = {item["value"] for item in coverage["price_types"]}
    # "spot" stays itself; it is not hidden inside "unspecified".
    assert "spot" in labels
    assert coverage["observations"] == 6
