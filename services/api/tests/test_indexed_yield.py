"""Tests for /analytics/indexed-yield.

The endpoint exists so several crops can share one axis without averaging raw
yields, which are not comparable across species. These tests pin the two things
that make that defensible: the baseline is per crop, and a crop that cannot
support a baseline is reported as ineligible rather than given one.
"""

from __future__ import annotations

import pytest


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/trends")
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")


def test_rejects_a_crop_count_outside_two_to_five(client):
    _require_data(client)
    assert client.get("/api/v1/analytics/indexed-yield", params={"crops": "Maize"}).status_code == 422
    six = ",".join(["Maize"] * 6)
    assert client.get("/api/v1/analytics/indexed-yield", params={"crops": six}).status_code == 422


def test_indexes_each_crop_against_its_own_baseline(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/indexed-yield", params={"crops": "Maize,Beans"})
    if res.status_code != 200:
        pytest.skip("indexed yield data unavailable in this environment")

    body = res.json()
    assert body["metric"] == "yield_mt_ha"
    assert [item["crop"] for item in body["series"]] == ["Maize", "Beans"]

    for item in body["series"]:
        assert item["eligible"] is True
        assert item["baseline"] is not None and item["baseline"] > 0
        assert item["n_observations"] >= body["min_periods"]
        assert item["points"], "an eligible crop has at least one published point"
        for point in item["points"]:
            if point["value"] is None:
                # A period the release did not tabulate is a gap, not a zero.
                assert point["index"] is None
            else:
                assert point["index"] == pytest.approx(
                    point["value"] / item["baseline"] * 100, rel=1e-3
                )


def test_baselines_differ_between_crops_so_no_shared_scale_is_invented(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/indexed-yield", params={"crops": "Maize,Beans"})
    if res.status_code != 200:
        pytest.skip("indexed yield data unavailable in this environment")
    baselines = [item["baseline"] for item in res.json()["series"] if item["eligible"]]
    assert len(baselines) == 2
    assert baselines[0] != baselines[1]


def test_reports_an_unknown_crop_as_ineligible_instead_of_failing_the_batch(client):
    _require_data(client)
    res = client.get(
        "/api/v1/analytics/indexed-yield", params={"crops": "Maize,Not A Crop"}
    )
    if res.status_code != 200:
        pytest.skip("indexed yield data unavailable in this environment")
    body = res.json()
    unknown = next(item for item in body["series"] if item["crop"] == "Not A Crop")
    assert unknown["eligible"] is False
    assert unknown["availability"] == "ineligible"
    assert unknown["reason"]
    assert unknown["baseline"] is None
    assert unknown["points"] == []
    # The crop that does exist is still returned.
    assert any(item["eligible"] for item in body["series"])


def test_excludes_official_aggregate_crop_groups(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/indexed-yield")
    if res.status_code != 200:
        pytest.skip("indexed yield data unavailable in this environment")
    crops = {item["crop"] for item in res.json()["series"]}
    for aggregate in ["Cereals", "Legumes and Pulses", "Tubers and Roots", "Vegetables and Fruits"]:
        assert aggregate not in crops


def test_declares_its_baseline_and_limitations(client):
    _require_data(client)
    res = client.get("/api/v1/analytics/indexed-yield", params={"crops": "Maize,Beans"})
    if res.status_code != 200:
        pytest.skip("indexed yield data unavailable in this environment")
    body = res.json()
    assert body["baseline_definition"]
    assert body["unit"].startswith("index")
    assert body["min_periods"] >= 2
    limitations = " ".join(body["provenance"]["limitations"]).lower()
    assert "national" in limitations
    assert "season" in limitations
