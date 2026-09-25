from __future__ import annotations


def test_districts_cover_rwanda(client):
    resp = client.get("/api/v1/geography/districts")
    assert resp.status_code == 200
    districts = resp.json()
    assert len(districts) == 30
    names = {d["district"] for d in districts}
    assert {"Gasabo", "Musanze", "Rwamagana", "Rusizi"} <= names


def test_provinces(client):
    resp = client.get("/api/v1/geography/provinces")
    assert resp.status_code == 200
    provinces = resp.json()
    assert len(provinces) == 5
    assert sum(len(p["districts"]) for p in provinces) == 30


def test_crops(client):
    resp = client.get("/api/v1/crops")
    assert resp.status_code == 200
    crops = resp.json()
    assert len(crops) >= 17
    names = {c["crop_name"] for c in crops}
    assert {"Maize", "Cassava", "Paddy rice"} <= names
    maize = next(c for c in crops if c["crop_name"] == "Maize")
    assert maize["perishability"] == "low"
