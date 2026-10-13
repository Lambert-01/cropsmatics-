"""The deploy bootstrap's load decision, tested without a database.

The version comparison is what stops a deploy from rebuilding every canonical
row on every release, so the decision itself is pinned here. The migration +
load + verify sequence is exercised for real in
``services/api/tests/test_canonical_integration.py``.
"""

from __future__ import annotations

from scripts.data.canonical_bootstrap import needs_load


def test_load_is_skipped_when_the_version_already_matches():
    assert needs_load("0.3.0-abc123", "0.3.0-abc123") is False


def test_load_runs_when_the_database_version_differs():
    assert needs_load("0.3.0-abc123", "0.4.0-def456") is True


def test_load_runs_against_an_empty_database():
    assert needs_load(None, "0.4.0-def456") is True


# --- verification expectations (no database) --------------------------------

def test_a_dry_run_writes_nothing_not_even_migrations(monkeypatch, processed_dir):
    """`--dry-run` is the production approval gate's plan step.

    It must not apply migrations: a schema change dressed as a plan is exactly
    the surprise the gate exists to prevent. The migration *state* is still
    reported, because a plan that hides a pending upgrade is not a plan.
    """
    from scripts.data import canonical_bootstrap, load_postgres

    calls: list[str] = []
    monkeypatch.setattr(canonical_bootstrap, "_alembic_upgrade", lambda url: calls.append("migrate"))
    monkeypatch.setattr(canonical_bootstrap, "_migration_state", lambda url: ("oldrev", "headrev"))
    monkeypatch.setattr(canonical_bootstrap, "_current_version", lambda url: "0.2.0-stale00000000")
    monkeypatch.setattr(canonical_bootstrap, "_verify", lambda url, expected: True)
    monkeypatch.setattr(load_postgres, "main", lambda argv: calls.append("load") or 0)

    code = canonical_bootstrap.main(
        ["--dry-run", "--url", "postgresql+psycopg://u:p@127.0.0.1:1/x"]
    )

    assert code == 0
    assert calls == [], f"a dry run wrote something: {calls}"


def test_a_real_run_migrates_before_it_loads(monkeypatch, processed_dir):
    """Without `--dry-run` the sequence is migrations -> compare -> load."""
    import json

    from app.data.versioning import content_version
    from scripts.data import canonical_bootstrap, load_postgres

    expected = content_version(json.loads((processed_dir / "manifest.json").read_text()))
    reads = {"count": 0}

    def fake_current(url: str) -> str:
        # Stale before the load, matching after it - the sequence the script
        # verifies around the write.
        reads["count"] += 1
        return expected if reads["count"] > 1 else "0.2.0-stale00000000"

    calls: list[str] = []
    monkeypatch.setattr(canonical_bootstrap, "_alembic_upgrade", lambda url: calls.append("migrate"))
    monkeypatch.setattr(canonical_bootstrap, "_migration_state", lambda url: (None, "headrev"))
    monkeypatch.setattr(canonical_bootstrap, "_current_version", fake_current)
    monkeypatch.setattr(canonical_bootstrap, "_verify", lambda url, expected_panel: True)
    monkeypatch.setattr(load_postgres, "main", lambda argv: calls.append("load") or 0)

    code = canonical_bootstrap.main(["--url", "postgresql+psycopg://u:p@127.0.0.1:1/x"])

    assert code == 0
    assert calls == ["migrate", "load"]


def test_expected_panel_matches_the_processed_build(processed_dir):
    """The verified period set and row count come from the built artefact."""
    import json

    import pandas as pd

    from scripts.data.canonical_bootstrap import REQUIRED_BOOTSTRAP_PERIODS, _expected_panel
    from scripts.tests.conftest import require

    panel_path = require(processed_dir / "crop_productivity.csv")
    manifest = json.loads(require(processed_dir / "manifest.json").read_text())
    expected = _expected_panel(panel_path, manifest)

    frame = pd.read_csv(panel_path)
    assert expected["rows"] == len(frame)
    assert expected["rows"] == manifest["row_counts"]["crop_productivity"]
    assert len(expected["periods"]) == frame["period_code"].nunique()
    # The historical periods the repaired deployment must be able to serve.
    assert set(REQUIRED_BOOTSTRAP_PERIODS).issubset(set(expected["periods"]))
