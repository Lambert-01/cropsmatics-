"""The request contract for ``POST /scenarios/priority``, pinned from both sides.

The 422 this suite was written to prevent was a *contract* failure rather than a
logic failure: the web Scenario Lab moved one weight slider by 0.05, left the
five-way total at 1.05, and the request was refused with
``weights must sum to ~1.0 (got 1.050)``. The control that produced it even said
the values "will be normalised to 1.00", which the server never did.

Worse, the neighbouring case failed *silently*: pydantic ignores unknown fields
by default, so posting back the engine-keyed dictionary a previous response had
just returned answered **HTTP 200** and ranked with the default weighting.

Both are contract bugs, so both are pinned against a single fixture that the web
builder must reproduce:

``services/api/tests/fixtures/priority_scenario_contract.json``

* every ``accepted`` case must validate against ``PriorityScenarioRequest``;
* every ``rejected`` case must be refused with 422 — by the schema or by the
  service, and the reader must be told which field to fix.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.analytics import ENGINE_WEIGHT_KEYS, WEIGHT_KEYS
from app.schemas.priority_scenario import PriorityScenarioRequest

FIXTURE = Path(__file__).parent / "fixtures" / "priority_scenario_contract.json"

PUBLISHED_PERIOD = "2026B"


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


ACCEPTED = _fixture()["accepted"]
REJECTED = _fixture()["rejected"]


def _require_data(client) -> None:
    resp = client.get(
        "/api/v1/analytics/intervention-priorities",
        params={"period_code": PUBLISHED_PERIOD, "limit": 1},
    )
    if resp.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not resp.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def test_the_fixture_covers_both_sides() -> None:
    """A fixture that stopped carrying cases would otherwise pass vacuously."""
    assert ACCEPTED, "the contract fixture has no accepted cases"
    assert REJECTED, "the contract fixture has no rejected cases"


@pytest.mark.parametrize("case", ACCEPTED, ids=lambda case: case["name"])
def test_an_accepted_request_validates_against_the_schema(case: dict) -> None:
    """The web builder's own output is, by definition, a valid request."""
    request = PriorityScenarioRequest.model_validate(case["request"])

    # The public vocabulary, and only it. Sending back the engine's keys is the
    # silent-defaulting bug this file exists to prevent.
    for side in (request.baseline, request.scenario):
        engine_weights = side.weights.to_engine()
        assert set(engine_weights) == set(ENGINE_WEIGHT_KEYS)
        assert set(WEIGHT_KEYS) == {"gap", "vulnerability", "affected_scale", "readiness", "cost"}


@pytest.mark.parametrize("case", ACCEPTED, ids=lambda case: case["name"])
def test_an_accepted_request_is_served(client, case: dict) -> None:
    """...and the service actually answers it, rather than only the schema."""
    _require_data(client)
    res = client.post("/api/v1/scenarios/priority", json=case["request"])
    assert res.status_code == 200, res.text
    body = res.json()
    # Both sides echo the scope they were ranked under, so a reader can always
    # tell which selection produced which ranking.
    for side in ("baseline", "scenario"):
        assert body[side]["benchmark_strategy"] == case["request"][side]["benchmark_strategy"]
        assert body[side]["period_code"]


#: What a reader must be able to learn from each refusal. A 422 that does not
#: name the field to fix is barely better than a silent default.
EXPECTED_MESSAGES: dict[str, tuple[str, ...]] = {
    # Engine keys: name both vocabularies, or the caller cannot rename them.
    "engine_keys": ("planner field names", "wg -> gap"),
    # Off the simplex: state the actual total and the tolerance.
    "sum": ("1.0500", "0.02"),
    # A 0..100 slider value: report the field constraint on that weight.
    "range": ("less than or equal to 1",),
    # Service-level refusals, asserted after the POST below.
    "period": ("2019A",),
    "benchmark": ("benchmark",),
    "extra": ("Extra inputs are not permitted",),
}


@pytest.mark.parametrize("case", REJECTED, ids=lambda case: case["name"])
def test_a_rejected_request_is_refused_with_a_readable_reason(client, case: dict) -> None:
    """Either the schema or the service refuses it — never a silent 200."""
    assert case["refusal"] in EXPECTED_MESSAGES, "unknown refusal kind in the fixture"
    expected = EXPECTED_MESSAGES[case["refusal"]]

    try:
        PriorityScenarioRequest.model_validate(case["request"])
    except ValidationError as exc:
        # Refused locally by the schema. The message must point at the field.
        message = "; ".join(str(error["msg"]) for error in exc.errors())
        assert message.strip()
        assert any(token in message for token in expected), message
        # The refusal is a 422 over HTTP, not a 500 or a silent success.
        assert client.post("/api/v1/scenarios/priority", json=case["request"]).status_code == 422
        return

    # The shape is valid, so the *service* must refuse it (an unpublished period
    # or an unsupported benchmark strategy) rather than answer with a comparison
    # that reads as "no difference".
    _require_data(client)
    res = client.post("/api/v1/scenarios/priority", json=case["request"])
    assert res.status_code == 422, res.text
    detail = json.dumps(res.json()["detail"])
    assert any(token in detail for token in expected), detail


def test_engine_keyed_weights_are_refused_rather_than_ignored(client) -> None:
    """The specific silent-wrong-answer case, asserted on its own.

    Before this change the request below answered 200 and ranked with
    ``DEFAULT_WEIGHTS`` — a plausible ranking computed from assumptions the caller
    had explicitly replaced.
    """
    engine_only = {"wg": 0.5, "wv": 0.15, "wf": 0.15, "wr": 0.15, "wc": 0.05}
    body = {"baseline": {"weights": engine_only}, "scenario": {"weights": engine_only}}

    with pytest.raises(ValidationError) as excinfo:
        PriorityScenarioRequest.model_validate(body)
    message = str(excinfo.value)
    assert "wg" in message
    assert "gap" in message

    res = client.post("/api/v1/scenarios/priority", json=body)
    assert res.status_code == 422
    assert "planner field names" in res.json()["detail"][0]["msg"]


def test_a_weighting_off_the_simplex_states_the_total_and_the_tolerance(client) -> None:
    """The exact 422 from the incident, now with an actionable message."""
    body = {
        "baseline": {
            "weights": {
                "gap": 0.35,
                "vulnerability": 0.2,
                "affected_scale": 0.2,
                "readiness": 0.2,
                "cost": 0.1,
            }
        },
        "scenario": {
            "weights": {
                "gap": 0.5,
                "vulnerability": 0.15,
                "affected_scale": 0.15,
                "readiness": 0.15,
                "cost": 0.05,
            }
        },
    }
    res = client.post("/api/v1/scenarios/priority", json=body)
    assert res.status_code == 422
    message = res.json()["detail"][0]["msg"]
    assert "1.0500" in message
    assert "0.02" in message


def test_an_unknown_side_field_is_refused_rather_than_dropped(client) -> None:
    """A misspelled scope field must not silently become the default scope."""
    body = {
        "baseline": {
            "benchmark": "national_crop_median",
            "weights": {
                "gap": 0.3,
                "vulnerability": 0.2,
                "affected_scale": 0.2,
                "readiness": 0.2,
                "cost": 0.1,
            },
        },
        "scenario": {},
    }
    with pytest.raises(ValidationError):
        PriorityScenarioRequest.model_validate(body)
    assert client.post("/api/v1/scenarios/priority", json=body).status_code == 422
