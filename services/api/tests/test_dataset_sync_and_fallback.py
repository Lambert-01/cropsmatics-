"""Canonical out-of-sync handling and the removed 2025B productivity fallback.

Two regressions are pinned here, both database-free:

* A reachable database that serves a *different* dataset than the processed build
  must raise a structured ``DATASET_OUT_OF_SYNC`` (503) rather than answer a
  successful read with stale figures.
* An explicit request for a published period the serving dataset does not carry
  must never be answered from the 2025 Season B training table; it returns a
  structured "unavailable" result with no manufactured zeros.

The version comparison is pure, so it is exercised with ``monkeypatch`` rather
than a database. The real thing is covered by ``test_canonical_integration.py``.
"""

from __future__ import annotations

import json

import pandas as pd
import pytest

from app.repositories import dataset_repository as repo


@pytest.fixture
def sync_state(monkeypatch):
    """Force the reported canonical sync state for one test."""

    def _apply(state: dict):
        monkeypatch.setattr(repo, "canonical_sync_state", lambda: state)

    return _apply


def test_out_of_sync_repo_read_raises_the_structured_error(sync_state):
    sync_state(
        {
            "expected_version": "0.2.0-aaa",
            "loaded_version": "0.2.0-bbb",
            "in_sync": False,
            "expected_periods": ["2022A", "2022B"],
            "loaded_periods": ["2024A"],
            "reason": "canonical_dataset_out_of_sync",
        }
    )
    from app.core.config import get_settings

    # The suite pins CANONICAL_DATA_MODE unset (preferred); required is the mode
    # whose contract this is.
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("CANONICAL_DATA_MODE", "required")
        get_settings.cache_clear()
        try:
            with pytest.raises(repo.DatasetOutOfSync) as excinfo:
                repo.crop_productivity()
        finally:
            get_settings.cache_clear()

    assert excinfo.value.code == "DATASET_OUT_OF_SYNC"
    assert excinfo.value.expected_version == "0.2.0-aaa"
    assert excinfo.value.loaded_version == "0.2.0-bbb"
    assert excinfo.value.expected_periods == ["2022A", "2022B"]
    assert excinfo.value.loaded_periods == ["2024A"]
    assert excinfo.value.retryable is True


def test_out_of_sync_endpoint_returns_the_structured_503(client, sync_state, monkeypatch):
    from app.core.config import get_settings

    sync_state(
        {
            "expected_version": "0.2.0-aaa",
            "loaded_version": "0.2.0-bbb",
            "in_sync": False,
            "expected_periods": ["2022A"],
            "loaded_periods": ["2024A"],
            "reason": "canonical_dataset_out_of_sync",
        }
    )
    monkeypatch.setenv("CANONICAL_DATA_MODE", "required")
    get_settings.cache_clear()
    try:
        resp = client.get("/api/v1/productivity")
    finally:
        get_settings.cache_clear()

    assert resp.status_code == 503
    body = resp.json()
    assert body["code"] == "DATASET_OUT_OF_SYNC"
    assert body["expected_version"] == "0.2.0-aaa"
    assert body["loaded_version"] == "0.2.0-bbb"
    assert body["expected_periods"] == ["2022A"]
    assert body["loaded_periods"] == ["2024A"]
    assert body["retryable"] is True
    # No paths or credentials leak through the contract.
    raw = json.dumps(body)
    assert "/Users" not in raw
    assert "postgresql" not in raw


def test_explicit_period_never_falls_back_to_the_training_table(monkeypatch):
    """A 2022A request must not read the 2025 Season B table."""
    from app.schemas.filters import AnalyticsFilters
    from app.services import analytics_service

    # A serving panel that only carries 2025 Season B (the stale-production case).
    stale = pd.DataFrame(
        {
            "period_code": ["2025B", "2025B"],
            "geography_level": ["DISTRICT", "DISTRICT"],
            "district": ["Bugesera", "Huye"],
            "district_code": ["RW-EA-BUG", "RW-SO-HUY"],
            "crop_code": ["CROP-MAI", "CROP-MAI"],
            "canonical_crop_name": ["Maize", "Maize"],
            "yield_kg_ha": [1000.0, 1200.0],
            "source_id": ["NISR_SAS_2025B", "NISR_SAS_2025B"],
        }
    )
    monkeypatch.setattr(repo, "crop_productivity", lambda: stale)
    # Guarantee 2022A is treated as a canonical-panel period (not legacy 2025B).
    monkeypatch.setattr(analytics_service, "legacy_periods", lambda: {"2025B"})

    f = AnalyticsFilters(period_code="2022A", crop="Maize")
    with pytest.raises(repo.PeriodNotServable):
        analytics_service.productivity_frame(f)


def test_unavailable_period_returns_no_false_zero_kpis(monkeypatch):
    from app.schemas.filters import AnalyticsFilters
    from app.services import analytics_service

    def _raise(_f):
        raise repo.PeriodNotServable(
            "2022A",
            expected_periods=["2022A", "2022B"],
            message="2022A is not served by this deployment",
        )

    monkeypatch.setattr(analytics_service, "productivity_frame", _raise)
    result = analytics_service.productivity(AnalyticsFilters(period_code="2022A"))

    assert result["available"] is False
    # No KPI at all: a "0 districts" / "0 crops" card would read as a measured
    # zero when nothing was served.
    assert result["kpis"] == []
    assert result["primary_kpis"] == []
    assert result["rows"] == []
    assert result["availability"]["reason"] == "period_not_servable"
    assert result["unavailable_reason"]


def test_period_catalogue_exposes_published_and_servable(client):
    body = client.get("/api/v1/meta/periods").json()
    # Every published period stays visible, whether or not it is servable.
    assert body["count"] >= 14
    codes = {entry["period_code"] for entry in body["periods"]}
    assert {"2022A", "2022B", "2022C", "2023A", "2023B", "2023C"} <= codes
    for entry in body["periods"]:
        assert entry["published"] is True
        assert isinstance(entry["servable"], bool)
        assert "canonical_n_rows" in entry
        assert entry["availability_status"] in {"servable", "coverage_only", "not_servable"}
        assert entry["availability_message"]
    # In this (file/preferred) deployment every published period is served.
    assert body["servable_count"] == body["count"]


def test_all_published_periods_are_servable_and_district_complete(client):
    """The processed panel carries every published period with 30 districts."""
    body = client.get("/api/v1/meta/periods").json()
    by_code = {entry["period_code"]: entry for entry in body["periods"]}
    for code in ("2022A", "2022B", "2023A", "2023B", "2024A", "2026B"):
        entry = by_code[code]
        assert entry["servable"] is True, code
        assert entry["canonical_n_districts"] == 30, code
        assert entry["canonical_n_rows"] > 0, code
