"""Period-awareness of the district map metric service.

A map is read as "the pattern for the selected period", so the metric service
must answer each published period from the canonical ``crop_productivity``
panel. It previously read the joined 2025 Season B training table for every
period, which meant choosing 2026 Season B on the Maps page silently displayed
2025 numbers.

These tests pin the three rules that replaced that behaviour:

* the published periods are answered from the canonical panel, with the panel's
  own source ids, and the values genuinely change with the period;
* single-release layers (input adoption, irrigation, erosion) are never reused
  for another period - they return an empty layer plus the latest release;
* where a single-release input is deliberately combined with a selected period
  (the priority score's readiness/cost proxies) the mixture is reported through
  ``reference_period`` rather than hidden.
"""

from __future__ import annotations

import pytest

PANEL_METRICS = ["gap", "priority"]
SINGLE_RELEASE_METRICS = ["input_adoption", "irrigation", "erosion"]


def _require_data(client) -> None:
    """Skip when the processed tables have not been built in this environment."""
    resp = client.get("/api/v1/maps/district-metrics", params={"metric": "gap"})
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("districts"):
        pytest.skip("period panel not built; run `make data`")


def _metrics(client, metric: str, period_code: str, crop: str | None = None) -> dict:
    params: dict[str, str] = {"metric": metric, "period_code": period_code}
    if crop:
        params["crop"] = crop
    res = client.get("/api/v1/maps/district-metrics", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def _values(body: dict) -> dict[str, float | None]:
    return {row["district"]: row["value"] for row in body["districts"]}


def _top_districts(client, period_code: str, limit: int = 5) -> list[str]:
    body = _metrics(client, "priority", period_code)
    ranked = sorted(
        (row for row in body["districts"] if row["value"] is not None),
        key=lambda row: -row["value"],
    )
    return [row["district"] for row in ranked[:limit]]


# --- the published periods come from the canonical panel ---------------------


def test_gap_values_change_with_the_period(client):
    """The same metric must not report identical numbers for two seasons."""
    _require_data(client)
    first = _values(_metrics(client, "gap", "2025B"))
    second = _values(_metrics(client, "gap", "2026B"))
    assert set(first) == set(second)
    comparable = [
        district
        for district in first
        if first[district] is not None and second[district] is not None
    ]
    assert comparable, "both periods should carry comparable district gaps"
    assert any(abs(first[d] - second[d]) > 1e-6 for d in comparable)


def test_yield_values_change_with_the_period(client):
    _require_data(client)
    first = _values(_metrics(client, "yield", "2025B", crop="Maize"))
    second = _values(_metrics(client, "yield", "2026B", crop="Maize"))
    assert len(first) == len(second) == 30
    assert any(first[d] != second[d] for d in first if first[d] and second[d])


@pytest.mark.parametrize("period_code", ["2024A", "2024C", "2026B"])
def test_canonical_period_is_reported_with_the_panel_source(client, period_code):
    _require_data(client)
    body = _metrics(client, "gap", period_code)
    assert body["period_code"] == period_code
    assert body["provenance"]["source_period"] == period_code
    assert body["provenance"]["source_id"].startswith("NISR_SAS_")
    assert body["message"] is None
    # Every district row names the period it describes, for the tooltip.
    for row in body["districts"]:
        assert row["details"]["period_code"] == period_code


def test_season_c_release_tabulating_fewer_crops_is_still_answered(client):
    """Season C periods exist with a narrower crop list; the map must not fall back."""
    _require_data(client)
    body = _metrics(client, "gap", "2026B")
    season_c = _metrics(client, "gap", "2024C")
    assert len(season_c["districts"]) == len(body["districts"]) == 30
    assert season_c["period_code"] == "2024C"


def test_priority_ranking_moves_with_the_period(client):
    _require_data(client)
    assert _top_districts(client, "2025B") != _top_districts(client, "2026B")


# --- single-release layers are never reused ---------------------------------


@pytest.mark.parametrize("metric", SINGLE_RELEASE_METRICS)
def test_single_release_layer_is_not_reused_for_another_period(client, metric):
    _require_data(client)
    body = _metrics(client, metric, "2026B")
    assert body["districts"] == []
    assert body["available_period"] == "2025B"
    assert "2026 Season B" in body["message"]
    assert "2025 Season B" in body["message"]


@pytest.mark.parametrize("metric", SINGLE_RELEASE_METRICS)
def test_single_release_layer_still_renders_for_its_own_release(client, metric):
    _require_data(client)
    body = _metrics(client, metric, "2025B")
    assert len(body["districts"]) == 30
    assert all(row["value"] is not None for row in body["districts"])
    assert body["provenance"]["source_id"].startswith("NISR_SAS_2025B_")
    assert body["provenance"]["source_id"] != "NISR_SAS_2025B_DISTRICT_CROP"


def test_irrigation_layer_cites_the_irrigation_source_not_the_crop_table(client):
    _require_data(client)
    body = _metrics(client, "irrigation", "2025B")
    assert body["provenance"]["source_id"] == "NISR_SAS_2025B_IRRIGATION_WATER"


# --- a component the period cannot measure is excluded, never blended --------


def test_priority_excludes_components_the_period_cannot_measure(client):
    """Outside 2025B the map must not score a 2025B survey inside a 2026B value."""
    _require_data(client)
    body = _metrics(client, "priority", "2026B")
    assert len(body["districts"]) == 30
    # No blend: the score is made of the selected period's own observations.
    assert body["reference_period"] is None
    assert body["provenance"]["reference_period"] is None
    assert "NISR_SAS_2025B_DISTRICT_FACTORS" not in body["provenance"]["source_id"]
    # The excluded components are named, and so is the release that measures them.
    assert set(body["components_unavailable"]) == {"readiness", "cost_constraint"}
    assert body["available_period"] == "2025B"
    statuses = {entry["component"]: entry["status"] for entry in body["component_availability"]}
    assert statuses["gap_index"] == "measured"
    assert statuses["vulnerability"] == "proxy"
    assert statuses["affected_scale"] == "proxy"
    assert statuses["readiness"] == "unavailable"
    assert statuses["cost_constraint"] == "unavailable"
    joined = " ".join(body["provenance"]["limitations"])
    assert "readiness" in joined and "cost_constraint" in joined
    assert "redistributed" in joined


def test_priority_scores_its_own_release_with_every_component(client):
    _require_data(client)
    native = _metrics(client, "priority", "2025B")
    assert native["reference_period"] is None
    assert native["components_unavailable"] == []
    statuses = {entry["component"]: entry["status"] for entry in native["component_availability"]}
    assert statuses["readiness"] == "measured"
    assert statuses["cost_constraint"] == "measured"
    assert all(
        entry["source_period"] == "2025B"
        for entry in native["component_availability"]
        if entry["component"] in ("readiness", "cost_constraint")
    )


# --- no cross-crop yield may leak through the detail fields -----------------


@pytest.mark.parametrize("period_code", ["2025B", "2024A", "2026B"])
def test_gap_tooltip_never_exposes_a_cross_crop_yield(client, period_code):
    _require_data(client)
    body = _metrics(client, "gap", period_code)
    assert body["districts"]
    for row in body["districts"]:
        assert row["details"]["yield_kg_ha"] is None
        assert row["details"]["benchmark_yield_kg_ha"] is None
        assert row["details"]["gap_index"] is not None


def test_yield_layer_still_requires_a_crop_for_every_period(client):
    _require_data(client)
    for period_code in ["2025B", "2026B"]:
        body = _metrics(client, "yield", period_code)
        assert body["districts"] == []
        assert body["requires_crop"] is True
        assert "crop" in body["message"].lower()


# --- defaults are unchanged -------------------------------------------------


def test_unset_period_names_the_release_each_layer_actually_reads(client):
    """With no release selected, every layer still reports one it can be trusted to.

    It used to read the joined 2025 Season B table for everything, so a page
    showing a 2026 Season B snapshot drew a 2025 Season B map beside it. Now a
    period-aware layer reads the latest published district release and says so,
    and a single-release layer reads the release that carries it and says so.
    Neither is left to "whichever table is the default".
    """
    _require_data(client)

    # Period-aware layers follow the published axis, not a legacy default.
    for metric in PANEL_METRICS:
        body = client.get("/api/v1/maps/district-metrics", params={"metric": metric}).json()
        assert len(body["districts"]) == 30, metric
        assert body["period_code"] == "2026B", metric
        assert body["provenance"]["source_period"] == "2026B", metric
        assert all(d["value"] is not None for d in body["districts"]), metric

    # Single-release layers are served from their own release, with real values,
    # and name it - rather than rendering thirty empty districts under 2026B.
    for metric in SINGLE_RELEASE_METRICS:
        body = client.get("/api/v1/maps/district-metrics", params={"metric": metric}).json()
        assert len(body["districts"]) == 30, metric
        assert body["period_code"] == "2025B", metric
        assert body["available_period"] == "2025B", metric
        assert all(d["value"] is not None for d in body["districts"]), metric


def test_unpublished_period_is_rejected_not_answered(client):
    _require_data(client)
    res = client.get(
        "/api/v1/maps/district-metrics", params={"metric": "gap", "period_code": "2026C"}
    )
    assert res.status_code == 422
    assert "2026C" in res.json()["detail"]
