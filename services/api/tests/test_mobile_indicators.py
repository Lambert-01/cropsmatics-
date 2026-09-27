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


def test_postharvest_infrastructure_registry_uses_the_real_column(client):
    """Regression: the registry previously keyed infrastructure on a column
    named ``indicator`` that the processed table does not carry, which silently
    marked the indicator unavailable. The real key is ``infrastructure_type``.
    """
    body = client.get("/api/v1/mobile/indicators").json()
    infra = next(item for item in body["indicators"] if item["id"] == "postharvest_infrastructure")
    assert infra["column"] == "infrastructure_type"
    assert infra["available"] is True
    assert infra["coverage_level"] == "national"
    assert infra["aggregation"] == "specialized"


def test_indicators_declare_an_aggregation_policy(client):
    body = client.get("/api/v1/mobile/indicators").json()
    policy = {item["id"]: item["aggregation"] for item in body["indicators"]}
    # Crops have different natural yield scales: never averaged across crops.
    assert policy["yield"] == "crop_required"
    assert policy["production"] == "crop_required"
    assert policy["postharvest_loss"] == "crop_required"
    # Shares of farmers are a valid unweighted mean.
    assert policy["improved_seed"] == "mean"
    assert policy["irrigation_farmers"] == "mean"
    assert policy["postharvest_infrastructure"] == "specialized"


def test_each_indicator_carries_its_own_source(client):
    """Indicator-specific provenance: irrigation must not cite the crop table."""
    body = client.get("/api/v1/mobile/indicators").json()
    by_id = {item["id"]: item for item in body["indicators"]}
    assert by_id["yield"]["source_id"] == "NISR_SAS_2025B_DISTRICT_CROP"
    assert by_id["irrigation_farmers"]["source_id"] == "NISR_SAS_2025B_DISTRICT_FACTORS"
    assert by_id["erosion_severe"]["source_id"] == "NISR_SAS_2025B_EROSION"
    assert by_id["postharvest_loss"]["source_id"] == "NISR_SAS_2025B_POSTHARVEST_USE"
    assert by_id["cold_chain_program"]["source_id"] == "MINAGRI_ACES_COLDCHAIN_2026"
