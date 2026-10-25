"""The zero-provider fallback.

This provider is what answers every question today. It needs no key, no network
and no model, which is the point: **Cropmatics intelligence does not depend on LLM
availability**. If the AI layer is switched off, unconfigured, or the remote
provider times out or returns nonsense, the platform still answers - with exactly
the same evidence and the same figures.

It rewrites nothing. The deterministic grounded builders produced the text, so
there is no opportunity for a number to appear that the evidence does not carry.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.ai.evidence import EvidenceBundle
from app.ai.grounded import GroundedAnswer
from app.ai.schemas import AIRequest, ProviderOutcome, RoutedRequest


class DeterministicProvider:
    """Renders the published-evidence answer. Always available."""

    name = "deterministic"
    requires_network = False

    def available(self) -> bool:
        return True

    async def health(self) -> dict:
        return {
            "provider": self.name,
            "available": True,
            "requires_network": False,
            "requires_credential": False,
        }

    async def generate(
        self,
        request: AIRequest,
        routed: RoutedRequest,
        bundle: EvidenceBundle,
        reference: GroundedAnswer,
    ) -> ProviderOutcome:
        citations = [item.evidence_id for item in bundle.items]
        return ProviderOutcome(
            answer=reference.answer,
            grounded=reference.grounded,
            intent=reference.intent,
            mode=reference.answer_mode,
            # The deterministic answer is composed from the evidence, so every
            # item it used is a citation. Bounded so a large bundle cannot bloat
            # the response.
            citations=citations[:50],
        )

    async def stream(
        self,
        request: AIRequest,
        routed: RoutedRequest,
        bundle: EvidenceBundle,
        reference: GroundedAnswer,
    ) -> AsyncIterator[str]:
        """Stream the answer in sentence-sized chunks.

        Streaming is not faked as a token stream: the deterministic answer is
        already complete, so it is emitted as meaningful units rather than
        character-by-character theatre that would misrepresent how it was made.
        """
        outcome = await self.generate(request, routed, bundle, reference)
        import re

        parts = re.split(r"(?<=[.!?])\s+", outcome.answer.strip())
        for part in parts:
            if part:
                yield part + " "
