"""Tests for the optional compare-crops view of /analytics/trends."""

from __future__ import annotations


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/trends")
    if res.status_code == 503:
        import pytest

        pytest.skip("processed tables not built; run `make data`")


def test_compare_requires_two_to_five_crops(client):
    _require_data(client)
    assert client.get("/api/v1/analytics/trends", params={"compare": "Maize"}).status_code == 422
    six = ",".join(["Maize"] * 6)
    assert client.get("/api/v1/analytics/trends", params={"compare": six}).status_code == 422


def test_compare_returns_per_crop_series_without_yield(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/trends", params={"compare": "Maize,Beans"})
    if res.status_code == 200:
        body = res.json()
        assert body["kind"] == "crop_trends_compare"
        assert sorted(body["compared_crops"]) == ["Beans", "Maize"]
        # No yield metric in the compare view: raw yields are not comparable
        # across crop species without natural-scale context.
        for point in body["points"]:
            assert not any(key.startswith("yield") for key in point["values"])


def test_single_crop_trends_still_works_unchanged(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/trends", params={"crop": "Maize"})
    assert res.status_code == 200
    body = res.json()
    assert body["kind"] == "crop_trends"
    assert body["compared_crops"] is None
