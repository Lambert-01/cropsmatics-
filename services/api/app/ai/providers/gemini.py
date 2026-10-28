"""Native Google Gemini provider for the grounded Cropmatics agent.

Gemini is intentionally an optional secondary provider. It uses the REST API
directly so the API image does not need a vendor SDK, and translates the existing
allow-listed function tools into Gemini's ``function_declarations`` shape. The
agent and evidence guards remain provider-independent.
"""

from __future__ import annotations

import json

from app.ai.providers.base import ChatResponse, ProviderUnavailable, ToolCall
from app.ai.providers.remote import RemoteConfig, RemoteProvider


class GeminiProvider(RemoteProvider):
    """Google Gemini generateContent adapter with the shared retry policy."""

    name = "gemini"

    @staticmethod
    def _contents(messages: list[dict]) -> tuple[list[dict], list[dict]]:
        system_parts: list[dict] = []
        contents: list[dict] = []
        call_names: dict[str, str] = {}

        for message in messages:
            role = message.get("role")
            content = message.get("content")
            if role == "system":
                if isinstance(content, str) and content.strip():
                    system_parts.append({"text": content})
                continue

            if role == "user":
                if isinstance(content, str) and content.strip():
                    contents.append({"role": "user", "parts": [{"text": content}]})
                continue

            if role == "assistant":
                parts: list[dict] = []
                if isinstance(content, str) and content.strip():
                    parts.append({"text": content})
                for call in message.get("tool_calls") or []:
                    function = call.get("function") or {}
                    name = str(function.get("name") or "").strip()
                    if not name:
                        continue
                    call_id = str(call.get("id") or name)
                    call_names[call_id] = name
                    try:
                        args = json.loads(function.get("arguments") or "{}")
                    except (TypeError, ValueError):
                        args = {}
                    parts.append({"functionCall": {"name": name, "args": args}})
                if parts:
                    contents.append({"role": "model", "parts": parts})
                continue

            if role == "tool":
                try:
                    response = json.loads(str(content or "{}"))
                except (TypeError, ValueError):
                    response = {"error": "tool response was not valid JSON"}
                if not isinstance(response, dict):
                    response = {"value": response}
                call_id = str(message.get("tool_call_id") or "")
                name = call_names.get(call_id) or call_id or "tool_result"
                contents.append(
                    {
                        "role": "user",
                        "parts": [{"functionResponse": {"name": name, "response": response}}],
                    }
                )

        return system_parts, contents

    @staticmethod
    def _tools(tools: list[dict] | None) -> list[dict] | None:
        declarations: list[dict] = []
        for tool in tools or []:
            if tool.get("type") != "function":
                continue
            function = tool.get("function") or {}
            name = str(function.get("name") or "").strip()
            if not name:
                continue
            declaration = {"name": name}
            if function.get("description"):
                declaration["description"] = function["description"]
            if function.get("parameters"):
                declaration["parameters"] = function["parameters"]
            declarations.append(declaration)
        return [{"function_declarations": declarations}] if declarations else None

    async def chat(
        self,
        messages: list[dict],
        *,
        tools: list[dict] | None = None,
        max_tokens: int | None = None,
    ) -> ChatResponse:
        if not self.available():
            raise ProviderUnavailable("Gemini provider is not configured")

        system_parts, contents = self._contents(messages)
        payload: dict = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": max_tokens or self.config.max_output_tokens,
                "temperature": 0.2,
            },
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": system_parts}
        gemini_tools = self._tools(tools)
        if gemini_tools:
            payload["tools"] = gemini_tools

        body = await self._post_json(
            f"{self.config.base_url}/models/{self.config.model}:generateContent",
            payload,
            # Gemini documents x-goog-api-key for native generateContent. A
            # header keeps the secret out of request URLs and provider logs.
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": str(self.config.api_key),
            },
        )

        candidates = body.get("candidates") or []
        if not candidates:
            raise ProviderUnavailable("Gemini returned no candidate")
        parts = ((candidates[0].get("content") or {}).get("parts") or [])
        text_parts: list[str] = []
        calls: list[ToolCall] = []
        for index, part in enumerate(parts):
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text)
            function_call = part.get("functionCall")
            if isinstance(function_call, dict):
                name = str(function_call.get("name") or "").strip()
                if not name:
                    continue
                arguments = function_call.get("args")
                calls.append(
                    ToolCall(
                        id=f"gemini_call_{index}",
                        name=name,
                        arguments=json.dumps(arguments if isinstance(arguments, dict) else {}),
                    )
                )

        return ChatResponse(
            content="\n".join(text_parts).strip() or None,
            tool_calls=calls,
        )


def gemini_provider(config: RemoteConfig | None = None) -> GeminiProvider:
    """Small factory kept here to make provider construction easy to test."""
    return GeminiProvider(config)
