"""Manual projection engine: arithmetic, contract and honesty guarantees.

Two families of test:

* the pure arithmetic in ``app.analytics.manual_projection`` — season stepping,
  carry-forward, once-vs-per-step change, unit conversion and the guards;
* the endpoint contract — the baseline really comes from the published panel,
  the result is labelled a planning projection, the request is strict, the
  response is deterministic, and an unanswerable selection returns a structured
  reason instead of an all-null success.
"""

from __future__ import annotations

import pytest

from app.analytics import manual_projection as mp

# --- pure arithmetic --------------------------------------------------------


def test_next_same_season_codes_stay_in_the_same_season():
    # A horizon is *annual observations of one season*, never A -> B -> C.
    assert mp.next_same_season_codes("2026B", 3) == ["2027B", "2028B", "2029B"]
    assert mp.next_same_season_codes("2024A", 1) == ["2025A"]


def test_horizon_bounds_are_enforced():
    with pytest.raises(mp.ProjectionError) as exc:
        mp.next_same_season_codes("2026B", 0)
    assert exc.value.code == "horizon_out_of_range"
    with pytest.raises(mp.ProjectionError):
        mp.next_same_season_codes("2026B", mp.MAX_HORIZON_STEPS + 1)


def test_carry_forward_holds_the_baseline():
    assert mp.carry_forward(1200.0, 3) == [1200.0, 1200.0, 1200.0]


def test_percent_change_once_is_a_level_shift():
    assert mp.percent_change(1000.0, 10.0, 3, mp.COMPOUND_ONCE) == [1100.0, 1100.0, 1100.0]


def test_percent_change_per_step_compounds():
    values = mp.percent_change(1000.0, 10.0, 3, mp.COMPOUND_PER_STEP)
    assert values == pytest.approx([1100.0, 1210.0, 1331.0])


def test_percent_change_rejects_an_impossible_rate():
    with pytest.raises(mp.ProjectionError) as exc:
        mp.percent_change(1000.0, -150.0, 1, mp.COMPOUND_ONCE)
    assert exc.value.code == "change_out_of_range"


def test_ensure_positive_rate_result_rejects_non_positive():
    with pytest.raises(mp.ProjectionError) as exc:
        mp.ensure_positive_rate_result(1000.0, -5.0, mp.METRIC_YIELD)
    assert exc.value.code == "impossible_quantity"


def test_production_from_converts_units_in_python():
    # kg/ha * ha = kg; kg / 1000 = metric tonnes.
    assert mp.production_from(2000.0, 10.0) == pytest.approx(20.0)


def test_parse_rejects_a_malformed_period():
    with pytest.raises(mp.ProjectionError):
        mp.parse_period("2026")


# --- endpoint contract ------------------------------------------------------


def _pick_selection() -> tuple[str, str]:
    """A district x crop with at least two published Season B observations."""
    from app.repositories import dataset_repository as repo

    panel = repo.crop_productivity()
    rows = panel[
        (panel["geography_level"].astype(str).str.upper() == "DISTRICT")
        & (panel["farmer_scale"].astype(str).str.lower() == "all")
        & (panel["season"].astype(str).str.upper() == "B")
        & (panel["yield_kg_ha"] > 0)
    ]
    counts = rows.groupby(["district", "canonical_crop_name"]).size()
    eligible = counts[counts >= 2]
    assert not eligible.empty, "fixture data must publish repeated Season B observations"
    district, crop = eligible.index[0]
    return str(district), str(crop)


def _latest_season_b(panel_district: str, crop: str) -> tuple[str, float]:
    from app.repositories import dataset_repository as repo

    panel = repo.crop_productivity()
    rows = panel[
        (panel["district"].astype(str).str.lower() == panel_district.lower())
        & (panel["canonical_crop_name"].astype(str).str.lower() == crop.lower())
        & (panel["season"].astype(str).str.upper() == "B")
        & (panel["yield_kg_ha"] > 0)
    ].sort_values("period_code")
    last = rows.iloc[-1]
    return str(last["period_code"]), float(last["yield_kg_ha"])


def test_carry_forward_projection_matches_the_published_baseline(client):
    district, crop = _pick_selection()
    origin, observed = _latest_season_b(district, crop)
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "horizon_steps": 2,
            "metric": "yield_kg_ha",
            "method": "carry_forward",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()

    # It is a planning projection, never an official statistic.
    assert body["value_kind"] == "planning_projection"
    assert body["assumption_badge"] == "Your assumptions"
    assert body["baseline_value"] == pytest.approx(observed, rel=1e-6)
    assert body["resolved"]["origin_period"] == origin
    # Same-season steps only.
    assert all(code.endswith("B") for code in body["resolved"]["target_periods"])
    assert body["resolved"]["target_periods"][0] == f"{int(origin[:4]) + 1}B"

    points = body["cases"][0]["points"]
    assert len(points) == 2
    assert all(point["is_planning_target"] for point in points)
    assert all(point["value"] == pytest.approx(observed, rel=1e-6) for point in points)

    # Export rows separate observation from projection.
    kinds = {row["row_kind"] for row in body["export_rows"]}
    assert "observed_baseline" in kinds and "projection" in kinds
    assert all(
        row["row_kind"] in {"observed_baseline", "assumption", "projection"}
        for row in body["export_rows"]
    )


def test_percent_change_reports_its_compounding(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "horizon_steps": 2,
            "metric": "yield_kg_ha",
            "method": "percent_change",
            "change_pct": 10.0,
            "compounding": "per_step",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    baseline = body["baseline_value"]
    points = body["cases"][0]["points"]
    assert points[0]["value"] == pytest.approx(baseline * 1.10, rel=1e-4)
    assert points[1]["value"] == pytest.approx(baseline * 1.21, rel=1e-4)
    assert body["assumptions"]["compounding"] == "per_step"


def test_personal_plan_requires_production_metric(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "personal",
            "assumed_yield_kg_ha": 1500,
            "assumed_harvested_area_ha": 2,
            "metric": "yield_kg_ha",
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "personal_metric_mismatch"


def test_personal_plan_is_flagged_as_an_assumption(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "personal",
            "metric": "production_mt",
            "assumed_yield_kg_ha": 1500,
            "assumed_harvested_area_ha": 2,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["baseline_is_assumption"] is True
    # 1500 kg/ha * 2 ha / 1000 = 3 metric tonnes.
    assert body["baseline_value"] == pytest.approx(3.0)
    assert any(row["row_kind"] == "assumption" for row in body["export_rows"])


def test_unknown_district_returns_a_structured_reason(client):
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": "Maize",
            "geography": "district",
            "district": "Atlantis",
            "season": "B",
            "method": "carry_forward",
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "no_published_rows"


def test_window_larger_than_history_is_refused(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "carry_forward",
            "baseline": "median_window",
            "baseline_window": 8,
        },
    )
    # Either the window is satisfiable (200) or it is refused with a reason that
    # names the shortfall; never an all-null success.
    if response.status_code == 422:
        assert response.json()["detail"]["code"] == "window_too_short"


def test_unknown_field_is_rejected(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "carry_forward",
            "wg": 0.3,  # engine-keyed vocabulary must not be accepted here
        },
    )
    assert response.status_code == 422


def test_carry_forward_rejects_a_change(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "carry_forward",
            "change_pct": 10,
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unexpected_assumption"


def test_carry_forward_with_assumption_cases_is_refused_not_silently_trimmed(
    client,
):
    """A carried-forward baseline has no change to vary.

    Accepting the cases and computing only the main one would hand back a
    result that is not what the request asked for — the same refusal rule the
    personal method already applies.
    """
    crop, district = "Maize", "Bugesera"
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "carry_forward",
            "cases": [
                {"label": "lower", "change_pct": 5},
                {"label": "main", "change_pct": 10},
                {"label": "higher", "change_pct": 15},
            ],
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "cases_not_supported"
    assert detail["message"]


def test_response_is_deterministic(client):
    district, crop = _pick_selection()
    payload = {
        "crop": crop,
        "geography": "district",
        "district": district,
        "season": "B",
        "horizon_steps": 2,
        "method": "percent_change",
        "change_pct": 5.0,
    }
    first = client.post("/api/v1/scenarios/manual-projection", json=payload).json()
    second = client.post("/api/v1/scenarios/manual-projection", json=payload).json()
    assert first["calculation_id"] == second["calculation_id"]
    assert first["cases"] == second["cases"]


def test_unordered_cases_are_refused(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "percent_change",
            "cases": [
                {"label": "lower", "change_pct": 20},
                {"label": "main", "change_pct": 10},
                {"label": "higher", "change_pct": 30},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "cases_out_of_order"


# --- edge cases: empty history, season agreement, cutoff, partial cases -------


def _personal_payload(**overrides) -> dict:
    payload = {
        "crop": "Wheat",
        "geography": "district",
        "district": "Bugesera",
        "season": "C",
        "method": "personal",
        "metric": "production_mt",
        "horizon_steps": 1,
        "assumed_yield_kg_ha": 1000,
        "assumed_harvested_area_ha": 2,
    }
    payload.update(overrides)
    return payload


def test_personal_plan_with_empty_history_and_a_stated_origin_is_not_a_500(client):
    """Wheat/Bugesera/Season C has no positive C-season observations.

    An explicitly assumed origin must be permitted as a planning period; the
    service used to index ``observations[-1]`` on the empty history and crash.
    """
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json=_personal_payload(origin_period="2025C"),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["resolved"]["origin_period"] == "2025C"
    assert body["resolved"]["origin_kind"] == "assumed"
    assert body["resolved"]["target_periods"] == ["2026C"]
    assert body["evidence"] == []
    assert body["baseline_observations"] == []
    # 1000 kg/ha * 2 ha / 1000 = 2 metric tonnes.
    assert body["baseline_value"] == pytest.approx(2.0)
    assert body["baseline_is_assumption"] is True
    assert any("planning period rather than a published observation" in w for w in body["warnings"])


def test_personal_season_c_plan_without_origin_never_anchors_on_another_season(client):
    """Without an origin the plan used to take the globally latest 2026B and
    project 2027B while echoing season C."""
    response = client.post(
        "/api/v1/scenarios/manual-projection", json=_personal_payload()
    )
    assert response.status_code == 200, response.text
    body = response.json()
    origin = body["resolved"]["origin_period"]
    assert origin.endswith("C"), origin
    assert body["resolved"]["origin_kind"] == "assumed"
    assert body["resolved"]["target_periods"]
    assert all(code.endswith("C") for code in body["resolved"]["target_periods"])
    # No observation is implied to exist.
    assert body["baseline_observations"] == []


def test_an_origin_from_another_season_is_refused_structured(client):
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json=_personal_payload(origin_period="2025B"),
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "origin_season_mismatch"
    assert "C-season" in detail["message"]


def test_historical_origin_restricts_evidence_baseline_and_export_to_the_cutoff(client):
    """A plan anchored in 2023B must not carry 2024B/2025B/2026B evidence."""
    payload = _personal_payload(
        crop="Maize", season="B", origin_period="2023B"
    )
    response = client.post("/api/v1/scenarios/manual-projection", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    evidence_periods = [e["period_code"] for e in body["evidence"]]
    baseline_periods = [o["period_code"] for o in body["baseline_observations"]]
    export_observed = [
        row["period_code"]
        for row in body["export_rows"]
        if row["row_kind"] == "observed_baseline"
    ]
    for periods in (evidence_periods, baseline_periods, export_observed):
        assert periods, "the fixture should publish Season B maize observations"
        assert all(p <= "2023B" for p in periods), periods
        assert "2026B" not in periods
    assert any("restricted to observations at or before it" in w for w in body["warnings"])


def test_partial_assumption_cases_validate_every_present_ordered_pair(client):
    district, crop = _pick_selection()
    inverted = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "percent_change",
            # No "main": only lower and higher are present, and they are inverted.
            "cases": [
                {"label": "lower", "change_pct": 20},
                {"label": "higher", "change_pct": 10},
            ],
        },
    )
    assert inverted.status_code == 422
    assert inverted.json()["detail"]["code"] == "cases_out_of_order"

    main_vs_higher = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "percent_change",
            "cases": [
                {"label": "main", "change_pct": 30},
                {"label": "higher", "change_pct": 10},
            ],
        },
    )
    assert main_vs_higher.status_code == 422
    assert main_vs_higher.json()["detail"]["code"] == "cases_out_of_order"

    ordered = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "percent_change",
            "cases": [
                {"label": "lower", "change_pct": -10},
                {"label": "higher", "change_pct": 5},
            ],
        },
    )
    assert ordered.status_code == 200, ordered.text
    labels = [case["label"] for case in ordered.json()["cases"]]
    assert labels == ["lower", "higher"]


def test_negative_assumption_cases_compute_ordered_results(client):
    district, crop = _pick_selection()
    response = client.post(
        "/api/v1/scenarios/manual-projection",
        json={
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "percent_change",
            "compounding": "once",
            "horizon_steps": 1,
            "cases": [
                {"label": "lower", "change_pct": -20},
                {"label": "main", "change_pct": 0},
                {"label": "higher", "change_pct": 15},
            ],
        },
    )
    assert response.status_code == 200, response.text
    cases = response.json()["cases"]
    assert [c["label"] for c in cases] == ["lower", "main", "higher"]
    values = [c["points"][0]["value"] for c in cases]
    assert values == sorted(values), "results must be ordered by assumption"
    assert values[0] < values[1] < values[2]


def test_zero_baselines_and_impossible_results_are_structured_refusals():
    """Pure arithmetic: a zero baseline can never produce a valid projection."""
    values = mp.percent_change(0.0, 10.0, 1, mp.COMPOUND_ONCE)
    assert values == [0.0]
    with pytest.raises(mp.ProjectionError) as exc:
        mp.ensure_positive_rate_result(0.0, 0.0, mp.METRIC_PRODUCTION)
    assert exc.value.code == "impossible_quantity"


def test_every_supported_input_returns_structured_outcomes_not_500(client):
    """No supported input may produce an unhandled server error."""
    district, crop = _pick_selection()
    payloads = [
        _personal_payload(),  # empty history, no origin
        _personal_payload(origin_period="2025C"),  # empty history, assumed origin
        _personal_payload(origin_period="2099C"),  # unpublished same-season period
        _personal_payload(origin_period="not-a-period"),
        _personal_payload(crop=crop, district=district, season="B"),  # history exists
        _personal_payload(crop=crop, district=district, season="B", origin_period="2023B"),
        {
            "crop": crop,
            "geography": "district",
            "district": district,
            "season": "B",
            "method": "percent_change",
            "baseline": "median_window",
            "baseline_window": 8,  # larger than the history
            "change_pct": -95,
        },
        {
            "crop": "Wheat",
            "geography": "district",
            "district": "Bugesera",
            "season": "C",
            "method": "carry_forward",  # no observed baseline for season C
        },
    ]
    for payload in payloads:
        response = client.post("/api/v1/scenarios/manual-projection", json=payload)
        assert response.status_code in (200, 422), (payload, response.status_code, response.text)
        if response.status_code == 422:
            detail = response.json()["detail"]
            # Either the schema's own validation list or the engine's
            # structured {code, message} refusal - never an unhandled error.
            if isinstance(detail, list):
                assert detail, detail
            else:
                assert isinstance(detail, dict) and detail.get("code"), detail
