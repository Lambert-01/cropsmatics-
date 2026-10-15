"""The remote provider's configuration and wire formats.

Two things are pinned here, because both are easy to get silently wrong and
expensive to discover in production:

* **Alias precedence.** A deployment may carry either the platform's ``AI_*``
  names or OpenAI's own ``OPENAI_*`` names. When both are set the winner must be
  predictable, and an alias alone must still be enough. A wrong guess here means
  a credential that is present but never read.

* **Two wire formats.** The chat-completions path and the official Responses API
  path speak different protocols: different endpoints, different request fields,
  differently shaped replies. They are parsed separately rather than coerced into
  one another, so a field that exists in only one of them is never invented for
  the other.

No network is used: the HTTP call is stubbed at the ``httpx.AsyncClient``
boundary and only the parser is exercised. Real provider connectivity is a
separate, credentialed check and is not claimed by this file.
"""

from __future__ import annotations

import json

import pytest

from app.ai.providers.remote import (
    RemoteConfig,
    RemoteProvider,
    _to_responses_tool,
    load_config,
)

# --- configuration and aliases ----------------------------------------------


def test_ai_names_take_precedence_over_openai_aliases():
    config = load_config(
        {
            "AI_ENABLED": "true",
            "AI_MODEL": "ai-model",
            "AI_BASE_URL": "https://ai.example/v1/",
            "AI_API_KEY": "ai-key",
            "OPENAI_MODEL": "openai-model",
            "OPENAI_BASE_URL": "https://openai.example/v1",
            "OPENAI_API_KEY": "openai-key",
        }
    )
    assert config.model == "ai-model"
    assert config.api_key == "ai-key"
    # Trailing slash is stripped whichever name supplied it.
    assert config.base_url == "https://ai.example/v1"


def test_openai_aliases_alone_configure_the_provider():
    config = load_config(
        {
            "AI_ENABLED": "true",
            "OPENAI_MODEL": "gpt-4o-mini",
            "OPENAI_BASE_URL": "https://api.openai.com/v1/",
            "OPENAI_API_KEY": "sk-test",
        }
    )
    assert config.configured is True
    assert config.model == "gpt-4o-mini"
    assert config.api_key == "sk-test"
    assert config.base_url == "https://api.openai.com/v1"


def test_an_alias_fills_only_what_the_platform_names_leave_empty():
    config = load_config(
        {
            "AI_ENABLED": "true",
            "AI_MODEL": "ai-model",
            "OPENAI_MODEL": "openai-model",
            "OPENAI_API_KEY": "sk-test",
        }
    )
    assert config.model == "ai-model"
    assert config.api_key == "sk-test"


def test_a_credential_alone_never_enables_the_provider():
    # The alias is enough to *supply* a key; it is not enough to turn the
    # provider on. `enabled` still comes from AI_ENABLED alone.
    config = load_config({"OPENAI_API_KEY": "sk-test", "OPENAI_MODEL": "m"})
    assert config.enabled is False
    assert config.configured is False


def test_public_projection_never_carries_the_credential():
    config = RemoteConfig(
        enabled=True, model="m", base_url="https://x.example/v1", api_key="sk-secret"
    )
    projected = config.public()
    assert "sk-secret" not in json.dumps(projected)
    assert projected["credential_configured"] is True


# --- tool translation --------------------------------------------------------


def test_responses_tool_translation_moves_the_envelope_only():
    chat_tool = {
        "type": "function",
        "function": {
            "name": "get_crop_trend",
            "description": "One crop's published trend",
            "parameters": {
                "type": "object",
                "properties": {"crop": {"type": "string"}},
                "required": ["crop"],
            },
        },
    }
    translated = _to_responses_tool(chat_tool)
    assert translated["name"] == "get_crop_trend"
    assert translated["description"] == "One crop's published trend"
    # The JSON schema passes through untouched - the allowlist is not
    # reinterpreted in transit.
    assert translated["parameters"] == chat_tool["function"]["parameters"]
    assert "function" not in translated


def test_responses_tool_translation_drops_nothing_it_cannot_name():
    # A tool the registry never declares is passed through unchanged rather than
    # guessed into a shape; the executor still refuses an unregistered name.
    odd = {"type": "computer_use", "something": 1}
    assert _to_responses_tool(odd) == odd


# --- wire formats -------------------------------------------------------------


class _StubResponse:
    def __init__(self, body: dict):
        self._body = body

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._body


class _StubClient:
    """Records the request and returns a canned body."""

    def __init__(self, body: dict):
        self._body = body
        self.requests: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, *, json=None, headers=None):
        self.requests.append({"url": url, "json": json, "headers": headers})
        return _StubResponse(self._body)


def _configured(provider: str) -> RemoteConfig:
    return RemoteConfig(
        enabled=True,
        provider=provider,
        model="test-model",
        base_url="https://api.example/v1",
        api_key="sk-test",
    )


@pytest.mark.asyncio
async def test_chat_path_posts_to_chat_completions(monkeypatch):
    client = _StubClient({"choices": [{"message": {"content": "Answered."}}]})
    monkeypatch.setattr(_httpx(), "AsyncClient", lambda **kw: client)

    provider = RemoteProvider(_configured("openai_compatible"))
    reply = await provider.chat([{"role": "user", "content": "q"}])

    assert client.requests[0]["url"].endswith("/chat/completions")
    assert client.requests[0]["json"]["messages"]
    assert reply.content == "Answered."
    assert reply.tool_calls == []


@pytest.mark.asyncio
async def test_responses_path_posts_to_responses_and_parses_text(monkeypatch):
    client = _StubClient(
        {
            "output": [
                {"type": "reasoning", "summary": []},
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "Grounded answer."}],
                },
            ]
        }
    )
    monkeypatch.setattr(_httpx(), "AsyncClient", lambda **kw: client)

    provider = RemoteProvider(_configured("openai_responses"))
    reply = await provider.chat([{"role": "user", "content": "q"}])

    assert client.requests[0]["url"].endswith("/responses")
    # `input`, not `messages`: the Responses field name is used, not guessed into
    # the chat contract.
    assert client.requests[0]["json"]["input"]
    assert "messages" not in client.requests[0]["json"]
    assert reply.content == "Grounded answer."


@pytest.mark.asyncio
async def test_responses_path_parses_function_calls(monkeypatch):
    client = _StubClient(
        {
            "output": [
                {
                    "type": "function_call",
                    "name": "get_crop_trend",
                    "arguments": '{"crop": "Maize"}',
                    "call_id": "call_abc",
                }
            ]
        }
    )
    monkeypatch.setattr(_httpx(), "AsyncClient", lambda **kw: client)

    provider = RemoteProvider(_configured("openai_responses"))
    reply = await provider.chat(
        [{"role": "user", "content": "q"}],
        tools=[
            {
                "type": "function",
                "function": {"name": "get_crop_trend", "parameters": {"type": "object"}},
            }
        ],
    )

    assert reply.content is None
    assert len(reply.tool_calls) == 1
    call = reply.tool_calls[0]
    assert call.name == "get_crop_trend"
    assert call.id == "call_abc"
    assert json.loads(call.arguments) == {"crop": "Maize"}
    # The tool was translated into the Responses shape on the wire.
    sent = client.requests[0]["json"]["tools"][0]
    assert sent["name"] == "get_crop_trend"
    assert "function" not in sent


@pytest.mark.asyncio
async def test_responses_path_with_no_output_is_not_an_answer(monkeypatch):
    client = _StubClient({"output": []})
    monkeypatch.setattr(_httpx(), "AsyncClient", lambda **kw: client)

    provider = RemoteProvider(_configured("openai_responses"))
    reply = await provider.chat([{"role": "user", "content": "q"}])

    # No content and no calls: the caller treats this as unavailable rather than
    # rendering an empty string.
    assert reply.content is None
    assert reply.tool_calls == []


def _httpx():
    """The real ``httpx`` module, imported lazily so the stub can patch it.

    ``remote`` imports httpx inside the methods (not at module import), so
    patching the module object itself is what reaches the call site.
    """
    import httpx

    return httpx

@pytest.mark.asyncio
@pytest.mark.parametrize("budget", [1, 2])
async def test_responses_agent_replays_native_calls_reasoning_and_outputs(monkeypatch, budget):
    from app.ai import agent
    from app.ai.evidence import EvidenceBundle
    from app.ai.grounded import GroundedAnswer
    from app.ai.schemas import AIRequest, RoutedRequest

    native = [
        {"type": "reasoning", "id": "rs_1", "summary": [], "encrypted_content": "opaque"},
        {"type": "function_call", "name": "get_forecast_status", "arguments": "{}",
         "call_id": "call_status", "id": "fc_1"},
        {"type": "function_call", "name": "unknown_tool", "arguments": "{}",
         "call_id": "call_unknown", "id": "fc_2"},
    ]

    class SequenceClient(_StubClient):
        async def post(self, url, *, json=None, headers=None):
            self.requests.append({"url": url, "json": json})
            return _StubResponse({"output": native} if len(self.requests) == 1 else {
                "output": [{"type": "message", "role": "assistant",
                            "content": [{"type": "output_text", "text": "No published forecast."}]}],
            })

    client = SequenceClient({})
    monkeypatch.setattr(_httpx(), "AsyncClient", lambda **kw: client)
    provider = RemoteProvider(_configured("openai_responses"))
    outcome = await agent.run(
        provider, AIRequest(question="Is there a published forecast?", language="en"),
        RoutedRequest(question="Is there a published forecast?", intent="forecast_status"),
        EvidenceBundle(query_id="test", intent="forecast_status"),
        GroundedAnswer(answer="No published forecast.", grounded=True, intent="forecast_status", evidence={}),
        max_tool_calls=budget,
    )
    assert outcome.answer == "No published forecast."
    assert len(client.requests) == 2
    request = client.requests[1]
    assert request["url"] == "https://api.example/v1/responses"
    assert "temperature" not in request["json"]
    assert request["json"]["store"] is False
    assert request["json"]["include"] == ["reasoning.encrypted_content"]
    items = request["json"]["input"]
    assert all(item in items for item in native)
    assert not any(item.get("role") == "tool" or "tool_calls" in item for item in items)
    outputs = [item for item in items if item.get("type") == "function_call_output"]
    assert [item["call_id"] for item in outputs] == ["call_status", "call_unknown"]
    assert "error" in json.loads(outputs[1]["output"])

    # Reusing a provider for another request cannot leak the first request's history.
    await provider.chat([{"role": "user", "content": "New question"}])
    assert client.requests[-1]["json"]["input"] == [{"role": "user", "content": "New question"}]


@pytest.mark.asyncio
async def test_official_responses_url_uses_documented_v1_base(monkeypatch):
    client = _StubClient({"output": []})
    monkeypatch.setattr(_httpx(), "AsyncClient", lambda **kw: client)
    provider = RemoteProvider(load_config({
        "AI_ENABLED": "true", "AI_PROVIDER": "openai_responses",
        "AI_MODEL": "configured-model", "AI_API_KEY": "test", "AI_BASE_URL": "https://api.openai.com/v1",
    }))
    await provider.chat([{"role": "user", "content": "q"}])
    assert client.requests[0]["url"] == "https://api.openai.com/v1/responses"

