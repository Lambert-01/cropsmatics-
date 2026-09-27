"""The indicator catalogue must never offer a filter the data cannot answer."""

from __future__ import annotations

CATEGORIES = {
    "Productivity",
    "Inputs",
    "Irrigation",
    "Soil & Erosion",
    "Post-Harvest",
    "Infrastructure",
}


def test_indicator_categories_are_the_documented_six(client):
    body = client.get("/api/v1/mobile/indicators").json()
    labels = {item["label"] for item in body["categories"]}
    assert labels == CATEGORIES


def test_indicator_availability_requires_real_coverage(client):
    body = client.get("/api/v1/mobile/indicators").json()
    coverage = client.get("/api/v1/meta/data-coverage").json()["coverage"]

    for indicator in body["indicators"]:
        if not indicator["available"]:
            continue
        # Available means: a coverage level exists for the dataset/period pair.
        levels = coverage.get(indicator["dataset"], {})
        assert indicator["period"] in levels, indicator
        assert indicator["coverage_level"] == levels[indicator["period"]], indicator


def test_unavailable_indicators_are_explicitly_flagged(client):
    body = client.get("/api/v1/mobile/indicators").json()
    assert body["indicators"], "catalogue must not be empty"
    for indicator in body["indicators"]:
        assert isinstance(indicator["available"], bool)
        if not indicator["available"]:
            # Never claim a period for something we cannot serve.
            assert indicator["available"] is False


def test_district_level_indicators_report_district_coverage(client):
    body = client.get("/api/v1/mobile/indicators").json()
    district_level = {
        "yield",
        "production",
        "improved_seed",
        "irrigation_farmers",
        "erosion_bench_terraces",
    }
    for indicator in body["indicators"]:
        if indicator["id"] in district_level:
            assert indicator["available"] is True, indicator
            assert indicator["coverage_level"] == "district", indicator


def test_indicator_with_no_matching_column_is_not_offered(client):
    """Guards the rule: never offer a filter the processed tables cannot answer.

    ``postharvest_infrastructure`` is registered against a column name that the
    processed table does not carry, so it must be reported unavailable.
    """
    body = client.get("/api/v1/mobile/indicators").json()
    infra = next(item for item in body["indicators"] if item["id"] == "postharvest_infrastructure")
    assert infra["available"] is False
