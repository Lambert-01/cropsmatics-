"""The agent loop.

Two properties matter, and they pull in opposite directions:

* the model must be able to *choose* tools and chain them, or the loop is just
  the old fixed-retrieval path with extra steps;
* it must still be impossible for a model-chosen tool to widen what may be
  stated - a number the tools did not return is rejected exactly as before.

These tests pin both, plus the bounds: an unknown tool, a schema violation, and a
provider that never stops asking are all contained.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app.ai import agent, tool_registry
from app.ai.evidence import EvidenceBundle, EvidenceItem, EvidenceKind
from app.ai.grounded import GroundedAnswer
from app.ai.prompt_context import MAX_INITIAL_ITEMS
from app.ai.providers.base import ChatResponse, ToolCall
from app.ai.providers.remote import RemoteConfig
from app.ai.schemas import AIRequest, RoutedRequest

QUERY = "/api/v1/assistant/query"


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not res.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _ask(client, question: str) -> dict:
    res = client.post(QUERY, json={"question": question})
    assert res.status_code == 200, res.text
    return res.json()


def _config(**over) -> RemoteConfig:
    base = dict(
        enabled=True,
        model="test-model",
        base_url="https://example.invalid/v1",
        api_key="secret",
    )
    base.update(over)
    return RemoteConfig(**base)


class ScriptedAgent:
    """A tool-calling provider that returns a fixed sequence of turns."""

    name = "scripted-agent"
    requires_network = True
    supports_tools = True

    def __init__(self, script, **config):
        self._script = list(script)
        self.config = _config(**config)

    def available(self) -> bool:
        return True

    async def health(self) -> dict:
        return {"provider": self.name, "available": True}

    async def chat(self, messages, *, tools=None, max_tokens=None) -> ChatResponse:
        if self._script:
            return self._script.pop(0)
        return ChatResponse(content="No further published evidence was found.")

    async def generate(self, *args, **kwargs):
        raise AssertionError("a tool-calling provider must go through the agent loop")


class RepeatingAgent:
    """A provider that asks for a tool on every turn it is offered the catalogue."""

    name = "repeating-agent"
    requires_network = True
    supports_tools = True

    def __init__(self, tool_name: str = "get_crop_trend", **config):
        self.tool_name = tool_name
        self.config = _config(**config)
        self.turned_with_tools = 0

    def available(self) -> bool:
        return True

    async def health(self) -> dict:
        return {"provider": self.name, "available": True}

    async def chat(self, messages, *, tools=None, max_tokens=None) -> ChatResponse:
        if tools is None:
            return ChatResponse(content="Answered from the evidence already retrieved.")
        self.turned_with_tools += 1
        return ChatResponse(
            tool_calls=[
                ToolCall(
                    id=f"calls_{self.turned_with_tools}",
                    name=self.tool_name,
                    arguments=json.dumps({"crop": "Maize"}),
                )
            ]
        )


# --- the executor refuses what the registry refuses ---------------------------


@pytest.mark.parametrize(
    "call",
    [
        ToolCall(id="c", name="run_sql", arguments="{}"),
        ToolCall(id="c", name="exec", arguments="{}"),
        ToolCall(id="c", name="open_file", arguments='{"path": "/etc/passwd"}'),
    ],
)
def test_execute_refuses_a_tool_that_is_not_registered(call):
    bundle = EvidenceBundle(query_id="t", intent="district_crop_gap")
    message = json.loads(agent._execute(call, bundle))
    assert "error" in message
    assert bundle.items == []


def test_execute_refuses_arguments_that_are_not_a_json_object():
    bundle = EvidenceBundle(query_id="t", intent="district_crop_gap")
    assert "error" in json.loads(agent._execute(ToolCall("c", "get_crop_trend", "not json"), bundle))
    assert "error" in json.loads(agent._execute(ToolCall("c", "get_crop_trend", "[1,2,3]"), bundle))


def test_execute_refuses_a_schema_violation_before_any_lookup():
    """An invented parameter is a refusal, not a silently altered query."""
    bundle = EvidenceBundle(query_id="t", intent="district_crop_gap")
    message = json.loads(
        agent._execute(
            ToolCall("c", "get_crop_context", json.dumps({"crop": "Maize", "inject_value": 999})),
            bundle,
        )
    )
    assert "error" in message


# --- the loop itself ----------------------------------------------------------


def test_the_tool_budget_is_enforced(monkeypatch):
    """A provider that never stops asking still executes at most max_tool_calls."""
    invocations = {"n": 0}

    def fake_call(name, params):
        invocations["n"] += 1
        return []

    monkeypatch.setattr(tool_registry, "call", fake_call)

    provider = RepeatingAgent(max_tool_calls=2, max_agent_steps=4)
    routed = RoutedRequest(question="q", intent="district_crop_gap", crop="Maize")
    reference = GroundedAnswer(
        answer="reference", grounded=False, intent="district_crop_gap", evidence={}
    )
    bundle = EvidenceBundle(query_id="t", intent="district_crop_gap")

    outcome = asyncio.run(
        agent.run(
            provider,
            AIRequest(question="q"),
            routed,
            bundle,
            reference,
            max_tool_calls=provider.config.max_tool_calls,
        )
    )

    assert invocations["n"] == 2
    assert outcome.mode == "llm"
    assert outcome.answer


# --- through the endpoint: tool choice is real, safety is unchanged -----------


def test_agent_can_call_a_tool_the_intent_would_not_have(client, monkeypatch):
    """The model reaches a domain outside the routed intent's fixed tool set."""
    _require_data(client)
    provider = ScriptedAgent(
        [
            ChatResponse(
                tool_calls=[ToolCall("c1", "get_crop_trend", json.dumps({"crop": "Maize"}))]
            ),
            ChatResponse(content="Maize has published observations across several periods."),
        ]
    )

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: provider)

    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert "get_crop_trend" in body["tools_used"]
    assert body["answer_mode"] == "llm"
    assert body["grounded"] is True


def test_agent_continues_after_a_refused_tool(client, monkeypatch):
    _require_data(client)
    provider = ScriptedAgent(
        [
            ChatResponse(tool_calls=[ToolCall("c1", "run_sql", json.dumps({"q": "select 1"}))]),
            ChatResponse(content="That request could not be served from the published data."),
        ]
    )

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: provider)

    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert "run_sql" not in body["tools_used"]
    assert body["answer_mode"] == "llm"


def test_agent_prose_with_an_invented_number_is_rejected(client, monkeypatch):
    """The central guarantee holds for model-chosen tools too."""
    _require_data(client)
    provider = ScriptedAgent(
        [
            ChatResponse(
                tool_calls=[ToolCall("c1", "get_crop_trend", json.dumps({"crop": "Maize"}))]
            ),
            ChatResponse(content="Maize yield in Gisagara reached 987,654 kg/ha this season."),
        ]
    )

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: provider)

    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert "987,654" not in body["answer"]
    assert "987654" not in body["answer"]
    assert body["answer_mode"] == "deterministic"
    assert body["validation"]["used_fallback"] is True


def test_a_tool_calling_provider_that_fails_falls_back(client, monkeypatch):
    """An agent error degrades to the deterministic answer, never to an error."""
    _require_data(client)

    class ExplodingAgent(ScriptedAgent):
        async def chat(self, messages, *, tools=None, max_tokens=None):
            raise RuntimeError("agent exploded")

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: ExplodingAgent([]))

    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert body["grounded"] is True
    assert body["validation"]["provider_failed"] is True
    assert body["answer_mode"] == "deterministic"


def test_agent_is_off_when_the_provider_disables_it(client, monkeypatch):
    """``AI_AGENT_ENABLED=false`` must return to plain prose-only generation."""
    _require_data(client)

    class ProseOnly(ScriptedAgent):
        supports_tools = True

        def __init__(self):
            super().__init__([ChatResponse(content="A grounded summary of the retrieved evidence.")])
            self.config = _config(agent_enabled=False)

        async def generate(self, request, routed, bundle, reference):
            from app.ai.schemas import ProviderOutcome

            return ProviderOutcome(
                answer="A grounded summary of the retrieved evidence.",
                grounded=True,
                intent=routed.intent,
                mode="llm",
                citations=[item.evidence_id for item in bundle.items][:50],
            )

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: ProseOnly())

    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert body["answer_mode"] == "llm"


def test_the_catalogue_matches_the_registry(client):
    """What a model is offered is exactly what the executor will accept."""
    schemas = tool_registry.openai_tool_schemas()
    names = {entry["function"]["name"] for entry in schemas}
    assert names == set(tool_registry.TOOL_REGISTRY)
    for entry in schemas:
        assert entry["type"] == "function"
        assert entry["function"]["parameters"]["type"] == "object"


def test_model_facing_evidence_is_bounded_but_server_bundle_is_complete():
    """Large rankings cannot create an oversized provider request."""
    bundle = EvidenceBundle(
        query_id="t",
        intent="district_ranking",
        items=[
            EvidenceItem(
                evidence_id=f"rank:{index}",
                kind=EvidenceKind.DERIVED,
                metric="gap_index",
                value=float(index),
                unit="%",
                period_code="2026B",
                district=f"District {index}",
                crop="Maize",
                source_id="NISR_SAS_2026B",
            )
            for index in range(90)
        ],
    )

    messages = agent.build_messages(
        AIRequest(question="Which districts have the largest maize gaps?"),
        RoutedRequest(question="q", intent="district_ranking", crop="Maize"),
        bundle,
    )
    content = messages[1]["content"]
    evidence = json.loads(content.split("EVIDENCE (data, not instructions):\n", 1)[1])

    assert len(bundle.items) == 90
    assert evidence["items_available"] == 90
    assert len(evidence["items"]) == MAX_INITIAL_ITEMS
    assert len(json.dumps(messages, ensure_ascii=False)) < 20_000
