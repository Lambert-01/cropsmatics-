"""The provider contract.

A provider turns an evidence bundle into prose. It cannot change the evidence: the
orchestrator computes the bundle first, and the numeric guard rejects any answer
whose figures are not in it. That ordering is what makes an LLM safe to add here -
it is a writing layer over facts it did not produce.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from app.ai.evidence import EvidenceBundle
from app.ai.grounded import GroundedAnswer
from app.ai.schemas import AIRequest, ProviderOutcome, RoutedRequest


class ProviderUnavailable(RuntimeError):
    """Raised when a provider is selected but not configured or reachable."""


@dataclass(frozen=True)
class ToolCall:
    """One function call a model asked for.

    ``arguments`` is kept as the raw JSON string the model produced. It is parsed
    and validated by the executor, never trusted here - a call is a request, not
    an action.
    """

    id: str
    name: str
    arguments: str


@dataclass
class ChatResponse:
    """One chat-completions turn: prose, tool calls, or both."""

    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


@runtime_checkable
class ToolCallingProvider(Protocol):
    """A provider that can choose tools, not only write prose.

    Optional capability. The orchestrator uses it when present and falls back to
    ``generate`` when it is not, so a prose-only provider is never broken by it.
    """

    supports_tools: bool

    async def chat(
        self,
        messages: list[dict],
        *,
        tools: list[dict] | None = None,
        max_tokens: int | None = None,
    ) -> ChatResponse:
        """Return the assistant turn; executing any requested tool is the caller's job.

        ``max_tokens`` lets the caller scale the output budget for a deeper answer
        without the provider having to know about depth itself.
        """
        ...


@runtime_checkable
class LLMProvider(Protocol):
    """Every provider implements this, including the deterministic one."""

    name: str
    #: Whether the provider needs network access and a credential.
    requires_network: bool

    def available(self) -> bool:
        """Whether this provider can currently serve a request."""
        ...

    async def health(self) -> dict:
        """Public-safe status. Must never include a credential or a raw error body."""
        ...

    async def generate(
        self,
        request: AIRequest,
        routed: RoutedRequest,
        bundle: EvidenceBundle,
        reference: GroundedAnswer,
    ) -> ProviderOutcome:
        """Produce prose for this question, grounded in ``bundle``.

        ``reference`` is the deterministic answer. A provider may rewrite it, or
        ignore it and write from the bundle; either way the returned text is
        validated against the bundle before it reaches a client.
        """
        ...

    def stream(
        self,
        request: AIRequest,
        routed: RoutedRequest,
        bundle: EvidenceBundle,
        reference: GroundedAnswer,
    ) -> AsyncIterator[str]:
        """Yield the answer incrementally for the streaming endpoint."""
        ...
