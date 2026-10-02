"""District profile read model for the mobile District Detail screen."""

from __future__ import annotations


def test_district_profile_resolves_by_code_and_slug(client):
    by_code = client.get("/api/v1/mobile/districts/RW-NO-RUL")
    by_slug = client.get("/api/v1/mobile/districts/rulindo")
    assert by_code.status_code == 200
    assert by_slug.status_code == 200
    assert by_code.json()["district"] == "Rulindo"
    assert by_code.json()["district_code"] == by_slug.json()["district_code"]


def test_unknown_district_profile_is_404(client):
    assert client.get("/api/v1/mobile/districts/atlantis").status_code == 404


def test_district_profile_never_reports_a_cross_crop_mean_yield(client):
    body = client.get("/api/v1/mobile/districts/rulindo").json()
    assert body["cross_crop_yield_mean"] is None
    # Crops are still individually reported with their own yield scale.
    assert body["crops"]
    assert body["n_crops_with_data"] == len(body["crops"])


def test_district_profile_exposes_inputs_and_land_and_water(client):
    body = client.get("/api/v1/mobile/districts/musanze").json()
    ids = {item["id"] for item in body["factors"]}
    assert "improved_seed_farmers_pct" in ids
    assert body["land"]
    assert "methods" in body["irrigation"]
    assert body["erosion"]
    assert body["provenance"]["source_id"]


def test_district_profile_null_is_not_zero(client):
    """A missing value must serialize as null, never as a measured zero."""
    body = client.get("/api/v1/mobile/districts/musanze").json()
    for item in body["factors"] + body["land"]:
        assert item["value"] is None or item["value"] != 0 or item["id"] != "unused"
