"""The API half of the shared manual-projection contract.

Reads the same fixture as ``apps/web/tests/manual-projection.test.ts``: every
``accepted`` request must succeed and echo the expected origin/target periods, and
every ``rejected`` one must be refused for the stated reason. A change to the
request shape on either side fails here or there rather than silently drifting.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "manual_projection_contract.json"
DATA = json.loads(FIXTURE.read_text())
ENDPOINT = "/api/v1/scenarios/manual-projection"


def _ids(cases):
    return [case["name"] for case in cases]


@pytest.mark.parametrize("case", DATA["accepted"], ids=_ids(DATA["accepted"]))
def test_accepted_requests_succeed(client, case):
    response = client.post(ENDPOINT, json=case["request"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["value_kind"] == "planning_projection"
    assert body["resolved"]["origin_period"] == case["expect"]["origin_period"]
    assert body["resolved"]["target_periods"] == case["expect"]["target_periods"]
    # Same-season steps only, never A -> B -> C.
    assert all(
        code.endswith(case["inputs"]["season"]) for code in body["resolved"]["target_periods"]
    )


@pytest.mark.parametrize("case", DATA["rejected"], ids=_ids(DATA["rejected"]))
def test_rejected_requests_are_refused(client, case):
    response = client.post(ENDPOINT, json=case["request"])
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    if isinstance(detail, list):
        # FastAPI/pydantic's own schema validation (unknown field, out-of-range
        # value) rather than a structured engine refusal.
        types = {entry.get("type") for entry in detail}
        if case["refusal"] == "extra_forbidden":
            assert "extra_forbidden" in types, detail
        else:
            assert types, detail
        return
    assert detail["code"] == case["refusal"]
