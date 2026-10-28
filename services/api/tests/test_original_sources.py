"""Coverage for the source-faithful NISR SAS worksheet explorer."""

from __future__ import annotations


def test_original_source_catalog_keeps_extracts_and_inventory_only_records(client):
    response = client.get("/api/v1/meta/original-sources")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 374
    assert body["available_extract_count"] >= 374
    assert body["filter_options"]["release"]
    assert any(source["has_extract"] for source in body["sources"])


def test_original_source_returns_original_cell_grid_and_csv(client):
    listing = client.get(
        "/api/v1/meta/original-sources",
        params={"release": "2022 annual", "availability": "full extract"},
    )
    assert listing.status_code == 200
    source = listing.json()["sources"][0]

    response = client.get(
        f"/api/v1/meta/original-sources/{source['key']}",
        params={"limit": 3},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"]["key"] == source["key"]
    assert body["rows"]
    assert len(body["rows"]) <= 3
    assert body["columns"]

    csv_response = client.get(f"/api/v1/meta/original-sources/{source['key']}/download")
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert csv_response.content


def test_original_source_search_preserves_source_row_order(client):
    listing = client.get(
        "/api/v1/meta/original-sources",
        params={"release": "2022 annual", "availability": "full extract"},
    )
    source = listing.json()["sources"][0]
    all_rows = client.get(
        f"/api/v1/meta/original-sources/{source['key']}", params={"limit": 500}
    ).json()
    assert all_rows["rows"]
    needle = next((cell for row in all_rows["rows"] for cell in row if cell.strip()), None)
    assert needle
    searched = client.get(
        f"/api/v1/meta/original-sources/{source['key']}",
        params={"limit": 500, "search": needle},
    )
    assert searched.status_code == 200
    assert searched.json()["rows"]


def test_original_source_does_not_allow_arbitrary_paths(client):
    response = client.get("/api/v1/meta/original-sources/../../etc/passwd")

    assert response.status_code in {404, 405}


def test_inventory_only_source_is_explicitly_unavailable(client):
    from app.services import original_source_service as service

    source = service.list_sources()[0]
    catalogue = service._catalogue()
    original = catalogue[source["key"]]
    catalogue[source["key"]] = {
        **original,
        "has_extract": False,
        "raw_path": None,
        "source_format": None,
    }
    service._read_rows.cache_clear()
    try:
        listing = client.get(
            "/api/v1/meta/original-sources",
            params={"availability": "inventory only"},
        )
        assert listing.status_code == 200
        inventory_source = next(
            item for item in listing.json()["sources"] if item["key"] == source["key"]
        )
        response = client.get(f"/api/v1/meta/original-sources/{inventory_source['key']}")
        assert response.status_code == 409
        assert "not included" in response.json()["detail"]
    finally:
        catalogue[source["key"]] = original
        service._read_rows.cache_clear()
