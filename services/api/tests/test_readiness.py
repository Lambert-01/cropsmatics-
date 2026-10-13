"""Data-readiness and data-version endpoint tests."""

from __future__ import annotations

import json

import pytest

# --- the production incident, reproduced without a database -----------------
#
# The deployed service was reachable, migrated and loaded - and still answered
# every canonical-backed read with `503 DATASET_OUT_OF_SYNC`, because the loaded
# dataset version did not match the dataset the image had been built from. The
# readiness contract for exactly that state is pinned here; the layer that
# detects it is `app/services/meta_service.py:canonical_readiness`.


class _StubResult:
    """Just enough of a CursorResult for the canonical status projections.

    The probes under test read a count (``scalar``) and a coverage/indicator
    projection (``all``/``mappings``); the values are irrelevant to the contract
    being asserted, which is about the *reported state*, not the rows.
    """

    def scalar(self) -> int:
        return 1

    def all(self) -> list:
        return []

    def mappings(self) -> _StubResult:
        return self

    def one_or_none(self):
        return None


class _StubConnection:
    def execute(self, *_args, **_kwargs) -> _StubResult:
        return _StubResult()


class _StubContext:
    def __init__(self, connection: _StubConnection) -> None:
        self._connection = connection

    def __enter__(self) -> _StubConnection:
        return self._connection

    def __exit__(self, *_exc) -> bool:
        return False


class _StubEngine:
    def connect(self) -> _StubContext:
        return _StubContext(_StubConnection())


class _StubInspector:
    def get_table_names(self) -> list[str]:
        # A migrated database: the canonical tables exist. That is what made the
        # stale production database look healthy to every probe except the
        # version comparison.
        return ["crop_productivity", "agricultural_observation", "period", "dataset_version", "alembic_version"]


@pytest.fixture
def reachable_canonical(monkeypatch):
    """A reachable, migrated, loaded canonical database, in production mode.

    Production resolves `CANONICAL_DATA_MODE=required`; the suite's default is
    `preferred`, where a file-backed fallback legitimately keeps readiness at
    200. The policy under test here is the required-mode one, so the mode is set
    explicitly (and the settings cache cleared, as the rest of the suite does).
    """
    from app.core.config import get_settings
    from app.repositories import canonical_repository, dataset_repository

    loaded = {
        "version": "0.2.0-loaded00000000",
        "row_counts": {"crop_productivity": 3738, "period": 8},
    }
    probe = {
        "availability": "ready",
        "reason": None,
        "row_counts": {"crop_productivity": 3738, "period": 8},
    }

    def _reset() -> None:
        get_settings.cache_clear()
        dataset_repository.clear_cache()

    monkeypatch.setenv("CANONICAL_DATA_MODE", "required")
    _reset()
    monkeypatch.setattr(canonical_repository, "probe", lambda: dict(probe))
    monkeypatch.setattr(canonical_repository, "current_version", lambda: dict(loaded))
    monkeypatch.setattr("sqlalchemy.inspect", lambda _connection: _StubInspector())
    monkeypatch.setattr("app.db.session.engine", _StubEngine())
    yield loaded
    _reset()


def test_readiness_is_503_when_the_loaded_dataset_differs_from_the_build(
    client, reachable_canonical
):
    """The incident state: reachable and loaded, but a different dataset."""
    resp = client.get("/api/v1/health/readiness")

    # A deployment in this state must fail its health check. A 200 body saying
    # `not_ready` was accepted as healthy by Render, which is how a stale
    # canonical database stayed in front of traffic.
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"

    state = body["canonical_state"]
    assert state["dataset_loaded"] is True
    assert state["tables_present"] is True
    assert state["migrations_applied"] is True
    assert state["version_matches_manifest"] is False
    assert state["dataset_version"] == "0.2.0-loaded00000000"
    assert state["expected_version"] != state["dataset_version"]
    assert "canonical_dataset_out_of_sync" in state["blocking"]
    assert "dataset_version_mismatch" in state["blocking"]
    # The mismatch is named with both sides, so a deploy can be diagnosed
    # without reading application code.
    check = next(c for c in body["checks"] if c["check"] == "canonical_dataset_version")
    assert check["status"] == "mismatch"
    assert check["expected_version"] == state["expected_version"]
    assert check["loaded_version"] == "0.2.0-loaded00000000"
    assert check["loaded_productivity_rows"] == 3738
    assert check["expected_productivity_rows"] == state["expected_row_counts"]["crop_productivity"]

    # No credentials, no connection string, no filesystem path.
    raw = json.dumps(body)
    assert "postgresql" not in raw
    assert "password" not in raw.lower()
    assert "/Users" not in raw


def test_data_envelopes_report_the_mismatch_too(client, reachable_canonical, monkeypatch):
    """`/data/*` must not present a stale loaded dataset as the current one.

    The incident gap: `/data/version` reported the *loaded* version and looked
    healthy while the release expected a different one. Both facts now travel
    together, with a plain-language limitation, so a client cannot read a stale
    coverage table as if it described this build.
    """
    from app.repositories import dataset_repository

    monkeypatch.setattr(
        dataset_repository,
        "canonical_sync_state",
        lambda: {
            "in_sync": False,
            "expected_version": "0.2.0-expected0000",
            "loaded_version": "0.2.0-loaded00000000",
            "reason": "canonical_dataset_out_of_sync",
            "expected_periods": ["2022A"],
            "loaded_periods": ["2024A"],
        },
    )

    for path in ("/api/v1/data/version", "/api/v1/data/coverage"):
        body = client.get(path).json()
        sync = body["canonical_sync"]
        assert sync["in_sync"] is False
        assert sync["expected_version"] == "0.2.0-expected0000"
        assert sync["loaded_version"] == "0.2.0-loaded00000000"
        assert any("different dataset than this build" in note for note in body["limitations"])
        # Still no credential or filesystem path anywhere in the envelope.
        assert "postgresql://" not in json.dumps(body)
        assert "/Users" not in json.dumps(body)


def test_liveness_stays_up_while_readiness_fails(client, reachable_canonical):
    """A data problem must not look like a dead process.

    Render (and any supervisor) distinguishes a container that is running from a
    service that is ready to take traffic: liveness has to keep answering 200, or
    an out-of-sync database turns into a restart loop that fixes nothing.
    """
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/health/readiness").status_code == 503


class _StubInspectorWithoutAlembic:
    """Canonical tables present, but no migration bookkeeping.

    A schema created out of band, or a migration chain that never ran against
    this database, looks like this - and it must be named rather than lumped in
    with "the database is unavailable".
    """

    def get_table_names(self) -> list[str]:
        return ["crop_productivity", "agricultural_observation", "period", "dataset_version"]


def test_readiness_names_pending_migrations(client, reachable_canonical, monkeypatch):
    monkeypatch.setattr("sqlalchemy.inspect", lambda _connection: _StubInspectorWithoutAlembic())

    resp = client.get("/api/v1/health/readiness")

    assert resp.status_code == 503
    state = resp.json()["canonical_state"]
    assert state["migrations_applied"] is False
    assert state["tables_present"] is True
    assert "migrations_not_applied" in state["blocking"]


def test_readiness_recovers_when_the_loaded_version_matches(client, reachable_canonical, monkeypatch):
    """The same probe must report ready once the database is synchronised.

    This is the acceptance condition for the production sync: the loaded version
    has to equal the version the *processed build* implies, which is why the
    expectation is read from the built artefact rather than echoed from the
    database.
    """
    from pathlib import Path

    from app.data.versioning import content_version
    from app.repositories import canonical_repository

    manifest = json.loads(
        (Path(__file__).resolve().parents[3] / "data" / "processed" / "manifest.json").read_text()
    )
    rows = manifest["row_counts"]["crop_productivity"]

    monkeypatch.setattr(
        canonical_repository,
        "probe",
        lambda: {"availability": "ready", "reason": None, "row_counts": {"crop_productivity": rows}},
    )
    monkeypatch.setattr(
        canonical_repository,
        "current_version",
        lambda: {"version": content_version(manifest), "row_counts": {"crop_productivity": rows}},
    )

    resp = client.get("/api/v1/health/readiness")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    state = body["canonical_state"]
    assert state["version_matches_manifest"] is True
    assert state["row_counts_match_manifest"] is True
    assert state["blocking"] == []
    assert state["expected_version"] == state["dataset_version"]



def test_readiness_reports_required_datasets(client):
    res = client.get("/api/v1/health/readiness")
    assert res.status_code == 200
    body = res.json()

    assert body["status"] in {"ready", "degraded"}
    assert body["datasets"], "expected the required dataset list"
    # The two MINAGRI add-on tables are part of the public surface now.
    assert "postharvest_infrastructure" in body["datasets"]
    assert "cold_chain_network_summary" in body["datasets"]
    # Keys match the data manifest so the two can be compared directly.
    assert body["row_counts"]["training"] == 510
    assert body["row_counts"]["national_crop_trends"] == 108
    assert body["dictionaries"] is True


def test_readiness_never_leaks_secrets_or_paths(client):
    raw = json.dumps(client.get("/api/v1/health/readiness").json())

    assert "jwt" not in raw.lower()
    assert "secret" not in raw.lower()
    assert "change-me" not in raw.lower()
    # No filesystem paths: the probe must not help map the server's disk.
    assert "/" not in raw.replace("optional/unavailable", "")
    assert "\\" not in raw


def test_database_is_optional_not_fatal(client):
    body = client.get("/api/v1/health/readiness").json()
    # The analytical endpoints read processed CSVs, so a missing database must
    # degrade gracefully rather than fail readiness.
    assert body["database"] in {"connected", "optional/unavailable"}


def test_data_version_is_safe_projection(client):
    res = client.get("/api/v1/meta/data-version")
    assert res.status_code == 200
    body = res.json()

    assert body["available"] is True
    assert body["pipeline_version"]
    assert body["row_counts"]["training"] == 510
    assert body["validation"]["status"] in {"passed", "failed"}
    assert body["dataset_count"] >= 14

    # Hashes and absolute filesystem paths are deliberately not exposed. The
    # validation messages may reference a relative report name, which is a
    # deliberate pointer for a reviewer rather than a disclosure of the disk layout.
    raw = json.dumps(body)
    assert "sha256" not in raw
    assert "/Users" not in raw
    assert "data/processed" not in raw


def test_data_version_surfaces_the_documented_warnings(client):
    body = client.get("/api/v1/meta/data-version").json()
    issues = body["validation"]["issues"]
    messages = " ".join(i["message"] for i in issues)

    # Warnings are published rather than suppressed.
    assert "blank cultivated_area_ha" in messages
    assert "exceeds cultivated_area_ha" in messages
    assert body["validation"]["warnings"] >= 2
