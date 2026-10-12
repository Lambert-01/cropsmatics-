"""The period catalogue's coverage level, when the layers disagree.

The production symptom this fixes: the Overview listed releases as "coverage
unknown" even though the coverage matrix described them. The cause was that
``catalog()`` only ever took a period's level from the productivity panel, so a
period the panel did not substantiate - which is exactly what happens when the
serving database is older than the processed pipeline - ended up with
``coverage_level = None`` and the interface printed a label that meant nothing.

These tests drive ``catalog()`` from injected layer contents, so they assert the
derivation rule itself rather than whatever this machine happens to have loaded.
No database and no processed artefact is required.
"""

from __future__ import annotations

import pytest

from app.services import period_service


def _panel(periods: dict[str, dict]) -> dict:
    """A ``_panel_periods()``-shaped payload."""
    return periods


def _panel_fact(level: str, districts: int = 30, crops: int = 17) -> dict:
    return {
        "dataset": period_service.PANEL_DATASET,
        "coverage_level": level,
        "n_districts": districts,
        "n_crops": crops,
        "n_rows": 10,
        "source_id": "NISR_SAS_TEST",
    }


@pytest.fixture()
def catalogue(monkeypatch):
    """Build a catalogue from injected layers, without touching cached state."""

    def build(panel: dict[str, dict], coverage_rows: list[dict]) -> dict:
        monkeypatch.setattr(period_service, "_panel_periods", lambda: _panel(panel))
        monkeypatch.setattr(period_service, "_coverage_rows", lambda: coverage_rows)
        period_service.catalog.cache_clear()
        try:
            return period_service.catalog()
        finally:
            period_service.catalog.cache_clear()

    return build


def _level(catalogue_body: dict, code: str) -> str | None:
    for period in catalogue_body["periods"]:
        if period["period_code"] == code:
            return period["coverage_level"]
    raise AssertionError(f"{code} is not in the catalogue")


def test_a_period_only_the_coverage_matrix_describes_keeps_its_recorded_level(catalogue):
    """The regression: a district row in the matrix must not become "unknown"."""
    body = catalogue(
        # The serving panel is behind: it only knows 2026B.
        {"2026B": _panel_fact("district")},
        [
            {
                "dataset": "crop_productivity",
                "period": "2026B",
                "coverage_level": "district",
                "n_districts": 30,
                "n_crops": 17,
                "source_id": "NISR_SAS_2026B",
            },
            {
                "dataset": "crop_productivity",
                "period": "2022B",
                "coverage_level": "district",
                "n_districts": 30,
                "n_crops": 17,
                "source_id": "NISR_SAS_2022_ANNUAL",
            },
        ],
    )

    assert _level(body, "2022B") == "district"
    assert _level(body, "2026B") == "district"
    # And the catalogue says plainly which periods the panel did not substantiate.
    assert body["matrix_only_periods"] == ["2022B"]
    assert body["panel_periods"] == ["2026B"]
    assert any("2022B" in note for note in body["notes"])


def test_the_strongest_substantiated_level_wins(catalogue):
    """A period that has district rows anywhere is not described by its weakest layer."""
    body = catalogue(
        {"2025B": _panel_fact("district")},
        [
            {
                "dataset": "national_input_trends",
                "period": "2025B",
                "coverage_level": "national",
                "n_districts": 0,
                "n_crops": 0,
            },
            {
                "dataset": "crop_productivity",
                "period": "2025B",
                "coverage_level": "district",
                "n_districts": 30,
                "n_crops": 17,
            },
        ],
    )
    assert _level(body, "2025B") == "district"


def test_a_national_crop_level_is_reported_as_such(catalogue):
    """`national_crop` is a published level and must not collapse to unknown."""
    body = catalogue(
        {},
        [
            {
                "dataset": "national_crop_trends",
                "period": "2024B",
                "coverage_level": "national_crop",
                "n_districts": 0,
                "n_crops": 21,
            }
        ],
    )
    assert _level(body, "2024B") == "national_crop"


def test_a_period_with_no_recorded_level_stays_unrecorded(catalogue):
    """Never invent a level: an empty string is not a district statement."""
    body = catalogue(
        {},
        [
            {
                "dataset": "mystery_dataset",
                "period": "2023C",
                "coverage_level": "",
                "n_districts": 0,
                "n_crops": 0,
            }
        ],
    )
    assert _level(body, "2023C") is None


def test_panel_levels_are_not_downgraded_by_the_matrix(catalogue):
    """A panel that carries district rows keeps saying so."""
    body = catalogue(
        {"2026A": _panel_fact("district")},
        [
            {
                "dataset": "national_input_trends",
                "period": "2026A",
                "coverage_level": "national",
                "n_districts": 0,
                "n_crops": 0,
            }
        ],
    )
    assert _level(body, "2026A") == "district"
    assert _level(body, "2026A") is not None


def test_the_note_does_not_claim_panel_coverage_that_is_absent(catalogue):
    """The old note asserted the panel covered every listed period. It cannot."""
    behind = catalogue(
        {"2026B": _panel_fact("district")},
        [
            {
                "dataset": "crop_productivity",
                "period": "2022A",
                "coverage_level": "district",
                "n_districts": 30,
                "n_crops": 17,
            }
        ],
    )
    assert not any("carries rows for every listed period" in note for note in behind["notes"])

    fully = catalogue(
        {"2026B": _panel_fact("district")},
        [
            {
                "dataset": "crop_productivity",
                "period": "2026B",
                "coverage_level": "district",
                "n_districts": 30,
                "n_crops": 17,
            }
        ],
    )
    assert any("carries rows for every listed period" in note for note in fully["notes"])
