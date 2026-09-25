"""Tests for the upgraded /meta/dataset/{key} explorer endpoint.

Only whitelisted exact-match filters are accepted; sorting is restricted to
real columns with a safe direction. Unsupported filters must be rejected with
a 400 — never silently ignored, never turned into arbitrary expressions.
"""

from __future__ import annotations


def _require_data(client) -> None:
    res = client.get("/api/v1/meta/dataset/district_crop_productivity?limit=1")
    if res.status_code == 503:
        import pytest

        pytest.skip("processed tables not built; run `make data`")


def test_dataset_accepts_supported_crop_filter(client):
    _require_data(client)
    res = client.get("/api/v1/meta/dataset/district_crop_productivity", params={"crop": "Maize"})
    assert res.status_code == 200
    body = res.json()
    if body["count"] == 0:
        import pytest

        pytest.skip("Maize not present in this build")
    for row in body["rows"]:
        assert str(row["canonical_crop_name"]).lower() == "maize"


def test_dataset_rejects_unsupported_filter_with_400(client):
    _require_data(client)
    res = client.get(
        "/api/v1/meta/dataset/crop_postharvest_use",
        params={"district": "Bugesera"},
    )
    assert res.status_code == 400
    assert "not supported" in res.json()["detail"]


def test_dataset_sort_by_real_column_asc_and_desc(client):
    _require_data(client)
    asc = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"sort_by": "district", "sort_dir": "asc", "limit": 5},
    ).json()
    desc = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"sort_by": "district", "sort_dir": "desc", "limit": 5},
    ).json()
    assert asc["rows"][0]["district"] <= asc["rows"][-1]["district"]
    assert desc["rows"][0]["district"] >= desc["rows"][-1]["district"]


def test_dataset_rejects_sort_by_unknown_column(client):
    _require_data(client)
    res = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"sort_by": "not_a_column; DROP TABLE x"},
    )
    assert res.status_code == 400


def test_dataset_rejects_invalid_sort_direction(client):
    _require_data(client)
    res = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"sort_by": "district", "sort_dir": " sideways"},
    )
    assert res.status_code == 422  # pattern validation on the query param


def test_dataset_numeric_sort_orders_numerically(client):
    _require_data(client)
    body = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"sort_by": "yield_kg_ha", "sort_dir": "desc", "limit": 20},
    ).json()
    yields = [r["yield_kg_ha"] for r in body["rows"] if r["yield_kg_ha"] is not None]
    assert yields == sorted(yields, reverse=True)
