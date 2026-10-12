"""Every source the processed artefacts cite must be declared in the catalogue.

This test exists because its absence took the canonical integration job down: the
2022/2023 releases and the legacy district pack were ingested into the panel while
``app.data.catalogue.SOURCES`` was not extended, so the loader's
``source_table.source_id`` foreign key had no ``data_source`` row to point at. The
whole canonical load rolled back and seventeen database tests failed - reported as
"API pytest failed" rather than as "a release is missing from the catalogue".

The database suite still proves the constraint, but only after migrations and a
full load. This check is offline and instant, which is what makes the failure
legible at the point the source is introduced.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.core.config import REPO_ROOT
from app.data.catalogue import SOURCES

PROCESSED_DIR = REPO_ROOT / "data" / "processed"
REGISTRY_PATH = REPO_ROOT / "data" / "source_registry" / "data_sources.csv"


def _cited_source_ids() -> dict[str, set[str]]:
    """source_id -> the processed files that cite it."""
    cited: dict[str, set[str]] = {}
    if not PROCESSED_DIR.exists():
        return cited
    for path in sorted(PROCESSED_DIR.glob("*.csv")):
        frame = pd.read_csv(path, usecols=lambda column: column == "source_id")
        if "source_id" not in frame.columns:
            continue
        for value in frame["source_id"].dropna().unique():
            cited.setdefault(str(value), set()).add(path.name)
    return cited


def _require_processed() -> dict[str, set[str]]:
    cited = _cited_source_ids()
    if not cited:
        pytest.skip("processed tables not built; run `python scripts/data/run_all.py`")
    return cited


def test_every_cited_source_is_declared():
    cited = _require_processed()
    declared = {source.source_id for source in SOURCES}
    undeclared = {
        source_id: sorted(files) for source_id, files in cited.items() if source_id not in declared
    }
    assert not undeclared, (
        "the processed data cite source(s) missing from app.data.catalogue.SOURCES, so the "
        f"canonical load will violate source_table.source_id: {undeclared}"
    )


def test_declared_source_ids_are_unique():
    """A duplicate id would make `data_source` order-dependent to insert."""
    ids = [source.source_id for source in SOURCES]
    assert len(ids) == len(set(ids))


def test_the_canonical_panel_cites_only_declared_sources():
    """The panel is the fact table the loader writes first; it must attribute."""
    panel = PROCESSED_DIR / "crop_productivity.csv"
    if not panel.exists():
        pytest.skip("processed panel not built; run `python scripts/data/run_all.py`")

    frame = pd.read_csv(panel, usecols=["period_code", "source_id"])
    declared = {source.source_id for source in SOURCES}
    present = {str(value) for value in frame["source_id"].dropna().unique()}
    assert present, "the panel cites no source at all"
    assert present <= declared

    # If the panel reaches back to 2022, that release has to be declared. This is
    # the exact regression that made the canonical load roll back.
    years = {str(code)[:4] for code in frame["period_code"].dropna().unique()}
    if "2022" in years:
        assert "NISR_SAS_2022_ANNUAL" in declared
    if "2023" in years:
        assert "NISR_SAS_2023_ANNUAL" in declared


def test_registry_backed_sources_resolve_to_a_registry_row():
    """A declared registry name that does not exist would silently lose its URL."""
    if not REGISTRY_PATH.exists():
        pytest.skip("curated registry not built; run `python scripts/data/run_all.py`")
    # The curated registry keys on `source`; the loader joins on it directly.
    registry = pd.read_csv(REGISTRY_PATH)
    names = {str(value) for value in registry["source"].dropna()}

    named = [source for source in SOURCES if source.registry_name]
    assert named, "no source is registry-backed; the registry join is untested"
    unresolved = sorted(source.source_id for source in named if source.registry_name not in names)
    assert not unresolved, (
        f"these sources name a registry entry that does not exist: {unresolved}"
    )
