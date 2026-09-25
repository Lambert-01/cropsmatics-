"""Tests for crop filtering on the post-harvest analytics endpoint.

The post-harvest dataset is national crop-level for a single period (2025-B).
``crop`` is the only filter with a real effect; district must be a no-op and
year/season must be ignored — not silently pretended to apply.
"""

from __future__ import annotations


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/post-harvest")
    if res.status_code == 503:
        import pytest

        pytest.skip("processed tables not built; run `make data`")
    return None


def test_post_harvest_crop_filter_narrows_to_that_crop(client):
    _require_data(client)
    all_crops = {c["crop"] for c in client.get("/api/v1/analytics/post-harvest").json()["crops"]}
    assert all_crops, "expected crops in the post-harvest dataset"

    sample = sorted(all_crops)[0]
    body = client.get("/api/v1/analytics/post-harvest", params={"crop": sample}).json()

    assert body["crops"], f"expected rows for {sample}"
    assert {c["crop"] for c in body["crops"]} == {sample}
    # KPIs are recomputed over the filtered frame, so extremes must reflect it.
    highest = body["kpis"][0]
    if highest["note"] is not None:
        assert highest["note"] == sample


def test_post_harvest_crop_filter_is_case_insensitive(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/post-harvest", params={"crop": "maize"}).json()
    if body.get("detail") is not None and not body.get("crops"):
        import pytest

        pytest.skip("Maize not present in this dataset build")
    assert body["crops"]
    assert {c["crop"].lower() for c in body["crops"]} == {"maize"}


def test_post_harvest_unknown_crop_returns_404_with_helpful_detail(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/post-harvest", params={"crop": "Totally Unknown Crop"})
    assert res.status_code == 404
    detail = res.json()["detail"]
    assert "Totally Unknown Crop" in detail
    assert "/api/v1/crops" in detail


def test_post_harvest_district_filter_is_a_noop_not_a_fabrication(client):
    """The dataset has no district dimension: district must not change results."""
    _require_data(client)
    base = client.get("/api/v1/analytics/post-harvest").json()
    with_district = client.get(
        "/api/v1/analytics/post-harvest", params={"district": "Bugesera"}
    ).json()

    assert {c["crop"] for c in base["crops"]} == {c["crop"] for c in with_district["crops"]}
    assert (
        base["kpis"][0]["value"]
        == with_district["kpis"][0]["value"]
    )


def test_post_harvest_province_filter_is_a_noop(client):
    _require_data(client)
    base = client.get("/api/v1/analytics/post-harvest").json()
    with_province = client.get(
        "/api/v1/analytics/post-harvest", params={"province": "Eastern Province"}
    ).json()

    assert {c["crop"] for c in base["crops"]} == {c["crop"] for c in with_province["crops"]}


def test_post_harvest_year_season_are_ignored_for_single_period_dataset(client):
    """One published period exists; year/season params must not fabricate rows."""
    _require_data(client)
    base = client.get("/api/v1/analytics/post-harvest").json()
    with_period = client.get(
        "/api/v1/analytics/post-harvest", params={"year": 2024, "season": "A"}
    ).json()

    # The filter is ignored (2024-A does not exist in this dataset), so the
    # response must be identical to the unfiltered one rather than empty.
    assert {c["crop"] for c in base["crops"]} == {c["crop"] for c in with_period["crops"]}
    assert len(with_period["crops"]) == len(base["crops"])
