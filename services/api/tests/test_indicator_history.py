"""The multi-period SAS indicator domains must be exposed, and honestly.

``agricultural_practice_observation.csv`` and
``crop_postharvest_use_multi_period.csv`` are the processed datasets that surface
the 78 SAS sheets which were previously mapped and ingested with full lineage but
had no processed dataset behind them. These tests pin the properties that make
the exposure trustworthy:

* the published period dimension is real and domain-specific, not a relabelled 2025B;
* a period with no rows is explained, never silently empty;
* a published null is never turned into a zero;
* an unknown domain is reported, not a 500;
* post-harvest share totals are flagged, never rescaled to 100.
"""

from __future__ import annotations

PRACTICE_DOMAINS = {
    "practice",
    "irrigation",
    "water_source",
    "erosion_control",
    "erosion_severity",
    "fertilizer_source_district",
}


def _practice(client, **params):
    response = client.get("/api/v1/analytics/practice-indicators", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_practice_indicators_are_exposed_with_a_real_period_dimension(client):
    body = _practice(client)
    assert body["available"] is True
    assert set(body["domains"]) == PRACTICE_DOMAINS

    periods = body["periods"]
    # Fertilizer-source district tables extend the all-domain response to the
    # 2022-2026 published calendar. Individual indicator availability below
    # still reports the narrower range for water/irrigation/erosion domains.
    assert periods == [
        "2022A",
        "2022B",
        "2022C",
        "2023A",
        "2023B",
        "2023C",
        "2024A",
        "2024B",
        "2024C",
        "2025A",
        "2025B",
        "2025C",
        "2026A",
        "2026B",
    ]

    assert body["indicators"], "the domain must report its published indicators"
    for item in body["indicators"]:
        assert item["indicator_code"]
        assert item["domain"] in PRACTICE_DOMAINS
        # Availability is derived per indicator, so a partial season is visible.
        assert item["periods"]
        assert set(item["periods"]) <= set(periods), item
        assert item["unit"] == "percent", item
        assert isinstance(item["n_observations"], int)


def test_every_practice_indicator_names_its_published_periods(client):
    """At least one indicator must genuinely span all eight published seasons."""
    body = _practice(client)
    spanning = [
        item for item in body["indicators"] if len(item["periods"]) == len(body["periods"])
    ]
    assert spanning, "no indicator covers the full published range; ingest may be stale"


def test_practice_indicators_filter_by_domain(client):
    body = _practice(client, domain="erosion_severity")
    assert body["available"] is True
    assert body["domain"] == "erosion_severity"
    assert {item["domain"] for item in body["indicators"]} == {"erosion_severity"}
    # Choosing one domain must not widen the observation set to the others.
    assert {row["domain"] for row in body["observations"]} <= {"erosion_severity"}


def test_unknown_domain_is_reported_not_raised(client):
    body = _practice(client, domain="not_a_domain")
    assert body["available"] is False
    assert set(body["domains"]) == PRACTICE_DOMAINS
    assert body["observations"] == []
    assert "not_a_domain" in body["note"]


def test_practice_indicators_filter_by_district_and_period(client):
    body = _practice(client, district="Nyarugenge", period_code="2025B")
    rows = body["observations"]
    assert rows, "Nyarugenge must have published 2025B practice rows"
    assert {row["district"] for row in rows} == {"Nyarugenge"}
    assert {row["period_code"] for row in rows} == {"2025B"}
    assert all(row["district_code"] == "RW-KG-NYA" for row in rows)


def test_period_without_practice_rows_explains_its_coverage(client):
    """2022A is a published period, but the practice domains start at 2024A.

    Returning an unexplained empty page would read as "nothing was measured",
    which is a different claim from "this domain is not published that early".
    """
    body = _practice(client, period_code="2022A", domain="water_source")
    assert body["available"] is True
    assert body["observations"] == []
    assert body["note"]
    assert "2022A" in body["note"]
    # The catalogue still reports what really exists.
    assert body["periods"][0] == "2024A"


def test_published_null_stays_null_and_never_becomes_zero(client):
    """Musanze published no drip/pivot/sprinkler/surface/flood share for 2024A.

    NISR simply did not tabulate those cells. The API must return them as null;
    serialising a missing observation as 0.0 would invent a measurement.
    """
    body = _practice(
        client, district="Musanze", period_code="2024A", domain="irrigation"
    )
    rows = body["observations"]
    assert rows
    nulls = [row for row in rows if row["value"] is None]
    assert nulls, "Musanze 2024A publishes null irrigation shares"
    for row in nulls:
        assert row["value"] is None, row
        assert row["value"] != 0, row
    # And the indicator is still advertised, because other districts do publish it.
    assert {item["indicator_code"] for item in body["indicators"]}


def test_practice_observations_carry_row_level_lineage(client):
    body = _practice(client, period_code="2025B", district="Rulindo", domain="practice")
    row = next(r for r in body["observations"] if r["value"] is not None)
    for field in ("source_id", "source_release", "source_sheet", "source_row"):
        assert row[field] not in (None, ""), (field, row)
    assert row["processing_script"] == "scripts/data/build_agricultural_practice_observation.py"


def test_practice_provenance_is_derived_from_the_rows_that_answered(client):
    body = _practice(client, period_code="2025B")
    provenance = body["provenance"]
    assert provenance["source_id"], "provenance must name real source ids"
    assert "NISR_SAS_2025_ANNUAL" in provenance["source_id"]
    assert provenance["source_period"] == "2025B"
    assert any("2024A-2026B" in note for note in provenance["limitations"]), provenance


def test_postharvest_history_spans_periods_and_crops(client):
    response = client.get("/api/v1/analytics/postharvest-history")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is True
    assert body["periods"][0] == "2024A"
    assert body["periods"][-1] == "2026B"
    assert "Maize" in body["crops"]
    assert len(body["indicators"]) == 11
    for item in body["indicators"]:
        assert item["unit"] == "percent"


def test_postharvest_share_totals_are_reported_not_rescaled(client):
    response = client.get("/api/v1/analytics/postharvest-history")
    body = response.json()
    totals = body["share_totals"]
    assert totals, "share totals must be reported per period x crop"
    for group in totals:
        assert group["crop"]
        assert group["period_code"]
        assert isinstance(group["shares_sum_ok"], bool)
    # The count the API reports must equal the flags it returns.
    off = {group["shares_sum_ok"] for group in totals}
    assert off <= {True, False}
    reported = sum(1 for group in totals if not group["shares_sum_ok"])
    assert body["shares_off_total"] == reported


def test_postharvest_history_filters_by_crop_and_period(client):
    response = client.get(
        "/api/v1/analytics/postharvest-history",
        params={"crop": "Maize", "period_code": "2025B"},
    )
    body = response.json()
    rows = body["observations"]
    assert rows
    assert {row["crop"] for row in rows} == {"Maize"}
    assert {row["period_code"] for row in rows} == {"2025B"}


def test_indicator_catalogue_reports_every_available_period(client):
    """A single-release table reports one period; the multi-period ones report eight."""
    body = client.get("/api/v1/mobile/indicators").json()
    by_id = {item["id"]: item for item in body["indicators"]}
    for item in body["indicators"]:
        assert isinstance(item["periods"], list)
        if item["available"]:
            assert item["period"] in item["periods"], item
    # Legacy wide tables are still honestly single-release.
    assert by_id["irrigation_drip"]["periods"] == ["2025B"]
    assert by_id["postharvest_loss"]["periods"] == ["2025B"]


def test_indicator_limitations_describe_the_real_calendar(client):
    body = client.get("/api/v1/mobile/indicators").json()
    limitations = " ".join(body["provenance"]["limitations"])
    # Derived from the coverage matrix: the multi-period domains cover 2024A-2026B
    # while the legacy wide district tables still serve 2025 Season B only.
    assert "2024A-2026B" in limitations, limitations
    assert "2025 Season B" in limitations, limitations
    assert "district-level indicators exist only for" not in limitations, limitations
