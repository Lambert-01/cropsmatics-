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


def _require_practice_data(client) -> None:
    """Probe the table the practice/domain tests read; same 503-skip contract."""
    res = client.get("/api/v1/meta/dataset/agricultural_practice_observation?limit=1")
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


def test_search_treats_regex_punctuation_as_literal(client):
    """`[`, `(`, `*` are ordinary characters in a literal substring search.

    The explorer used str.contains() with regex on, so a search for "["
    raised re.error inside the request and surfaced as an unhandled 500.
    """
    _require_data(client)
    for needle in ("[", "(", "*", "yield|kg", "a+"):
        res = client.get(
            "/api/v1/meta/dataset/district_crop_productivity",
            params={"search": needle},
        )
        assert res.status_code == 200, needle
        assert isinstance(res.json()["count"], int)


def test_nonexistent_indicator_returns_an_explicit_empty_result(client):
    """A filter value that matches nothing is a 200 with count 0 — the honest
    empty result — not a 400 (the filter is supported) and not a 404."""
    _require_practice_data(client)
    res = client.get(
        "/api/v1/meta/dataset/agricultural_practice_observation",
        params={"indicator_code": "zzz_not_a_real_indicator"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 0
    assert body["rows"] == []


def test_domain_filter_supported_where_declared_and_rejected_elsewhere(client):
    _require_practice_data(client)
    supported = client.get(
        "/api/v1/meta/dataset/agricultural_practice_observation",
        params={"domain": "zzz_not_a_real_domain"},
    )
    assert supported.status_code == 200
    assert supported.json()["count"] == 0

    rejected = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"domain": "irrigation"},
    )
    assert rejected.status_code == 400
    assert "not supported" in rejected.json()["detail"]


def test_dataset_catalog_declares_its_supported_filters(client):
    """The catalog tells the UI which controls are dataset-appropriate, so the
    explorer never offers a filter the API will only 400."""
    listing = client.get("/api/v1/meta/dataset").json()["datasets"]
    by_key = {d["key"]: d for d in listing}
    assert "indicator_code" in by_key["agricultural_practice_observation"]["filters"]
    assert "domain" in by_key["agricultural_practice_observation"]["filters"]
    assert "indicator_code" in by_key["postharvest_use_multi_period"]["filters"]
    assert by_key["crop_postharvest_use"]["filters"] == ["crop"]
    assert by_key["cold_chain_network_summary"]["filters"] == []


def test_every_catalog_filter_is_accepted_by_json_and_csv(client):
    """The catalog is an executable HTTP contract, not documentation only.

    A value that matches no row is intentional here: it still exercises the
    route declaration, parser and dataset whitelist without depending on which
    release happens to contain the probe value. A stale advertised dimension
    would return 400 in either representation and fail this test.
    """
    listing = client.get("/api/v1/meta/dataset").json()["datasets"]
    probe_values = {
        "period_code": "2025B",
        "year": "2025",
        "season": "B",
    }
    for dataset in listing:
        key = dataset["key"]
        for filter_name in dataset["filters"]:
            params = {filter_name: probe_values.get(filter_name, "__contract_probe__")}
            json_response = client.get(f"/api/v1/meta/dataset/{key}", params=params)
            assert json_response.status_code in {200, 503}, (key, filter_name)
            csv_response = client.get(f"/api/v1/reports/dataset/{key}.csv", params=params)
            assert csv_response.status_code in {200, 503}, (key, filter_name)


def test_csv_export_matches_the_json_scope(client):
    """The explorer's download link passes search/filters/sort through, so the
    CSV holds exactly the rows the table shows — not the whole table."""
    import csv as csv_module
    import io

    _require_data(client)
    params = {"crop": "Maize", "search": "Maize", "sort_by": "district", "sort_dir": "asc"}
    json_body = client.get(
        "/api/v1/meta/dataset/district_crop_productivity", params=params
    ).json()

    res = client.get(
        "/api/v1/reports/dataset/district_crop_productivity.csv", params=params
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    rows = list(csv_module.reader(io.StringIO(res.text)))
    assert rows, "CSV always carries a header row"
    assert len(rows) - 1 == json_body["count"]
    # Every exported row honours the filter that produced it.
    header = rows[0]
    crop_col = header.index("canonical_crop_name")
    for row in rows[1:]:
        assert row[crop_col].lower() == "maize"


def test_csv_export_keeps_the_same_whitelist_as_the_json_endpoint(client):
    _require_data(client)
    rejected = client.get(
        "/api/v1/reports/dataset/crop_postharvest_use.csv",
        params={"district": "Bugesera"},
    )
    assert rejected.status_code == 400
    assert "not supported" in rejected.json()["detail"]

    unknown_period = client.get(
        "/api/v1/reports/dataset/crop_productivity.csv",
        params={"period_code": "9999X"},
    )
    assert unknown_period.status_code == 422

    unknown_dataset = client.get("/api/v1/reports/dataset/not_a_dataset.csv")
    assert unknown_dataset.status_code == 404


def test_dataset_rejects_unknown_query_parameters(client):
    """FastAPI silently drops undeclared params; the explorer refuses them.

    A typo like `indicatr_code` must not look like it was applied.
    """
    _require_data(client)
    res = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"bogus_param": "1"},
    )
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "bogus_param" in detail
    assert "accepted:" in detail


def test_csv_export_rejects_unknown_query_parameters(client):
    res = client.get("/api/v1/reports/dataset/crops.csv", params={"bogus_param": "1"})
    assert res.status_code == 400
    assert "bogus_param" in res.json()["detail"]


def test_search_is_literal_for_unicode_and_empty_queries(client):
    _require_data(client)
    # Unicode must be searched as text, never as a pattern or a codec error.
    for needle in ("é", "ö", "日本語", "א"):
        res = client.get(
            "/api/v1/meta/dataset/district_crop_productivity",
            params={"search": needle},
        )
        assert res.status_code == 200, needle
    # An empty search is "no search", and a needle that matches nothing is an
    # explicit empty result — not an error and not the unfiltered table.
    unfiltered = client.get(
        "/api/v1/meta/dataset/district_crop_productivity", params={"limit": 1}
    ).json()["count"]
    empty_string = client.get(
        "/api/v1/meta/dataset/district_crop_productivity", params={"search": ""}
    ).json()["count"]
    assert empty_string == unfiltered
    no_match = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={"search": "zzz_no_row_contains_this"},
    ).json()
    assert no_match["count"] == 0
    assert no_match["rows"] == []


def test_dataset_pagination_windows_are_consistent(client):
    _require_data(client)
    params = {"sort_by": "district", "sort_dir": "asc"}
    head = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={**params, "limit": 3, "offset": 0},
    ).json()
    tail = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={**params, "limit": 3, "offset": 3},
    ).json()
    reference = client.get(
        "/api/v1/meta/dataset/district_crop_productivity",
        params={**params, "limit": 6, "offset": 0},
    ).json()
    # Count is a property of the filtered set, not of the window.
    assert head["count"] == tail["count"] == reference["count"]
    assert head["offset"] == 0 and tail["offset"] == 3
    # Each window is exactly the slice it claims to be of the same stable sort.
    assert head["rows"] == reference["rows"][: len(head["rows"])]
    assert tail["rows"] == reference["rows"][3 : 3 + len(tail["rows"])]
    assert len(head["rows"]) <= 3 and len(tail["rows"]) <= 3
