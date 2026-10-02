"""Cropmatics AI engine.

A grounded explanation layer, not a source of agricultural facts. The pipeline is
fixed:

    question -> intent router -> allow-listed tools -> EvidenceBundle
             -> provider -> guards -> validated answer

Two properties are structural rather than aspirational:

* **the deterministic answer always exists.** It is computed before any provider
  is consulted and is returned whenever a provider is unavailable, fails, or
  produces something the guards reject. Cropmatics intelligence does not depend on
  LLM availability.
* **a provider cannot introduce a figure.** Every number in the returned text must
  match the evidence bundle, so a model can reword, compare and explain, but it
  cannot add, change or invent an observation.
"""

from app.ai.evidence import EvidenceBundle, EvidenceItem, EvidenceKind
from app.ai.intent_router import INTENTS, route
from app.ai.orchestrator import answer, stream_answer
from app.ai.schemas import AIContext, AIRequest, AIResult

__all__ = [
    "AIContext",
    "AIRequest",
    "AIResult",
    "EvidenceBundle",
    "EvidenceItem",
    "EvidenceKind",
    "INTENTS",
    "answer",
    "route",
    "stream_answer",
]
