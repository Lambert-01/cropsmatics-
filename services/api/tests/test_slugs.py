"""URL-safe entity routes: crops and districts resolve by code or slug.

Guards the rule that a route never interpolates a raw name such as
``/explore/crop/Irish Potato`` — the client uses a stable code or slug instead.
"""

from __future__ import annotations


def test_crop_resolves_by_code(client):
    by_code = client.get("/api/v1/crops/CROP-MAI").json()
    assert by_code["crop_name"] == "Maize"
    assert by_code["crop_code"] == "CROP-MAI"


def test_crop_resolves_by_slug_case_insensitively(client):
    by_slug = client.get("/api/v1/crops/maize").json()
    assert by_slug["crop_code"] == "CROP-MAI"


def test_multiword_crop_slug_resolves(client):
    row = client.get("/api/v1/crops/irish-potato").json()
    assert row["crop_name"] == "Irish potato"


def test_unknown_crop_slug_is_404(client):
    assert client.get("/api/v1/crops/not-a-crop").status_code == 404


def test_district_resolves_by_code_and_slug(client):
    by_code = client.get("/api/v1/geography/districts/RW-NO-RUL").json()
    by_slug = client.get("/api/v1/geography/districts/rulindo").json()
    assert by_code["district"] == "Rulindo"
    assert by_code["district_code"] == by_slug["district_code"]


def test_unknown_district_slug_is_404(client):
    assert client.get("/api/v1/geography/districts/atlantis").status_code == 404
