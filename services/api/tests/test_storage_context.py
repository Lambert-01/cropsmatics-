"""National storage / cold-chain context endpoint tests.

The product rule under test: MINAGRI national totals must never be presented as
district or facility-level capacity, and a missing capacity must never become a
zero.
"""

from __future__ import annotations


def test_storage_infrastructure_is_national_level(client):
    res = client.get("/api/v1/analytics/storage-infrastructure")
    assert res.status_code == 200
    body = res.json()

    assert body["level_of_analysis"] == "national"
    assert "not facility-level capacity" in body["label"]
    assert body["items"], "published infrastructure rows should be returned"
    assert body["totals"] is not None

    # The derived summary row is exposed as `totals`, never as a normal item.
    types = [item["infrastructure_type"] for item in body["items"]]
    assert not any("ALL TYPES" in (t or "") for t in types)


def test_storage_items_never_carry_a_district(client):
    body = client.get("/api/v1/analytics/storage-infrastructure").json()
    for item in body["items"]:
        assert "district" not in item
    assert "district" not in body["totals"]


def test_program_facility_capacity_is_never_invented(client):
    body = client.get("/api/v1/analytics/storage-infrastructure").json()
    program = body["program"]

    assert program["facility_capacity"] is None
    assert program["facility_capacity_status"] == "not_verified"
    assert program["facility_location_status"] == "not_published"
    assert program["program_districts"], "program districts should be extracted from the source"


def test_program_districts_are_real_districts(client):
    body = client.get("/api/v1/analytics/storage-infrastructure").json()
    # The districts endpoint may return objects or plain names; normalise either.
    known = {
        (d["district"] if isinstance(d, dict) else d)
        for d in client.get("/api/v1/geography/districts").json()
    }
    for name in body["program"]["program_districts"]:
        assert name in known, f"{name} is not a known district"


def test_provenance_states_the_limitation(client):
    body = client.get("/api/v1/analytics/storage-infrastructure").json()
    limitations = " ".join(body["provenance"]["limitations"]).lower()
    assert "national" in limitations
    assert "not published" in limitations or "not verified" in limitations


def test_program_membership_endpoint_answers_membership_only(client):
    res = client.get("/api/v1/facilities/program-context?district=Rulindo")
    assert res.status_code == 200
    body = res.json()

    assert body["district_in_program"] is True
    assert body["capacity"] is None
    assert body["capacity_status"] == "not_verified"

    other = client.get("/api/v1/facilities/program-context?district=Nyagatare").json()
    assert other["district_in_program"] is False


def test_postharvest_exposes_stored_and_sold_shares(client):
    body = client.get("/api/v1/analytics/post-harvest").json()
    ids = {kpi["id"] for kpi in body["kpis"]}
    assert {"mean_stored_share", "mean_sold_share"}.issubset(ids)
