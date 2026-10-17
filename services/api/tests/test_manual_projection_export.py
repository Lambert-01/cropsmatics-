"""The origin selector and the Python-generated manual-projection export.

Both exist so the planning workflow never *offers* something the calculation
will refuse, and never *downloads* something the screen did not show:

* origin options come from the panel's actual same-season coverage for the
  scope — the same observations ``POST /scenarios/manual-projection`` will
  use, in the same order, so the default option and the default calculation
  agree;
* the CSV export recomputes the identical request server-side and carries the
  calculation id, dataset/method versions, resolved scope, origin/target,
  assumption case and complete assumptions on every row, behind a normal CSV
  header with no prose comment before it.
"""

from __future__ import annotations

import csv as csv_module
import io
import json

import pytest

SEASON = "B"
CROP = "Maize"
DISTRICT = "Bugesera"

EXPECTED_HEADER = [
    "calculation_id",
    "value_kind",
    "assumption_badge",
    "methodology_version",
    "dataset_version",
    "crop",
    "geography",
    "district",
    "province",
    "season",
    "origin_period",
    "origin_kind",
    "metric",
    "method",
    "baseline",
    "baseline_window",
    "change_pct",
    "compounding",
    "assumed_yield_kg_ha",
    "assumed_harvested_area_ha",
    "assumptions_json",
    # Row-level metric: the key sits in the context block (a dict keeps the
    # first position) and each row's own metric wins the value — the
    # assumed-production baseline row is production even for a yield plan.
    "row_kind",
    "label",
    "period_code",
    "period_label",
    "target_period",
    "value",
    "unit",
    "assumption_case",
    "source_id",
    "note",
]


def _require_panel(client, **params) -> dict | None:
    """Probe the panel through the origins endpoint; skip when data is absent."""
    res = client.get(
        "/api/v1/scenarios/manual-projection/origins",
        params=params or {"crop": CROP, "season": SEASON, "district": DISTRICT},
    )
    if res.status_code == 422:
        detail = res.json().get("detail") or {}
        if isinstance(detail, dict) and detail.get("code") in (
            "panel_unavailable",
            "canonical_data_unavailable",
        ):
            pytest.skip("processed tables not built; run `make data`")
    return None if res.status_code != 200 else res.json()


def _plan(**overrides) -> dict:
    body = {"crop": CROP, "district": DISTRICT, "season": SEASON}
    body.update(overrides)
    return body


# --- origin selector ----------------------------------------------------------


def test_origin_options_follow_actual_same_season_coverage(client):
    payload = _require_panel(client)
    assert payload is not None
    origins = payload["origins"]
    if not origins:
        pytest.skip("this scope publishes no same-season observations in this build")

    codes = [option["period_code"] for option in origins]
    # Only the requested season; chronological, latest last (the default).
    assert all(code.endswith(SEASON) for code in codes)
    assert codes == sorted(codes, key=lambda c: (int(c[:4]), c[4:]))
    assert all(option["kind"] == "observed" for option in origins)
    assert all(option["value"] is None or option["value"] > 0 for option in origins)

    # The selector's default is the calculation's default: the projection
    # without an origin starts at the latest observed option.
    default = client.post("/api/v1/scenarios/manual-projection", json=_plan())
    assert default.status_code == 200, default.text
    assert default.json()["resolved"]["origin_period"] == codes[-1]

    # Every offered historical origin is accepted by the calculation.
    historical = client.post(
        "/api/v1/scenarios/manual-projection",
        json=_plan(origin_period=codes[0]),
    )
    assert historical.status_code == 200, historical.text
    assert historical.json()["resolved"]["origin_period"] == codes[0]


def test_origin_options_exclude_other_seasons(client):
    payload = _require_panel(client, crop=CROP, season="A", district=DISTRICT)
    if payload is None:
        pytest.skip("season A selection unavailable in this build")
    for option in payload["origins"]:
        assert option["period_code"].endswith("A")
        assert option["kind"] == "observed"


def test_origin_options_refuse_a_scope_without_published_rows(client):
    res = client.get(
        "/api/v1/scenarios/manual-projection/origins",
        params={"crop": "Not A Published Crop", "season": SEASON},
    )
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["code"] == "no_published_rows"
    assert detail["message"]


# --- CSV export ---------------------------------------------------------------


def test_csv_export_starts_with_a_normal_header(client):
    _require_panel(client)
    res = client.post("/api/v1/reports/manual-projection.csv", json=_plan())
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    lines = res.text.splitlines()
    assert lines, "the export always has a header"
    # No prose comment before the header: a consumer reading line 1 gets columns.
    assert not lines[0].startswith("#")
    header = next(csv_module.reader(io.StringIO(lines[0])))
    assert header == EXPECTED_HEADER
    # The download is named after the calculation that produced it.
    disposition = res.headers.get("content-Disposition", "")
    assert "mp_" in disposition


def test_csv_export_matches_the_projection_row_for_row(client):
    _require_panel(client)
    plan = _plan(
        method="percent_change",
        change_pct=10,
        compounding="per_step",
        horizon_steps=2,
        cases=[
            {"label": "lower", "change_pct": 5},
            {"label": "main", "change_pct": 10},
            {"label": "higher", "change_pct": 15},
        ],
    )
    computed = client.post("/api/v1/scenarios/manual-projection", json=plan)
    assert computed.status_code == 200, computed.text
    result = computed.json()

    exported = client.post("/api/v1/reports/manual-projection.csv", json=plan)
    assert exported.status_code == 200, exported.text
    table = list(csv_module.reader(io.StringIO(exported.text)))
    header, *rows = table
    index = {name: i for i, name in enumerate(header)}

    assert len(rows) == len(result["export_rows"])
    for row, expected in zip(rows, result["export_rows"], strict=False):
        assert row[index["row_kind"]] == expected["row_kind"]
        assert row[index["label"]] == expected["label"]
        assert (row[index["period_code"]] or None) == expected["period_code"]
        assert row[index["metric"]] == expected["metric"]
        assert float(row[index["value"]]) == pytest.approx(expected["value"])
        assert row[index["unit"]] == expected["unit"]
        assert (row[index["assumption_case"]] or None) == expected["case"]
        assert (row[index["source_id"]] or None) == expected["source_id"]
        assert (row[index["note"]] or None) == expected["note"]

    # Self-describing context on every row: what the file is, which plan made
    # it, which dataset and method versions, scope, origin/target, compounding
    # and the complete assumptions.
    for row in rows:
        assert row[index["calculation_id"]] == result["calculation_id"]
        assert row[index["value_kind"]] == "planning_projection"
        assert row[index["value_kind"]] == result["value_kind"]
        assert row[index["methodology_version"]] == result["methodology_version"]
        assert row[index["dataset_version"]] == (result["dataset_version"] or "")
        assert row[index["crop"]] == result["resolved"]["crop"]
        assert row[index["district"]] == result["resolved"]["district"]
        assert row[index["season"]] == result["resolved"]["season"]
        assert row[index["origin_period"]] == result["resolved"]["origin_period"]
        assert row[index["origin_kind"]] == result["resolved"]["origin_kind"]
        assert row[index["method"]] == "percent_change"
        assert row[index["compounding"]] == "per_step"
        assert json.loads(row[index["assumptions_json"]]) == result["assumptions"]
        if row[index["row_kind"]] == "projection":
            assert row[index["target_period"]] == row[index["period_code"]]
        else:
            assert row[index["target_period"]] == ""

    cases = {row[index["assumption_case"]] for row in rows if row[index["row_kind"]] == "projection"}
    assert cases == {"lower", "main", "higher"}


def test_csv_export_is_byte_identical_for_the_same_request(client):
    _require_panel(client)
    plan = _plan(method="carry_forward", horizon_steps=1)
    first = client.post("/api/v1/reports/manual-projection.csv", json=plan)
    second = client.post("/api/v1/reports/manual-projection.csv", json=plan)
    assert first.status_code == second.status_code == 200
    # The calculation id is spec-derived, so the same plan reproduces the file.
    assert first.text == second.text


def test_csv_export_refuses_what_the_projection_refuses(client):
    _require_panel(client)
    # An origin from another season: the projection refuses it, and the export
    # must not silently compute a different plan than the screen showed.
    plan = _plan(origin_period="2024A")
    refused = client.post("/api/v1/scenarios/manual-projection", json=plan)
    assert refused.status_code == 422
    code = refused.json()["detail"]["code"]

    exported = client.post("/api/v1/reports/manual-projection.csv", json=plan)
    assert exported.status_code == 422
    assert exported.json()["detail"]["code"] == code
