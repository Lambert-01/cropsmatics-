"""Canonical data endpoints and the honesty of their fallback.

The suite runs with an unreachable database (see `conftest.py`), so these cover
the fallback path. The properties asserted are the ones a client depends on:
which layer answered is always named, and an unavailable database is never
presented as an absence of data.
"""

from __future__ import annotations


def test_data_version_reports_which_layer_answered(client):
    body = client.get("/api/v1/data/version").json()

    assert body["source"] in {"postgres", "processed_csv"}
    assert body["generated_at"]
    assert body["data"]

    # The canonical availability is explicit, including the reason it is not
    # serving. "No database here" must never look like "no data exists".
    canonical = body["data"]["canonical"]
    assert canonical["availability"] in {"ready", "empty", "unavailable"}
    if canonical["availability"] != "ready":
        assert canonical["reason"]


def test_data_version_falls_back_to_the_manifest_when_the_database_is_down(client):
    body = client.get("/api/v1/data/version").json()

    assert body["source"] == "processed_csv"
    assert body["data"]["available"] is True
    assert body["data"]["pipeline_version"]
    # The fallback states that it is a fallback.
    assert any("PostgreSQL is not serving" in note for note in body["limitations"])


def test_data_coverage_still_answers_without_a_database(client):
    body = client.get("/api/v1/data/coverage").json()

    assert body["source"] == "processed_csv"
    details = body["data"]["details"]
    assert details, "expected the coverage matrix"

    # Coverage keeps the district/national distinction rather than flattening it.
    levels = {row["coverage_level"] for row in details}
    assert "district" in levels
    periods = {row["period"] for row in details}
    assert {"2024A", "2025B", "2026B"}.issubset(periods)


def test_data_coverage_never_invents_an_unpublished_period(client):
    body = client.get("/api/v1/data/coverage").json()
    periods = {row["period"] for row in body["data"]["details"]}
    assert "2026C" not in periods


def test_indicators_endpoint_serves_the_data_dictionary(client):
    body = client.get("/api/v1/meta/indicators").json()

    assert body["count"] == len(body["indicators"])
    assert body["count"] > 0
    assert body["source"] in {"postgres", "catalogue"}

    by_code = {item["indicator_code"]: item for item in body["indicators"]}
    seed = by_code["improved_seed_farmers_pct"]
    assert seed["unit_code"] == "percent_farmers"
    assert seed["geographic_levels"] == ["district"]
    assert seed["has_crop_dimension"] is False
    assert seed["unit_dimension"] == "share"


def test_district_and_national_indicators_stay_distinct(client):
    """A national series must never be presented as a district one."""
    body = client.get("/api/v1/meta/indicators").json()
    by_code = {item["indicator_code"]: item for item in body["indicators"]}

    assert by_code["improved_seed_farmers_pct"]["geographic_levels"] == ["district"]
    national = by_code["improved_seed_pct"]
    assert national["geographic_levels"] == ["national"]
    assert "national" in national["name"].lower()


def test_crop_dimension_indicators_declare_the_dimension(client):
    body = client.get("/api/v1/meta/indicators").json()
    by_code = {item["indicator_code"]: item for item in body["indicators"]}
    assert by_code["sold_pct"]["has_crop_dimension"] is True
    assert by_code["sold_pct"]["unit_code"] == "percent_production"
    # District land use is not crop-specific.
    assert by_code["agricultural_land_000ha"]["has_crop_dimension"] is False


def test_indicators_are_ordered_by_domain_for_a_reader(client):
    body = client.get("/api/v1/meta/indicators").json()
    domains = [item["domain"] for item in body["indicators"]]
    assert domains == sorted(domains, key=lambda d: ["practices", "inputs", "land_use", "irrigation", "erosion", "postharvest"].index(d))


def test_readiness_reports_canonical_availability_separately(client):
    body = client.get("/api/v1/health/readiness").json()

    assert body["database"] in {"connected", "optional/unavailable"}
    assert body["canonical"]["availability"] in {"ready", "empty", "unavailable"}
    # A database that is not serving canonical data is a reported state, not a
    # readiness failure: the processed files still answer.
    assert body["status"] in {"ready", "degraded"}
