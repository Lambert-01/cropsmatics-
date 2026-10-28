"""The AI engine.

The engine's value is not that it can call a model - it is that a model cannot
make it state something the data do not support. These tests pin that, and they
also pin the *other* direction, which is easy to forget: the guards must not
reject figures that **are** grounded. A guard that fails legitimate answers would
quietly disable the LLM layer while looking like it was working.
"""

from __future__ import annotations

import pytest

from app.ai import evidence_builder, grounded, intent_router, numeric_guard, tool_registry
from app.ai.evidence import EvidenceBundle, EvidenceItem, EvidenceKind
from app.ai.providers import DeterministicProvider, get_provider
from app.ai.providers.remote import RemoteConfig, RemoteProvider
from app.ai.schemas import AIRequest

QUERY = "/api/v1/assistant/query"


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not res.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _ask(client, question: str, **context) -> dict:
    res = client.post(QUERY, json={"question": question, "context": context or None})
    assert res.status_code == 200, res.text
    return res.json()


# --- the wire contract is extended, not broken ---------------------------------


def test_existing_fields_are_unchanged_and_new_ones_are_added(client):
    _require_data(client)
    body = _ask(client, "Why is maize yield low in Gisagara?")

    # Old contract, still present and still meaningful.
    for field in (
        "answer",
        "grounded",
        "intent",
        "evidence",
        "key_figures",
        "language",
        "translation_status",
        "source",
        "period",
        "coverage",
        "limitations",
    ):
        assert field in body, field

    # Additive engine metadata.
    assert body["trace_id"]
    assert body["answer_mode"] == "deterministic"
    assert body["evidence_count"] > 0
    assert body["tools_used"]


def test_tools_used_names_real_registered_tools(client):
    _require_data(client)
    body = _ask(client, "How is maize used after harvest?")
    assert body["tools_used"]
    for name in body["tools_used"]:
        assert name in tool_registry.TOOL_REGISTRY, name


# --- the guard must not reject grounded figures -------------------------------


def test_the_numeric_guard_accepts_every_grounded_answer(client):
    """A guard that fails valid answers would silently disable the engine."""
    _require_data(client)
    for question in (
        "Why is maize yield low in Gisagara?",
        "Tell me about Musanze",
        "How many farmers use irrigation?",
        "How much rice is produced in Rwanda?",
    ):
        body = _ask(client, question)
        assert body["grounded"] is True, question
        numeric = body["validation"]["numeric"]
        assert numeric["ok"] is True, (question, numeric)
        assert numeric["violations"] == []


def test_a_question_the_data_cannot_ground_is_refused_by_the_engine(client):
    """"Explain this yield pattern" names no crop or district, and a cross-crop
    national yield does not exist - so the engine refuses it rather than
    averaging biologically different crops into a number nobody asked for."""
    _require_data(client)
    body = _ask(client, "Explain this yield pattern")
    assert body["grounded"] is False
    assert body["evidence_count"] == 0
    assert body["validation"]["used_fallback"] is True
    # Even on the refusal path the validation block has one consistent shape.
    assert body["validation"]["numeric"]["ok"] is True


def test_greeting_is_conversational_without_data_claims(client):
    body = _ask(client, "helloo")
    assert body["grounded"] is True
    assert body["intent"] == "greeting"
    assert body["answer_mode"] == "conversational"
    assert body["evidence_count"] == 0
    assert "Cropmatics Assistant" in body["answer"]


def test_the_guard_still_inspects_answers_that_contain_figures(client):
    _require_data(client)
    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert body["validation"]["numeric"]["numbers_checked"] > 0
    assert body["citations"]


# --- the guard rejects unattributable figures ---------------------------------


def _bundle(**items) -> EvidenceBundle:
    return EvidenceBundle(
        query_id="t",
        intent="district_crop_gap",
        items=[
            EvidenceItem(
                evidence_id=f"e:{key}",
                kind=EvidenceKind.OFFICIAL,
                metric=key,
                value=value,
                unit="kg/ha",
                period_code="2026B",
            )
            for key, value in items.items()
        ],
    )


def test_guard_rejects_an_invented_number():
    bundle = _bundle(observed_yield_kg_ha=1159.0574, benchmark_yield_kg_ha=1500.0)
    result = numeric_guard.check(
        "Maize yield was 1,159 kg/ha against a benchmark of 4,321 kg/ha.", bundle
    )
    assert result.ok is False
    assert [v.number for v in result.violations] == ["4,321"]


def test_guard_accepts_correct_rounding_at_the_displayed_precision():
    bundle = _bundle(gap_index=26.1345, observed_yield_kg_ha=1159.0574)
    assert numeric_guard.check("a gap of 26.1%", bundle).ok is True
    assert numeric_guard.check("a gap of 26%", bundle).ok is True
    assert numeric_guard.check("yield of 1,159 kg/ha", bundle).ok is True
    # 1159.0574 genuinely rounds to 1159.06 at two decimals, so that is grounded...
    assert numeric_guard.check("yield of 1159.06 kg/ha", bundle).ok is True
    # ...while a value that is not a rounding of it is not.
    assert numeric_guard.check("yield of 1159.5 kg/ha", bundle).ok is False
    assert numeric_guard.check("yield of 1160 kg/ha", bundle).ok is False


def test_guard_reads_numbers_out_of_period_codes_and_sources():
    bundle = _bundle(observed_yield_kg_ha=100.0)
    # "2026" comes from the period code, so it is attributable.
    assert numeric_guard.check("In 2026 Season B the yield was 100 kg/ha", bundle).ok is True
    assert numeric_guard.check("In 2019 Season B the yield was 100 kg/ha", bundle).ok is False


def test_guard_rejects_everything_when_the_bundle_is_empty():
    empty = EvidenceBundle(query_id="t", intent="unsupported")
    assert numeric_guard.check("Yield rose to 1234 kg/ha", empty).ok is False


# --- the tool registry is an allow-list ---------------------------------------


def test_unknown_tool_is_refused():
    with pytest.raises(tool_registry.UnknownToolError):
        tool_registry.get("run_sql")
    with pytest.raises(tool_registry.UnknownToolError):
        tool_registry.call("eval", {"code": "1+1"})


def test_tool_schemas_reject_unsupported_parameters():
    """A model that invents a parameter gets an error, not a silent no-op."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        tool_registry.validate_params(
            "get_yield_gap", {"crop": "Maize", "inject_value": 999999}
        )
    with pytest.raises(ValidationError):
        tool_registry.validate_params("get_district_ranking", {"crop": "Maize", "limit": 100000})
    with pytest.raises(ValidationError):
        tool_registry.validate_params("get_crop_context", {})


def test_registry_exposes_no_execution_primitive():
    """The catalogue is a fixed set of analytical reads."""
    for name, spec in tool_registry.TOOL_REGISTRY.items():
        assert spec.network is False, name
        assert callable(spec.fn)
        for banned in ("eval", "exec", "sql", "shell", "subprocess", "open_file"):
            assert banned not in name


def test_every_planned_tool_is_registered_and_has_a_handler():
    from app.ai.handlers import HANDLERS

    for intent, tools in tool_registry.INTENT_TOOLS.items():
        for name in tools:
            assert name in tool_registry.TOOL_REGISTRY, (intent, name)
            assert name in HANDLERS, (intent, name)


# --- evidence is typed and attributable ---------------------------------------


def test_bundle_items_carry_their_provenance():
    routed = intent_router.route(
        AIRequest(question="Maize yield in Bugesera", context=None)
    )
    assert routed.intent == "district_crop_gap"

    bundle = evidence_builder.build(routed, query_id="t")
    assert bundle.grounded
    assert bundle.sources
    for item in bundle.items:
        assert item.evidence_id
        assert item.kind in EvidenceKind
        # Every derived value states how it was computed.
        if item.kind is EvidenceKind.DERIVED:
            assert item.method, item.evidence_id


def test_an_unsupported_question_retrieves_nothing(client):
    body = _ask(client, "What is the market price of maize?")
    assert body["grounded"] is False
    # No tool ran: there is nothing to ground, so nothing was retrieved.
    assert body["tools_used"] == []
    assert body["evidence_count"] == 0
    assert body["answer"] == grounded.NOT_GROUNDED


# --- provider abstraction and zero-provider fallback --------------------------


def test_no_provider_configured_selects_the_deterministic_one(monkeypatch):
    for key in ("AI_ENABLED", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL"):
        monkeypatch.delenv(key, raising=False)
    assert get_provider().name == "deterministic"
    assert isinstance(get_provider(), DeterministicProvider)


def test_enabling_without_credentials_still_falls_back(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    # Half-configured is not configured: a missing key must not select a provider
    # that would then fail on every request.
    assert get_provider().name == "deterministic"


def test_a_fully_configured_provider_is_selected(monkeypatch):
    config = RemoteConfig(
        enabled=True,
        model="some-model",
        base_url="https://example.invalid/v1",
        api_key="secret",
    )
    provider = RemoteProvider(config)
    assert provider.available() is True
    assert get_provider(config).name == "remote"


def test_provider_status_never_leaks_the_credential(monkeypatch):
    """The status may report that a credential *exists*, never what it is."""
    import asyncio

    from app.ai.providers import provider_status

    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_MODEL", "some-model")
    monkeypatch.setenv("AI_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("AI_API_KEY", "super-secret-value")

    status = asyncio.run(provider_status())
    rendered = str(status)

    assert "super-secret-value" not in rendered
    assert status["remote"]["credential_configured"] is True
    # With a full configuration the remote provider is selected, and the
    # deterministic fallback is still advertised as available.
    assert status["selected"] == "remote"
    assert status["fallback_available"] is True
    assert status["fallback_provider"] == "deterministic"


def test_public_assistant_status_is_safe_and_reachable(client, monkeypatch):
    monkeypatch.delenv("AI_ENABLED", raising=False)
    monkeypatch.delenv("AI_API_KEY", raising=False)
    response = client.get("/api/v1/assistant/status")
    assert response.status_code == 200
    body = response.json()
    assert body["fallback_available"] is True
    assert body["selected"] == "deterministic"
    assert "api_key" not in body["primary"]


def test_a_failing_provider_does_not_break_the_answer(client, monkeypatch):
    _require_data(client)

    class Exploding:
        name = "exploding"
        requires_network = True

        def available(self):
            return True

        async def generate(self, *args, **kwargs):
            raise RuntimeError("provider exploded")

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: Exploding())

    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert body["grounded"] is True
    assert body["validation"]["provider_failed"] is True
    assert body["answer_mode"] == "deterministic"
    assert "Gisagara" in body["answer"]


def test_a_provider_that_invents_a_number_is_rejected(client, monkeypatch):
    """The central guarantee: an unsupported figure never reaches a client."""
    _require_data(client)

    class Liar:
        name = "liar"
        requires_network = True

        def available(self):
            return True

        async def generate(self, request, routed, bundle, reference):
            from app.ai.schemas import ProviderOutcome

            return ProviderOutcome(
                answer="Maize yield in Gisagara was 999,999 kg/ha, far above every district.",
                grounded=True,
                intent="district_crop_gap",
                mode="llm",
            )

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: Liar())

    body = _ask(client, "Why is maize yield low in Gisagara?")
    assert "999,999" not in body["answer"]
    assert "999999" not in body["answer"]
    # It fell back to the deterministic answer rather than showing anything else.
    assert body["answer_mode"] == "deterministic"
    assert body["validation"]["used_fallback"] is True
    assert "figure" in body["validation"]["fallback_reason"]


def test_a_provider_that_returns_nothing_useful_is_rejected(client, monkeypatch):
    _require_data(client)

    class Empty:
        name = "empty"
        requires_network = True

        def available(self):
            return True

        async def generate(self, request, routed, bundle, reference):
            from app.ai.schemas import ProviderOutcome

            return ProviderOutcome(
                answer="I am not sure, but the yield is probably fine.",
                grounded=False,
                intent="unsupported",
                mode="llm",
            )

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: Empty())

    body = _ask(client, "Why is maize yield low in Gisagara?")
    # The grounded deterministic answer is returned, not the vague one.
    assert body["grounded"] is True
    assert "Gisagara" in body["answer"]
    assert body["answer_mode"] == "deterministic"


def test_validated_provider_answer_can_be_returned_in_requested_language(client, monkeypatch):
    _require_data(client)

    class LanguageProvider:
        name = "groq"
        requires_network = True

        def available(self):
            return True

        async def generate(self, request, routed, bundle, reference):
            from app.ai.schemas import ProviderOutcome

            return ProviderOutcome(
                # The numeric/claim guards still validate this text; the real
                # provider is instructed to produce this prose in Kinyarwanda.
                answer=reference.answer,
                grounded=True,
                intent=reference.intent,
                mode="llm",
                citations=[item.evidence_id for item in bundle.items],
            )

    import app.ai.orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "get_provider", lambda: LanguageProvider())
    response = client.post(
        QUERY,
        json={"question": "Tell me about Musanze", "language": "rw"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer_mode"] == "llm"
    assert body["translation_status"] == "PROVIDER_GENERATED"


# --- streaming -----------------------------------------------------------------


def test_stream_emits_the_documented_events_and_a_validated_answer(client):
    _require_data(client)
    res = client.post("/api/v1/assistant/stream", json={"question": "Tell me about Musanze"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")

    text = res.text
    assert "event: started" in text
    assert "event: tool_started" in text
    assert "event: evidence_ready" in text
    assert "event: token" in text
    assert "event: complete" in text
    # Execution states are user-safe descriptions, never chain-of-thought.
    lowered = text.lower()
    for banned in ("chain of thought", "reasoning:", "thinking:"):
        assert banned not in lowered


def test_stream_uses_the_engine_and_not_a_separate_path(client):
    _require_data(client)
    streamed = client.post(
        "/api/v1/assistant/stream", json={"question": "Tell me about Musanze"}
    ).text
    direct = _ask(client, "Tell me about Musanze")
    # The streamed answer is the same grounded answer /query returns.
    marker = direct["answer"][:60]
    assert marker in streamed
