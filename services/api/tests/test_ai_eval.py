"""A small, human-reviewable gold corpus for the planner.

This is deliberately **not** thousands of machine-generated sentences. It is a
curated set where every case has a known expected language, intent and entity
set, so a change to the ontology or the planner that regresses a real question
fails here instead of shipping.

The corpus lives in ``ai_eval/planner_cases.jsonl`` so it can grow without
touching this file, and so it can be reused by any future evaluation command.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.ai import language
from app.ai.planner import plan
from app.ai.schemas import AIRequest

CASES_PATH = Path(__file__).parent / "ai_eval" / "planner_cases.jsonl"


def _load_cases() -> list[dict]:
    cases = []
    for line in CASES_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            cases.append(json.loads(line))
    return cases


CASES = _load_cases()


def _by_id(case_id: str) -> dict:
    return next(case for case in CASES if case["id"] == case_id)


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_planner_gold_case(case: dict):
    resolved = plan(AIRequest(question=case["question"]))
    assert resolved.intent == case["intent"], case["id"]
    assert resolved.crops == case["crops"], case["id"]
    assert resolved.districts == case["districts"], case["id"]
    assert language.detect(case["question"]) == case["language"], case["id"]


def test_corpus_has_no_duplicate_ids():
    ids = [case["id"] for case in CASES]
    assert len(ids) == len(set(ids))


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503 or not res.json().get("rows"):
        pytest.skip("processed tables not built; run `make data`")


def test_grounding_gold_cases_are_answerable(client):
    """Every candidate the planner routes to a real operation must ground."""
    _require_data(client)
    groundable = [
        "Why is maize yield low in Gisagara?",
        "Compare maize and beans in Rwanda",
        "Which districts have the largest maize productivity gaps?",
    ]
    for question in groundable:
        body = client.post("/api/v1/assistant/query", json={"question": question}).json()
        assert body["grounded"] is True, question
        assert body["validation"]["numeric"]["ok"] is True, (question, body["validation"])
