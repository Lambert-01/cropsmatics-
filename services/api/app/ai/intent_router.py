"""Intent routing: decide *what is being asked* before anything is retrieved.

Routing is separate from answering on purpose. It is the one place that decides
whether the published data can address a question at all, so the refusal path is
auditable by reading a single function rather than tracing a builder.

The router also owns the safety property that page context may only *narrow*
grounding: an entity the user states explicitly always wins over the context.
"""

from __future__ import annotations

from app.ai.entity_resolver import (
    UNSUPPORTED_HINTS,
    extract,
    matched_indicators,
    mentions,
)
from app.ai.schemas import AIRequest, RoutedRequest
from app.services import period_service

# Intents the router can return. Kept explicit so a client can branch on it, and
# so an intent can never be returned without being advertised on
# /assistant/suggestions (guarded by test_assistant_grounding).
INTENTS: tuple[str, ...] = (
    "district_crop_gap",
    "crop_national_context",
    "district_context",
    "national_indicator",
    "unsupported",
)

def route(request: AIRequest) -> RoutedRequest:
    """Resolve a question into an intent plus the entities it names.

    Topics the published statistics cannot support are refused *before* any
    entity lookup, so a question about prices or weather is never answered with
    an unrelated production figure.
    """
    question = request.question
    lowered = question.lower()
    context = request.context

    unsupported_topic = mentions(lowered, UNSUPPORTED_HINTS)
    if unsupported_topic:
        return RoutedRequest(
            question=question,
            intent="unsupported",
            language=request.language,
            unsupported_topic=unsupported_topic,
            page=context.page if context else None,
        )

    district, crop = extract(question)

    # A page may send its own selection as structured context. It names entities
    # only (never a value), and an entity the question states explicitly still
    # wins, so the context narrows grounding without overriding the user.
    requested_period: str | None = None
    if context is not None:
        if context.period_code:
            try:
                requested_period = period_service.require(context.period_code)
            except period_service.UnknownPeriodError:
                # An unpublished period is dropped, not rejected: the question
                # itself is still answerable.
                requested_period = None
        district = district or context.district
        crop = crop or context.crop

    base = {
        "question": question,
        "language": request.language,
        "district": district,
        "crop": crop,
        "province": context.province if context else None,
        "metric": context.metric if context else None,
        "benchmark_strategy": context.benchmark_strategy if context else None,
        "requested_period": requested_period,
        "page": context.page if context else None,
    }

    if district is not None and crop is not None:
        return RoutedRequest(intent="district_crop_gap", **base)
    if crop is not None:
        return RoutedRequest(intent="crop_national_context", **base)
    if district is not None:
        return RoutedRequest(intent="district_context", **base)

    indicator_ids = matched_indicators(lowered)
    if indicator_ids:
        return RoutedRequest(intent="national_indicator", indicator_ids=indicator_ids, **base)

    return RoutedRequest(intent="unsupported", **base)
