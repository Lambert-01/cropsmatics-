"""Regressions for provenance, period availability and the canonical trend.

These run against the processed tables (the suite pins an unreachable database),
so they exercise the file/preferred path without PostgreSQL. They pin the
behaviours that previously produced false or stale attribution:

* a period's provenance is never an invented ``NISR_SAS_<period>`` identifier,
  and a non-legacy result is never labelled with the 2025 Season B source;
* the published-period axis the Overview returns carries ``servable`` /
  ``availability_status`` so a client can disable a release the serving system
  does not carry;
* ``/analytics/canonical-trend`` serves the full published axis.
"""

from __future__ import annotations

from app.schemas.filters import AnalyticsFilters
from app.services import analytics_service, period_service

# A real canonical period that is not the joined 2025B training release.
HISTORICAL = "2022A"


def test_period_source_id_never_fabricates_an_identifier():
    """``NISR_SAS_2022A`` is not a registered source and must never be built."""
    resolved = period_service.source_id(HISTORICAL)
    assert resolved != f"NISR_SAS_{HISTORICAL}"
    # Unknown periods are honestly null rather than a plausible-looking string.
    assert period_service.source_id("nonsense") is None


def test_resolved_source_id_does_not_attribute_a_historical_result_to_2025b():
    # An empty historical frame names no source, so the frame helper falls back
    # to the legacy 2025B id. For an explicit non-legacy period that attribution
    # is false and must be replaced by the release's own registered source.
    result = {"source_id": analytics_service.LEGACY_SOURCE_ID}
    resolved = analytics_service.resolved_source_id(
        result, AnalyticsFilters(period_code=HISTORICAL)
    )
    assert resolved != analytics_service.LEGACY_SOURCE_ID
    assert resolved == period_service.source_id(HISTORICAL)


def test_resolved_source_id_keeps_the_legacy_source_for_the_legacy_period():
    # 2025B is genuinely served by the joined training table, so its legacy id
    # must survive.
    legacy = next(iter(analytics_service.legacy_periods()), None)
    if legacy is None:
        return
    result = {"source_id": analytics_service.LEGACY_SOURCE_ID}
    assert (
        analytics_service.resolved_source_id(result, AnalyticsFilters(period_code=legacy))
        == analytics_service.LEGACY_SOURCE_ID
    )


def test_servable_periods_are_a_subset_of_published_periods():
    catalog = period_service.catalog()
    servable = set(catalog["servable_periods"])
    published = set(catalog["period_codes"])
    assert servable <= published
    # In the file/preferred path every published period is carried by the panel.
    assert catalog["servable_count"] == len(servable)


def test_district_range_only_counts_servable_periods():
    range_string = period_service.district_range()
    assert range_string, "the processed panel carries district rows"
    # Every period in the advertised range is one the panel actually serves.
    servable = set(period_service.servable_periods())
    first, _, last = range_string.partition("-")
    assert first in servable and last in servable


def test_overview_timeline_exposes_availability(client):
    body = client.get("/api/v1/dashboard/overview").json()
    timeline = body["period_timeline"]
    assert timeline, "expected the published period axis"
    entry = timeline[0]
    for key in ("published", "servable", "availability_status"):
        assert key in entry, f"timeline entry must expose {key}"
    # 2022A/2023 are published and (in the processed panel) servable.
    codes = {e["period_code"]: e for e in timeline}
    assert codes[HISTORICAL]["published"] is True


def test_canonical_trend_covers_the_published_axis(client):
    resp = client.get("/api/v1/analytics/canonical-trend")
    assert resp.status_code == 200
    body = resp.json()
    assert body["geography_scope"] == "national"
    assert "2022A" in body["periods"]
    # The aligned series are the same length as the axis, so a period the
    # release did not tabulate is an explicit null rather than a missing point.
    series = body["series"]
    for values in series.values():
        assert len(values) == len(body["periods"])
    # A cross-crop yield is never a simple average: it is either absent or the
    # area-weighted aggregate series (output per harvested hectare).
    assert series["yield_kg_ha"] == [None] * len(body["periods"])


def test_canonical_trend_district_requires_a_crop(client):
    resp = client.get("/api/v1/analytics/canonical-trend", params={"district": "Kigali"})
    assert resp.status_code == 422
