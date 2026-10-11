"""Multi-turn conversation: inheritance, bounds and the conversation endpoints.

The behaviour pinned here is the journey the product is built around: a follow-up
that names only what changed must inherit everything else, while a question that
names its own entities must never be rewritten from history.
"""

from __future__ import annotations

import pytest

from app.ai.conversation import ConversationContext, ConversationStore
from app.ai.planner import plan
from app.ai.schemas import AIRequest


def _ctx(**kwargs) -> ConversationContext:
    return ConversationContext(**kwargs)


# --- inheritance (planner-level, no data required) -----------------------------


def test_follow_up_inherits_district_and_period_but_replaces_crop():
    inherited = _ctx(crops=["Maize"], districts=["Gisagara"], period_code="2026B")
    resolved = plan(AIRequest(question="What about beans?"), inherited)
    assert resolved.crops == ["Beans"]
    assert resolved.districts == ["Gisagara"]
    assert resolved.period_code == "2026B"


def test_compare_them_uses_the_recently_discussed_crops():
    inherited = _ctx(crops=["Beans"], districts=["Gisagara"], recent_crops=["Maize", "Beans"])
    resolved = plan(AIRequest(question="Compare them."), inherited)
    assert resolved.intent == "crop_comparison"
    assert resolved.crops == ["Maize", "Beans"]


def test_explicit_entities_are_never_rewritten_from_history():
    inherited = _ctx(crops=["Maize"], districts=["Gisagara"], period_code="2026B")
    resolved = plan(
        AIRequest(question="Why is rice yield low in Musanze?"), inherited
    )
    assert resolved.crops == ["Paddy rice"]
    assert resolved.districts == ["Musanze"]


def test_no_inheritance_without_a_conversation():
    resolved = plan(AIRequest(question="Compare them."))
    # Nothing to inherit, so the question is simply not grounded.
    assert resolved.intent == "unsupported"


def test_previous_season_follow_up_resolves_against_the_inherited_period():
    from app.services import period_service

    latest = period_service.latest_district()
    if not latest:
        pytest.skip("period catalogue not built; run `make data`")
    year, season = period_service.parse(latest)
    previous = f"{year - 1}{season}"
    if previous not in period_service.period_codes():
        pytest.skip("no previous-year same season published")

    inherited = _ctx(crops=["Maize"], districts=["Gisagara"], period_code=latest)
    resolved = plan(AIRequest(question="What about the previous Season B?"), inherited)
    assert resolved.period_code == previous


# --- the store is bounded ------------------------------------------------------


def test_turns_are_bounded():
    store = ConversationStore(max_turns=2)
    state = store.get_or_create("c1")
    for index in range(4):
        store.record_turn(
            state,
            question=f"q{index}",
            intent="crop_national_context",
            crops=["Maize"],
            districts=[],
            period_code=None,
            language="en",
            depth="standard",
            audience="planner",
            answer="a" * 500,
        )
    assert len(state.turns) == 2
    # The answer excerpt is compacted, never stored whole.
    assert state.turns[-1].excerpt is not None
    assert len(state.turns[-1].excerpt) <= 241


def test_conversations_are_bounded():
    store = ConversationStore(max_conversations=3)
    for index in range(6):
        store.get_or_create(f"c{index}")
    assert store.count() <= 3


def test_expired_conversations_are_dropped():
    store = ConversationStore(ttl_seconds=-1)
    store.get_or_create("c1")
    assert store.get("c1") is None


def test_context_fingerprint_carries_no_values():
    context = _ctx(
        crops=["Maize"], districts=["Gisagara"], period_code="2026B", metric="yield"
    )
    fingerprint = context.fingerprint()
    assert set(fingerprint) == {
        "crops",
        "districts",
        "period_code",
        "metric",
        "language",
        "depth",
        "audience",
        "last_intent",
    }
    # Every field is an entity name, a code or a mode - never a measured value.
    for value in fingerprint.values():
        if isinstance(value, str):
            assert not any(ch.isdigit() for ch in value) or value in ("2026B",)


def test_transcript_omits_old_evidence():
    store = ConversationStore()
    state = store.get_or_create("c1")
    store.record_turn(
        state,
        question="Tell me about maize in Gisagara in 2026B",
        intent="district_crop_gap",
        crops=["Maize"],
        districts=["Gisagara"],
        period_code="2026B",
        language="en",
        depth="standard",
        audience="planner",
        answer="In 2026B maize yield in Gisagara was 1159 kg/ha...",
    )
    transcript = state.transcript()
    assert transcript[0]["crops"] == ["Maize"]
    assert "evidence" not in transcript[0]
    assert "answer" not in transcript[0]


# --- end to end: the conversation endpoints ------------------------------------


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503 or not res.json().get("rows"):
        pytest.skip("processed tables not built; run `make data`")


def _ask(client, question: str, *, conversation_id: str | None = None) -> dict:
    payload: dict = {"question": question}
    if conversation_id:
        payload["conversation_id"] = conversation_id
    res = client.post("/api/v1/assistant/query", json=payload)
    assert res.status_code == 200, res.text
    return res.json()


def test_a_stateless_question_has_no_conversation(client):
    _require_data(client)
    body = _ask(client, "Tell me about Musanze")
    assert body["conversation_id"] is None


def test_multi_turn_conversation_inherits_context(client):
    _require_data(client)
    created = client.post("/api/v1/assistant/conversations").json()
    conversation_id = created["conversation_id"]
    assert conversation_id

    first = _ask(
        client, "Tell me about maize in Gisagara in 2026B", conversation_id=conversation_id
    )
    assert first["conversation_id"] == conversation_id
    assert first["resolved_context"]["crops"] == ["Maize"]
    assert first["resolved_context"]["districts"] == ["Gisagara"]

    follow_up = _ask(client, "What about beans?", conversation_id=conversation_id)
    # Inherits the district from the previous turn, replaces the crop.
    assert follow_up["evidence"]["crop"] == "Beans"
    assert follow_up["evidence"]["district"] == "Gisagara"

    state = client.get(f"/api/v1/assistant/conversations/{conversation_id}").json()
    assert state["context"]["crops"] == ["Beans"]
    assert state["turns"] >= 2
    assert state["transcript"]

    deleted = client.delete(f"/api/v1/assistant/conversations/{conversation_id}").json()
    assert deleted["deleted"] is True
    assert client.get(f"/api/v1/assistant/conversations/{conversation_id}").json()["turns"] == 0
