"""The provider contract.

A provider turns an evidence bundle into prose. It cannot change the evidence: the
orchestrator computes the bundle first, and the numeric guard rejects any answer
whose figures are not in it. That ordering is what makes an LLM safe to add here -
it is a writing layer over facts it did not produce.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from app.ai.evidence import EvidenceBundle
from app.ai.grounded import GroundedAnswer
from app.ai.schemas import AIRequest, ProviderOutcome, RoutedRequest


class ProviderUnavailable(RuntimeError):
    """Raised when a provider is selected but not configured or reachable."""


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
