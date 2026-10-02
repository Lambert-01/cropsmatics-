"""Internal request/result types for the AI layer.

These are deliberately **not** the public wire contract. ``assistant.py`` owns
``QueryIn``/``QueryOut`` and maps between them, which is what keeps the existing
``/api/v1/assistant/query`` schema byte-for-byte compatible while the engine
underneath it changes shape.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel, Field

from app.ai.evidence import EvidenceBundle


class AIContext(BaseModel):
    """Entities the calling page is showing. Names only - never a value.

    The absence of any numeric field is the safety property: a page cannot push
    a number into a grounded answer through its context.
    """

    page: str | None = None
    metric: str | None = None
    period_code: str | None = None
    crop: str | None = None
    district: str | None = None
    province: str | None = None
    benchmark_strategy: str | None = None


class AIRequest(BaseModel):
    question: str
    language: str = "en"
    context: AIContext | None = None


@dataclass(frozen=True)
class RoutedRequest:
    """A question resolved into the entities and tools it needs.

    Lives here rather than in ``intent_router`` so the router can depend on the
    tool registry without the registry having to depend back on the router.
    """

    question: str
    intent: str
    language: str = "en"
    district: str | None = None
    province: str | None = None
    crop: str | None = None
    metric: str | None = None
    benchmark_strategy: str | None = None
    requested_period: str | None = None
    indicator_ids: list[str] = field(default_factory=list)
    unsupported_topic: str | None = None
    page: str | None = None

    @property
    def requested(self) -> dict:
        return {
            "period_code": self.requested_period,
            "crop": self.crop,
            "district": self.district,
            "province": self.province,
            "metric": self.metric,
            "benchmark": self.benchmark_strategy,
        }


class ProviderOutcome(BaseModel):
    """What a provider produced, before validation."""

    answer: str
    grounded: bool
    intent: str
    mode: str
    citations: list[str] = Field(default_factory=list)


class AIResult(BaseModel):
    """A validated answer, ready to be mapped onto the wire contract."""

    answer: str
    grounded: bool
    intent: str
    #: The legacy shaped evidence dict, so existing clients are unaffected.
    evidence: dict = Field(default_factory=dict)
    key_figures: list[dict] = Field(default_factory=list)
    source: str | None = None
    period: str | None = None
    coverage: str | None = None
    limitations: list[str] = Field(default_factory=list)

    # --- additive engine metadata (safe for clients that ignore it) ----------
    trace_id: str
    #: ``deterministic`` today; ``llm`` once a provider is configured.
    answer_mode: str = "deterministic"
    citations: list[str] = Field(default_factory=list)
    evidence_count: int = 0
    tools_used: list[str] = Field(default_factory=list)
    validation: dict = Field(default_factory=dict)
    #: The retrieved evidence, kept server-side so a rendered translation can be
    #: re-checked against it before it is returned. Never serialised to a client.
    bundle: EvidenceBundle | None = Field(default=None, exclude=True)
