"""CANONICAL_DATA_MODE policy and canonical readiness.

These tests are deliberately database-free: they pin the *policy* (which layer is
allowed to answer, and what readiness must say) using the suite's unreachable
``DATABASE_URL``. The behaviour that genuinely needs PostgreSQL lives in
``test_canonical_integration.py``.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError


@pytest.fixture
def mode(monkeypatch):
    """Set CANONICAL_DATA_MODE / ENVIRONMENT and reset the settings cache."""
    from app.core.config import get_settings
    from app.repositories import dataset_repository
    from app.services import period_service

    def _reset() -> None:
        get_settings.cache_clear()
        dataset_repository.clear_cache()
        # The period catalogue is derived from the panel, so it must be rebuilt
        # after the mode changes rather than serving a stale cached catalogue.
        period_service.catalog.cache_clear()

    def _apply(**env: str | None):
        for key, value in env.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)
        _reset()
        return get_settings()

    yield _apply
    _reset()


def test_development_defaults_to_preferred(mode):
    settings = mode(CANONICAL_DATA_MODE=None, ENVIRONMENT="development")
    assert settings.canonical_mode == "preferred"


def test_production_defaults_to_required(mode):
    settings = mode(CANONICAL_DATA_MODE=None, ENVIRONMENT="production")
    assert settings.canonical_mode == "required"


def test_explicit_mode_overrides_the_environment(mode):
    assert mode(CANONICAL_DATA_MODE="file", ENVIRONMENT="production").canonical_mode == "file"
    assert mode(CANONICAL_DATA_MODE="preferred", ENVIRONMENT="production").canonical_mode == "preferred"


def test_unknown_mode_is_rejected(mode):
    with pytest.raises(ValidationError):
        mode(CANONICAL_DATA_MODE="yolo")


def test_a_dashboard_pasted_postgresql_url_is_coerced_to_psycopg3(mode):
    """Neon/Render copy `postgresql://...`; SQLAlchemy would demand psycopg2.

    The service ships psycopg 3 only, so an unnormalised dashboard URL crashed
    the API at import with ModuleNotFoundError. The scheme must be rewritten.
    """
    pasted = "postgresql://user:pass@ep-example.aws.neon.tech/neondb?sslmode=require"
    settings = mode(DATABASE_URL=pasted, ENVIRONMENT="PRODUCTION")
    assert settings.database_url.startswith("postgresql+psycopg://")
    assert "ep-example.aws.neon.tech/neondb" in settings.database_url
    # An already-qualified URL passes through unchanged.
    qualified = "postgresql+psycopg://user:pass@ep-example.aws.neon.tech/neondb"
    assert mode(DATABASE_URL=qualified).database_url == qualified


def test_file_mode_serves_the_processed_panel(mode):
    from app.repositories import dataset_repository as repo

    mode(CANONICAL_DATA_MODE="file")
    frame = repo.crop_productivity()
    assert not frame.empty
    assert repo.canonical_source_status()["mode"] == "file"
    assert repo.canonical_source_status()["served_from"]["crop_productivity"] == "processed_csv"


def test_preferred_mode_falls_back_when_the_database_is_unreachable(mode):
    from app.repositories import dataset_repository as repo

    mode(CANONICAL_DATA_MODE="preferred")
    frame = repo.crop_productivity()
    assert not frame.empty, "the processed fallback must keep analytics working"
    assert repo.canonical_source_status()["served_from"]["crop_productivity"] == "processed_csv"


def test_required_mode_refuses_to_answer_from_files(mode):
    """A required-mode deploy must not silently serve a processed CSV."""
    from app.repositories import dataset_repository as repo

    mode(CANONICAL_DATA_MODE="required")
    with pytest.raises(repo.CanonicalDataUnavailable) as excinfo:
        repo.crop_productivity()
    assert excinfo.value.code == "DATABASE_UNAVAILABLE"


def test_required_mode_analytics_endpoint_reports_typed_error(mode, client):
    mode(CANONICAL_DATA_MODE="required")
    resp = client.get("/api/v1/productivity")
    assert resp.status_code == 503
    body = resp.json()
    assert body["code"] == "DATABASE_UNAVAILABLE"
    # No filesystem paths or credentials leak through the error contract.
    raw = json.dumps(body)
    assert "/Users" not in raw
    assert "postgresql" not in raw


def test_readiness_in_required_mode_is_not_ready_without_a_database(mode, client):
    mode(CANONICAL_DATA_MODE="required")
    resp = client.get("/api/v1/health/readiness")
    # not_ready must be a *failing* status code: a 200 body that merely says
    # not_ready is accepted as healthy by Render, which is how a stale canonical
    # database stayed in front of traffic.
    assert resp.status_code == 503
    body = resp.json()

    assert body["status"] == "not_ready"
    assert body["canonical_data_mode"] == "required"
    state = body["canonical_state"]
    assert state["dataset_loaded"] is False
    assert "canonical_not_ready" in state["blocking"]
    assert "DATABASE_URL" not in json.dumps(body)


def test_readiness_in_preferred_mode_still_reports_ready_on_files(mode, client):
    resp = client.get("/api/v1/health/readiness")
    # A degraded/ready preferred-mode deployment is still a 200: it can answer
    # from the processed files, so it must not be failed by a health check.
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] in {"ready", "degraded"}
    assert body["canonical_data_mode"] == "preferred"


def test_readiness_reports_migrations_state_without_leaking_paths(mode, client):
    body = client.get("/api/v1/health/readiness").json()
    state = body["canonical_state"]
    # With no database these are all honestly false, never optimistically true.
    assert state["database_configured"] is True  # the suite pins a URL
    assert state["migrations_applied"] is False
    assert state["dataset_loaded"] is False
    raw = json.dumps(body)
    assert "/" not in raw.replace("optional/unavailable", "")
    assert "secret" not in raw.lower()
