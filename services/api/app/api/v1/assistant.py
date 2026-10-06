"""Grounded AI explanation endpoint.

This module is now an **adapter**. It owns the public wire contract and the
language rendering, and delegates everything else to ``app.ai``:

    services/api/app/ai/     routing, tools, evidence, providers, guards

The contract is unchanged. Every field that existed before still exists with the
same meaning and the same values, so existing web and mobile clients keep working.
New fields (``trace_id``, ``answer_mode``, ``citations``, ``evidence_count``,
``tools_used``, ``validation``) are additive, and a client that does not know them
can ignore them.

The engine guarantees that no number in an answer is produced by a model: the
deterministic grounded explanation is computed first and returned whenever a
provider is unavailable or produces an unsupported figure.
"""

from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai import numeric_guard
from app.ai.conversation import STORE
from app.ai.intent_router import INTENTS
from app.ai.orchestrator import answer as engine_answer
from app.ai.orchestrator import stream_answer as engine_stream
from app.ai.schemas import AIContext, AIRequest
from app.services import assistant_language, mobile_service

router = APIRouter(prefix="/assistant", tags=["assistant"])

NOT_GROUNDED = "Cropmatics does not currently have verified data to answer this question."


class QueryContext(BaseModel):
    """Structured evidence supplied by the calling page.

    A contextual action such as "Explain this yield pattern" must ground its
    answer in the selection the page is actually showing, not in whichever
    release happens to be the default. The context therefore only *names*
    entities (period, crop, district, metric); it can never carry a value, so it
    cannot be used to inject a figure into an answer.
    """

    page: str | None = Field(None, description="originating screen, e.g. yield-intelligence")
    metric: str | None = None
    period_code: str | None = Field(None, description="published period, e.g. 2026B")
    crop: str | None = None
    district: str | None = None
    province: str | None = None
    benchmark_strategy: str | None = None


class QueryIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    language: str = "en"
    context: QueryContext | None = None
    #: Optional. When present the turn joins a multi-turn conversation: it may
    #: inherit the previous turn's entities and it updates the conversation state.
    conversation_id: str | None = Field(None, max_length=64)
    #: Optional overrides. When ``None`` the planner infers them from the question.
    depth: str | None = Field(None, pattern="^(quick|standard|deep)$")
    audience: str | None = Field(None, pattern="^(farmer|planner|analyst)$")


class QueryOut(BaseModel):
    answer: str
    grounded: bool
    intent: str = "unsupported"
    evidence: dict = Field(default_factory=dict)
    # Normalized figures for the answer, so the mobile client can render "key
    # figures" without parsing prose. Identical across languages.
    key_figures: list[dict] = Field(default_factory=list)
    # --- language metadata --------------------------------------------------
    language: str = "en"
    # None on English; otherwise how the Kinyarwanda text was produced.
    translation_status: str | None = None
    # --- grounding metadata (always present on a grounded answer) -----------
    source: str | None = None
    period: str | None = None
    coverage: str | None = None
    limitations: list[str] = Field(default_factory=list)

    # --- engine metadata (additive; safe for older clients to ignore) -------
    trace_id: str | None = Field(None, description="correlation id for this answer")
    #: "deterministic" when the published-evidence answer was returned,
    #: "llm" when a configured provider's validated text was used instead.
    answer_mode: str = "deterministic"
    #: Evidence ids the answer is grounded in. Every one names a retrieved value.
    citations: list[str] = Field(default_factory=list)
    evidence_count: int = 0
    tools_used: list[str] = Field(default_factory=list)
    validation: dict = Field(default_factory=dict)
    #: The conversation this turn belongs to, when one was used.
    conversation_id: str | None = None
    #: The entities a follow-up would inherit (safe projection; no values).
    resolved_context: dict = Field(default_factory=dict)
    #: The structured response contract. Clients render this rather than parsing
    #: ``answer``; ``answer`` remains the plain-text fallback.
    structured: dict = Field(default_factory=dict)


def _to_context(context: QueryContext | None) -> AIContext | None:
    if context is None:
        return None
    return AIContext(
        page=context.page,
        metric=context.metric,
        period_code=context.period_code,
        crop=context.crop,
        district=context.district,
        province=context.province,
        benchmark_strategy=context.benchmark_strategy,
    )


@router.get("/suggestions")
def suggestions(limit: int = 6) -> dict:
    """Questions guaranteed to be answerable from the published data."""
    return {
        "questions": mobile_service.suggested_questions(limit=limit),
        "intents": list(INTENTS),
        "note": "generated from real observations so every suggestion is groundable",
    }


@router.post("/query", response_model=QueryOut)
async def query(payload: QueryIn) -> QueryOut:
    """Answer a question strictly from validated Cropmatics data.

    Intent resolution, evidence retrieval and numeric computation happen once; the
    requested language only changes the rendered prose (never the evidence).
    """
    result = await engine_answer(
        AIRequest(
            question=payload.question,
            language=payload.language,
            context=_to_context(payload.context),
            conversation_id=payload.conversation_id,
            depth=payload.depth,
            audience=payload.audience,
        )
    )

    language = assistant_language.normalize_language(payload.language)
    rendered, translation_status = assistant_language.render(
        answer_en=result.answer,
        grounded=result.grounded,
        language=language,
    )

    # A translated rendering is checked too. Templates preserve numbers, but if a
    # template ever introduced one, the English grounded answer is returned rather
    # than a translation the evidence cannot support.
    if language != "en" and result.bundle is not None:
        if not numeric_guard.check(rendered, result.bundle).ok:
            rendered = result.answer
            translation_status = "TEMPORARY_ENGLISH_FALLBACK"

    return QueryOut(
        answer=rendered,
        grounded=result.grounded,
        intent=result.intent,
        evidence=result.evidence,
        key_figures=result.key_figures,
        language=language,
        translation_status=translation_status,
        source=result.source,
        period=result.period,
        coverage=result.coverage,
        limitations=result.limitations,
        trace_id=result.trace_id,
        answer_mode=result.answer_mode,
        citations=result.citations,
        evidence_count=result.evidence_count,
        tools_used=result.tools_used,
        validation=result.validation,
        conversation_id=result.conversation_id,
        resolved_context=result.resolved_context,
        structured=result.structured,
    )


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


class ConversationOut(BaseModel):
    conversation_id: str | None
    turns: int = 0
    context: dict = Field(default_factory=dict)
    transcript: list[dict] = Field(default_factory=list)


@router.post("/conversations", response_model=ConversationOut)
def create_conversation() -> ConversationOut:
    """Start a new conversation and return its id.

    A client may also simply generate its own id and pass it to ``/query``; this
    endpoint exists so a client that would rather not own id generation has one.
    """
    state = STORE.get_or_create(None)
    return ConversationOut(conversation_id=state.conversation_id)


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: str) -> ConversationOut:
    """Inspect a conversation's resolved context and recent turns."""
    state = STORE.get(conversation_id)
    if state is None:
        return ConversationOut(conversation_id=conversation_id, turns=0)
    return ConversationOut(
        conversation_id=state.conversation_id,
        turns=len(state.turns),
        context=state.context.fingerprint(),
        transcript=state.transcript(),
    )


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str) -> dict:
    """Forget a conversation. Idempotent."""
    return {"deleted": STORE.delete(conversation_id)}


@router.post("/stream")
async def stream(payload: QueryIn) -> StreamingResponse:
    """Server-sent events for the same answer.

    Optional: ``/query`` remains the contract. Progress events describe what the
    platform is doing in user-safe terms ("checking yield observations"), and the
    whole validated answer is emitted as a single token event so a rejected answer
    is never partially displayed. No internal reasoning is exposed.
    """

    async def generator():
        request = AIRequest(
            question=payload.question,
            language=payload.language,
            context=_to_context(payload.context),
            conversation_id=payload.conversation_id,
            depth=payload.depth,
            audience=payload.audience,
        )
        async for event, data in engine_stream(request):
            yield _sse(event, data)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
