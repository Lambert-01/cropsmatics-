"""Intent routing: project the structured plan onto the legacy intent contract.

Routing used to be a hand-written keyword cascade. It is now a thin projection of
``planner.plan``: the planner resolves language, entities, operations and periods
into a :class:`~app.ai.planner.QueryPlan`, and this module reduces that plan to the
single ``intent`` string existing clients branch on.

Two properties matter and are worth stating once:

* the refusal path is unchanged - a question the published statistics cannot
  support (a price, the weather, a cross-crop national yield) is refused before
  anything is retrieved;
* page context may only *narrow* grounding. An entity the user states explicitly
  always wins over the context, so a contextual "Explain this" cannot override a
  question that names its own crop or district.
"""

from __future__ import annotations

from app.ai.conversation import ConversationContext
from app.ai.planner import INTENTS, plan
from app.ai.schemas import AIRequest, RoutedRequest

__all__ = ["INTENTS", "route"]


def route(
    request: AIRequest, inherited: ConversationContext | None = None
) -> RoutedRequest:
    """Resolve a question into an intent plus the entities it names.

    ``inherited`` is the conversation state from previous turns; it is used only
    for a follow-up that names no entities of its own.
    """
    resolved = plan(request, inherited)
    context = request.context

    return RoutedRequest(
        question=request.question,
        intent=resolved.intent,
        language=request.language,
        district=resolved.districts[0] if resolved.districts else None,
        province=resolved.provinces[0] if resolved.provinces else None,
        crop=resolved.crops[0] if resolved.crops else None,
        metric=resolved.metric,
        benchmark_strategy=context.benchmark_strategy if context else None,
        requested_period=resolved.period_code,
        indicator_ids=resolved.indicators,
        unsupported_topic=resolved.unsupported_topic,
        page=resolved.page,
        crops=resolved.crops,
        districts=resolved.districts,
        comparison_period=resolved.comparison_period_code,
        depth=request.depth or resolved.depth,
        audience=request.audience or resolved.audience,
        plan=resolved,
    )
