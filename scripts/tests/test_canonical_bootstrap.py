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
