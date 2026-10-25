"""The AI orchestrator.

One entry point, and a fixed order of operations that the safety properties
depend on:

1. **route** the question - and refuse what the data cannot address, before any
   retrieval happens;
2. compute the **deterministic grounded answer**, which is correct by
   construction and always available as the fallback;
3. **retrieve** typed evidence through the allow-listed tools;
4. ask the **provider** for prose;
5. **validate** it against the evidence, falling back if it fails.

Steps 2 and 3 both happen whichever provider is used. A provider therefore cannot
change what the platform knows - only how it is worded - and a provider that is
disabled, slow or wrong degrades to step 2 rather than to an error.

There is no path through this function in which a model-produced number reaches a
client unvalidated.
"""

from __future__ import annotations

import logging
import uuid

from app.ai import agent, evidence_builder, grounded, intent_router, output_validator, response
from app.ai.conversation import STORE, ConversationState
from app.ai.planner import QueryPlan
from app.ai.providers import fallback_provider, get_provider
from app.ai.schemas import AIRequest, AIResult, ProviderOutcome, RoutedRequest

logger = logging.getLogger(__name__)


def _agent_available(provider) -> bool:
    """Whether this provider may choose and chain tools for the request.

    The capability is opt-in on the provider (``supports_tools``) and can be
    switched off by configuration, so the agent is a deliberate choice rather
    than a side effect of configuring a provider at all.
    """
    if not getattr(provider, "supports_tools", False):
        return False
    config = getattr(provider, "config", None)
    return bool(getattr(config, "agent_enabled", True))


async def _ask_provider(provider, request, routed, bundle, reference) -> ProviderOutcome:
    """Run the agent loop when the provider can use tools, else plain generation.

    Both paths return prose that ``output_validator`` then checks against the
    *same* bundle, so whether the model wrote freely or selected its own tools,
    an unsupported figure is rejected identically.
    """
    # Greetings are conversational UX, not analytical requests. Keep them local
    # even when a remote provider is configured so an empty evidence bundle can
    # never invite the model to improvise facts.
    if routed.intent == "greeting":
        return await fallback_provider().generate(request, routed, bundle, reference)
    if _agent_available(provider):
        return await agent.run(
            provider,
            request,
            routed,
            bundle,
            reference,
            max_tool_calls=provider.config.max_tool_calls,
        )
    return await provider.generate(request, routed, bundle, reference)


def _resolved_context(routed: RoutedRequest) -> dict:
    """The entities a follow-up would inherit, safe to return to a client."""
    plan: QueryPlan | None = routed.plan
    return {
        "crops": list(routed.crops or ([routed.crop] if routed.crop else [])),
        "districts": list(routed.districts or ([routed.district] if routed.district else [])),
        "period_code": routed.requested_period,
        "metric": routed.metric,
        "language": routed.language,
        "depth": routed.depth,
        "audience": routed.audience,
        "last_intent": routed.intent,
        "operations": list(plan.operations) if plan else [],
    }


def _result(
    *,
    query_id: str,
    routed,
    reference: grounded.GroundedAnswer,
    validated: output_validator.ValidatedAnswer,
    bundle,
    provider_failed: bool,
    conversation_id: str | None = None,
) -> AIResult:
    structured = response.build(
        answer_id=query_id,
        conversation_id=conversation_id,
        routed=routed,
        reference=reference,
        bundle=bundle,
        validation=validated.validation,
    )
    return AIResult(
        answer=validated.answer,
        grounded=validated.grounded,
        intent=validated.intent or reference.intent,
        # The legacy evidence dict, unchanged, so existing clients are unaffected.
        evidence=reference.evidence,
        key_figures=grounded.key_figures(reference.intent, reference.evidence),
        source=reference.source,
        period=reference.period,
        coverage=reference.coverage,
        limitations=reference.limitations,
        trace_id=query_id,
        answer_mode=validated.mode,
        citations=validated.citations,
        evidence_count=len(bundle.items),
        tools_used=list(bundle.tools_used),
        conversation_id=conversation_id,
        resolved_context=_resolved_context(routed),
        structured=structured.model_dump(mode="json"),
        validation={
            **validated.validation,
            "provider_failed": provider_failed,
            "intent_routed": routed.intent,
            "evidence_items": len(bundle.items),
            "missing_data": bundle.missing_data,
        },
        bundle=bundle,
    )


def _conversation(request: AIRequest) -> ConversationState | None:
    """The conversation a request belongs to, or ``None`` for a stateless ask.

    A request without a ``conversation_id`` is stateless: it neither inherits nor
    writes state. This keeps the existing single-question clients working and,
    more importantly, stops the store from growing one entry per anonymous query.
    """
    if not request.conversation_id:
        return None
    return STORE.get_or_create(request.conversation_id)


def _record(
    state: ConversationState | None,
    *,
    request: AIRequest,
    routed: RoutedRequest,
    result: AIResult,
) -> None:
    """Fold a completed turn into the conversation, if there is one."""
    if state is None:
        return
    STORE.record_turn(
        state,
        question=request.question,
        intent=routed.intent,
        crops=list(routed.crops or ([routed.crop] if routed.crop else [])),
        districts=list(routed.districts or ([routed.district] if routed.district else [])),
        period_code=routed.requested_period,
        language=routed.language,
        depth=routed.depth,
        audience=routed.audience,
        answer=result.answer,
    )


async def answer(request: AIRequest) -> AIResult:
    """Answer a question, grounding every figure in retrieved evidence."""
    query_id = uuid.uuid4().hex[:16]

    conversation = _conversation(request)
    inherited = conversation.context if conversation else None
    routed = intent_router.route(request, inherited)

    # Always computed: it is the fallback, and it is the reference the validator
    # rejects a provider's answer back to.
    reference = grounded.answer(routed)

    bundle = evidence_builder.build(routed, query_id=query_id)
    bundle.limitations = list(reference.limitations)

    provider = get_provider()
    provider_failed = False
    try:
        outcome: ProviderOutcome = await _ask_provider(
            provider, request, routed, bundle, reference
        )
    except Exception:
        # A provider that is unreachable, slow, misconfigured or malformed must
        # never break the product. Degrade to the deterministic answer.
        logger.warning("provider %s failed; using fallback", provider.name, exc_info=True)
        provider_failed = True
        outcome = await fallback_provider().generate(request, routed, bundle, reference)

    validated = output_validator.validate(outcome, bundle, reference)
    if provider_failed:
        validated.validation["provider_failed"] = True

    result = _result(
        query_id=query_id,
        routed=routed,
        reference=reference,
        validated=validated,
        bundle=bundle,
        provider_failed=provider_failed,
        conversation_id=conversation.conversation_id if conversation else None,
    )
    _record(conversation, request=request, routed=routed, result=result)
    return result


async def stream_answer(request: AIRequest):
    """Yield ``(event, payload)`` pairs for the streaming endpoint.

    Execution states are user-safe descriptions of what is happening. No internal
    reasoning is exposed, because there is none to expose and because showing
    chain-of-thought is not the same as showing evidence.
    """
    query_id = uuid.uuid4().hex[:16]
    conversation = _conversation(request)
    inherited = conversation.context if conversation else None
    routed = intent_router.route(request, inherited)

    yield (
        "started",
        {
            "intent": routed.intent,
            "conversation_id": conversation.conversation_id if conversation else None,
        },
    )

    for tool in _planned_tools(routed.intent):
        yield ("tool_started", {"tool": tool})

    reference = grounded.answer(routed)
    bundle = evidence_builder.build(routed, query_id=uuid.uuid4().hex[:16])
    bundle.limitations = list(reference.limitations)

    for tool in bundle.tools_used:
        yield ("tool_finished", {"tool": tool})

    yield (
        "evidence_ready",
        {
            "evidence_count": len(bundle.items),
            "tools_used": list(bundle.tools_used),
            "sources": list(bundle.sources),
        },
    )

    provider = get_provider()
    provider_failed = False
    try:
        outcome = await _ask_provider(provider, request, routed, bundle, reference)
    except Exception:
        logger.warning("provider %s failed during stream; using fallback", provider.name)
        provider_failed = True
        outcome = await fallback_provider().generate(request, routed, bundle, reference)

    validated = output_validator.validate(outcome, bundle, reference)

    # Emitted whole so the guard has seen the entire text before any of it is
    # displayed; a rejected answer is therefore never partially shown.
    yield ("token", {"text": validated.answer})

    _record(
        conversation,
        request=request,
        routed=routed,
        result=AIResult(
            answer=validated.answer,
            grounded=validated.grounded,
            intent=validated.intent or routed.intent,
            trace_id="stream",
        ),
    )

    structured = response.build(
        answer_id=query_id,
        conversation_id=conversation.conversation_id if conversation else None,
        routed=routed,
        reference=reference,
        bundle=bundle,
        validation={**validated.validation, "provider_failed": provider_failed},
    )

    yield (
        "complete",
        {
            "grounded": validated.grounded,
            "answer_mode": validated.mode,
            "provider_failed": provider_failed,
            "evidence_count": len(bundle.items),
            "conversation_id": conversation.conversation_id if conversation else None,
            "resolved_context": _resolved_context(routed),
            "structured": structured.model_dump(mode="json"),
        },
    )


def _planned_tools(intent: str) -> list[str]:
    from app.ai import tool_registry

    return list(tool_registry.INTENT_TOOLS.get(intent, ()))
