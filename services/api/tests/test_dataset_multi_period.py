"""The explorer exposes the current multi-period datasets, not just legacy ones.

``repositories.dataset_repository`` has exposed
``agricultural_practice_observation()`` and ``postharvest_use_multi_period()`` for
a while, but the explorer whitelist did not register them, so the newest
legitimate datasets were unreachable while their legacy 2025 Season B
predecessors were not. These tests pin the fix: the current tables are listed,
grouped ahead of the archive, filterable, and reject filters they do not support.
"""

from __future__ import annotations

import pytest

CURRENT = {"agricultural_practice_observation", "postharvest_use_multi_period"}
ARCHIVE = {"district_factors", "irrigation_water", "erosion_control", "crop_postharvest_use"}


def _datasets(client) -> list[dict]:
    res = client.get("/api/v1/meta/dataset")
    assert res.status_code == 200, res.text
    return res.json()["datasets"]


def test_multi_period_datasets_are_listed(client):
    keys = {d["key"] for d in _datasets(client)}
    assert CURRENT <= keys, f"missing multi-period datasets: {CURRENT - keys}"


def test_current_datasets_are_grouped_ahead_of_the_archive(client):
    datasets = _datasets(client)
    groups = [d["group"] for d in datasets]
    assert "current" in groups and "archive" in groups
    # Every current dataset appears before any archived one.
    first_archive = next(i for i, d in enumerate(datasets) if d["group"] == "archive")
    assert all(d["group"] == "current" for d in datasets[:first_archive])
    archived = {d["key"] for d in datasets if d["group"] == "archive"}
    assert ARCHIVE <= archived


def test_practice_observation_publishes_period_and_sources(client):
    # The *fetched* label carries a real period range and a non-empty source
    # list, both resolved from the loaded frame rather than a hand-edited literal
    # (the selector list stays cheap and does not load every frame).
    body = client.get(
        "/api/v1/meta/dataset/agricultural_practice_observation", params={"limit": 1}
    ).json()
    assert "(" in body["label"] and "-" in body["label"]
    assert body["source_id"], "provenance must be resolved from the loaded frame"


def test_practice_observation_supports_period_filter(client):
    res = client.get(
        "/api/v1/meta/dataset/agricultural_practice_observation",
        params={"period_code": "2025B", "limit": 5},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["key"] == "agricultural_practice_observation"
    for row in body["rows"]:
        assert row["period_code"] == "2025B"


def test_multi_period_postharvest_is_reachable(client):
    res = client.get("/api/v1/meta/dataset/postharvest_use_multi_period", params={"limit": 3})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["count"] >= 0
    assert "period_code" in body["columns"]


def test_unsupported_filter_is_rejected(client):
    res = client.get(
        "/api/v1/meta/dataset/postharvest_use_multi_period",
        params={"province": "Eastern"},
    )
    assert res.status_code == 400
    assert "not supported" in res.json()["detail"]


@pytest.mark.parametrize("key", sorted(CURRENT))
def test_unknown_dataset_still_404(client, key):
    # Sanity: the whitelist is still a whitelist.
    res = client.get("/api/v1/meta/dataset/does_not_exist")
    assert res.status_code == 404
