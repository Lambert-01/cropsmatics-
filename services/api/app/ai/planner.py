"""The structured query planner.

The planner is the analytical front door. It turns a free-text question into a
validated :class:`QueryPlan` - a *structured* description of what is being asked -
before any retrieval happens:

    USER QUESTION
        -> language detection
        -> entity resolution (crops, districts, periods, indicators)
        -> operation detection (compare, rank, trend, explain, provenance...)
        -> QueryPlan

Why a plan rather than a chain of ``if "compare" in question`` branches: the
operations compose (a question can ask for a ranking *and* a trend), the entities
compose (several crops, several districts), and the result is inspectable. It is
also the object the tests pin, which is what keeps the behaviour from drifting as
the vocabulary grows.

This module never retrieves evidence and never states a fact. It decides *what to
look up*; ``evidence_builder`` and the tool layer decide what is true.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

from app.ai import language, ontology
from app.ai.conversation import ConversationContext
from app.ai.entity_resolver import UNSUPPORTED_HINTS, extract_multi, matched_indicators, mentions
from app.ai.schemas import AIContext, AIRequest
from app.services import period_service

#: A question that names no crop, district or indicator but does ask about an
#: operation still cannot be grounded, so it resolves to ``unsupported``.
OPERATION_TO_INTENT: dict[str, str] = {
    "crop_comparison": "crop_comparison",
    "district_comparison": "district_ranking",
    "period_comparison": "period_comparison",
    "trend": "crop_trend",
    "ranking": "district_ranking",
    "practice_associations": "practice_associations",
    "irrigation": "national_indicator",
    "erosion": "national_indicator",
    "postharvest": "postharvest_analysis",
    "priority": "district_ranking",
    "data_coverage": "data_coverage",
    "source_provenance": "source_provenance",
    "methodology": "methodology",
    "model_info": "methodology",
}

#: Intents the planner can return. A client can branch on any of them.
INTENTS: tuple[str, ...] = (
    "district_crop_gap",
    "crop_national_context",
    "district_context",
    "national_indicator",
    "crop_comparison",
    "period_comparison",
    "district_ranking",
    "crop_trend",
    "practice_associations",
    "postharvest_analysis",
    "data_coverage",
    "source_provenance",
    "methodology",
    "forecast_status",
    "unsupported",
)

_DEPTH_WORDS: dict[str, tuple[str, ...]] = {
    "deep": ("deep", "in detail", "in depth", "detailed", "explain fully", "comprehensive"),
    "quick": ("quick", "briefly", "short answer", "one line", "tldr"),
}
_AUDIENCE_WORDS: dict[str, tuple[str, ...]] = {
    "farmer": ("for a farmer", "simple", "simply", "in simple terms", "umuhinzi"),
    "analyst": ("for a researcher", "research", "analyst", "methodology detail", "statistical"),
    "planner": ("for a planner", "policy", "for a district", "decision maker"),
}

_ABSOLUTE_PERIOD = re.compile(r"\b(20\d{2})\s*(?:season\s*)?([ABCabc])?\b")

#: Wording that asks about the *published* forecast — its existence, its
#: interval, why none was issued — rather than asking the model to predict one.
#: Matching tolerates up to two interposed words, because a real question reads
#: "a published maize forecast", not "a published forecast": a phrase matcher
#: would miss every question that names its crop. A question mentioning
#: "forecast" that matches none of these is refused: only the publication gate
#: may be explained, never a value produced.
_FORECAST_EXPLANATION_RE = re.compile(
    r"\b(?:published|validated|official)\s+(?:\w+\s+){0,2}forecast\b"
    r"|\bforecast\s+(?:status|interval|gate|published|publication)\b"
    r"|\bprediction\s+interval\b"
    r"|\bis\s+there\s+(?:a|an|any)\s+(?:\w+\s+){0,2}forecast\b"
    r"|\bwhy\s+(?:is\s+)?(?:there\s+)?no\s+forecast\b"
    r"|\bwhy\s+no\s+forecast\b"
    r"|\bpublication\s+gate\b"
    r"|\bbacktest\b"
    r"|\bexplain\s+(?:the\s+)?forecast\b"
    r"|\bwhat\s+does\s+(?:the\s+)?forecast\b"
    r"|\bforecast\s+mean\b",
    re.IGNORECASE,
)


def _asks_about_published_forecast(text: str) -> bool:
    """Whether the question is about the publication gate, not a prediction."""
    return bool(_FORECAST_EXPLANATION_RE.search(text or ""))

#: Words that signal a follow-up: a pronoun pointing at the previous turn, a
#: switch of entity, or an explicit comparison of what came before.
_FOLLOWUP_MARKERS: tuple[str, ...] = (
    "them",
    "that",
    "this",
    "it",
    "those",
    "these",
    "what about",
    "also",
    "instead",
    "compare",
    "previous",
    "same",
    "there",
    "that one",
)


class QueryPlan(BaseModel):
    """What the user asked for, in structured form.

    Every field is derived from the question, the page context, or the published
    period catalogue. No field carries a value, so a plan cannot smuggle a figure
    into an answer.
    """

    language: str = "en"
    operations: list[str] = Field(default_factory=list)
    crops: list[str] = Field(default_factory=list)
    districts: list[str] = Field(default_factory=list)
    provinces: list[str] = Field(default_factory=list)
    indicators: list[str] = Field(default_factory=list)
    period_code: str | None = None
    comparison_period_code: str | None = None
    metric: str | None = None
    wants_comparison: bool = False
    unsupported_topic: str | None = None
    clarification: str | None = None
    depth: str = "standard"
    audience: str = "planner"
    page: str | None = None

    @property
    def intent(self) -> str:
        """The primary intent, used as the legacy single-value projection."""
        return primary_intent(self)


def _detect_depth(text: str) -> str:
    lowered = text.lower()
    if ontology.contains_any(lowered, _DEPTH_WORDS["deep"]):
        return "deep"
    if ontology.contains_any(lowered, _DEPTH_WORDS["quick"]):
        return "quick"
    return "standard"


def _detect_audience(text: str) -> str:
    lowered = text.lower()
    for audience in ("farmer", "analyst", "planner"):
        if ontology.contains_any(lowered, _AUDIENCE_WORDS[audience]):
            return audience
    return "planner"


def _absolute_period(text: str) -> str | None:
    """Resolve a period written explicitly, e.g. ``"2026 Season B"`` or ``"2025A"``."""
    for match in _ABSOLUTE_PERIOD.finditer(text):
        year, season = match.group(1), match.group(2)
        candidate = f"{year}{(season or 'B').upper()}"
        try:
            return period_service.require(candidate)
        except period_service.UnknownPeriodError:
            continue
    return None


def _previous_same_season(code: str) -> str | None:
    """``2026B`` -> ``2025B`` when that period is published, else ``None``."""
    try:
        year, season = period_service.parse(code)
    except period_service.UnknownPeriodError:
        return None
    candidate = f"{year - 1}{season}"
    try:
        return period_service.require(candidate)
    except period_service.UnknownPeriodError:
        return None


def _resolve_period(
    text: str,
    context: AIContext | None,
    inherited_period: str | None = None,
) -> tuple[str | None, str | None, bool]:
    """Return ``(period_code, comparison_period_code, wants_comparison)``.

    The base period, in priority order: an absolute code in the question, then the
    page context, then the period inherited from the conversation. When none is
    present it stays ``None`` so the tool layer answers for the current release
    rather than a guessed one.

    "Last Season B" is resolved against the published catalogue - it becomes the
    same season one year earlier, which is the only season-to-season comparison
    the data support. A comparison that has no published baseline is simply not
    offered rather than approximated.
    """
    base = _absolute_period(text)
    if base is None and context is not None and context.period_code:
        try:
            base = period_service.require(context.period_code)
        except period_service.UnknownPeriodError:
            base = None
    if base is None and inherited_period:
        try:
            base = period_service.require(inherited_period)
        except period_service.UnknownPeriodError:
            base = None

    operations = ontology.detect_operations(text)
    relative = ontology.relative_period(text)

    if relative == "previous_same_season":
        anchor = base or period_service.latest()
        if anchor:
            previous = _previous_same_season(anchor)
            if previous:
                return previous, None, True

    if "period_comparison" in operations and base:
        return base, _previous_same_season(base), True

    return base, None, False


def primary_intent(plan: QueryPlan) -> str:
    """Reduce a plan to the single intent a legacy client branches on.

    The precedence is chosen to be *additive*: the rules the previous keyword
    router already handled keep their outcome (a crop-only question still returns
    ``crop_national_context``, a crop + district question still returns
    ``district_crop_gap``), while genuinely new readings - a two-crop comparison,
    a district ranking, a provenance question - are promoted only when the
    question clearly frames them.
    """
    if plan.unsupported_topic:
        return "unsupported"

    def has(op: str) -> bool:
        return op in plan.operations

    # The publication gate is a statement about the platform. It is checked
    # before any crop/district reading so "is there a published maize forecast?"
    # answers the gate question rather than a nearby productivity one.
    if has("forecast_status"):
        return "forecast_status"

    # A comparison of two or more named crops is the most specific reading and the
    # old router would have wrongly returned a single-crop context.
    if has("crop_comparison") and len(plan.crops) >= 2:
        return "crop_comparison"

    # Same-season change for a named crop.
    if has("period_comparison") and plan.crops:
        return "period_comparison"

    # Statements about the platform itself, not about a place or crop.
    if has("source_provenance"):
        return "source_provenance"
    if has("methodology") or has("model_info"):
        return "methodology"
    if has("data_coverage"):
        return "data_coverage"

    # The legacy precedence: crop + district, then district, then crop.
    if plan.crops and plan.districts:
        return "district_crop_gap"

    # A crop question that explicitly asks for a ranking or a trend, which the old
    # router answered with a single latest value.
    if plan.crops and has("ranking"):
        return "district_ranking"
    if plan.crops and has("practice_associations"):
        return "practice_associations"
    if plan.crops and has("trend"):
        return "crop_trend"

    if len(plan.crops) >= 2 and plan.wants_comparison:
        return "crop_comparison"

    if plan.crops:
        return "crop_national_context"
    if plan.districts:
        return "district_context"
    if plan.indicators:
        return "national_indicator"
    return "unsupported"


def _is_follow_up(
    question: str,
    crops: list[str],
    districts: list[str],
    indicators: list[str],
) -> bool:
    """Whether the question depends on the previous turn for its meaning.

    A short question is treated as a follow-up ("Compare them."), as is a longer
    one that names no entity but uses a referring word ("explain that", "and the
    previous season"). A question that names its own entities is never rewritten
    from history, so explicit intent always wins.
    """
    words = re.findall(r"[a-z']+", question.lower())
    if len(words) <= 6:
        return True
    if crops or districts or indicators:
        return False
    return ontology.contains_any(question.lower(), _FOLLOWUP_MARKERS)


def plan(request: AIRequest, inherited: ConversationContext | None = None) -> QueryPlan:
    """Build the structured plan for a question.

    ``inherited`` is the conversation state from previous turns. It is consulted
    **only** when the question is a follow-up that does not name its own entities,
    so context can narrow grounding but never override an explicit question.

    Deliberately total: it always returns a plan, even for an unsupported question,
    so the caller never has to guess whether an answer is possible.
    """
    question = request.question
    lowered = question.lower()
    context = request.context

    detected = language.detect(question)
    depth = _detect_depth(question)
    audience = _detect_audience(question)

    # An out-of-scope topic is refused before entities are resolved, so a price
    # or weather question is never answered with a neighbouring production figure.
    unsupported = mentions(lowered, UNSUPPORTED_HINTS)
    if unsupported == "forecast":
        # "Forecast" is refused by default, with one narrow exception: a question
        # about the *published* forecast — whether one exists, what the interval
        # means, why none was issued. That is a question about the platform's own
        # publication gate, answered verbatim from the backtest report by the
        # ``forecast_status`` tool, which produces no forecast of its own.
        #
        # A request to *predict* ("what will maize yield be next season?", "give
        # me a forecast for Gisagara") matches none of these markers and is still
        # refused: the model may explain a forecast the backtest published, never
        # supply one.
        if _asks_about_published_forecast(lowered):
            unsupported = None
        else:
            return QueryPlan(
                language=detected,
                operations=["unsupported"],
                unsupported_topic="forecast",
                depth=depth,
                audience=audience,
                page=context.page if context else None,
            )
    elif unsupported:
        return QueryPlan(
            language=detected,
            operations=["unsupported"],
            unsupported_topic=unsupported,
            depth=depth,
            audience=audience,
            page=context.page if context else None,
        )

    districts, crops = extract_multi(question)
    if context is not None:
        # Explicit entities in the question always win over page context.
        if not districts and context.district:
            districts = [context.district]
        if not crops and context.crop:
            crops = [context.crop]

    operations = ontology.detect_operations(question)
    indicators = matched_indicators(lowered)

    # The one forecast question the platform answers: a query about the
    # *published* forecast. It is an operation, not an intent shortcut, so the
    # normal grounding path still runs and the tool still returns the gate's own
    # verdict rather than a model-supplied number.
    if _asks_about_published_forecast(lowered):
        operations.append("forecast_status")

    # Conversation inheritance. Applied only to a follow-up that names no entities
    # of its own, so an explicit question is never rewritten from history.
    inherited_period: str | None = None
    if inherited is not None and _is_follow_up(question, crops, districts, indicators):
        inherited_period = inherited.period_code
        if not crops:
            if "crop_comparison" in operations and len(inherited.recent_crops) >= 2:
                # "Compare them." - the two sides are the recently discussed crops,
                # not only the active one.
                crops = list(inherited.recent_crops)
            elif inherited.crops:
                crops = list(inherited.crops)
        if not districts and inherited.districts:
            districts = list(inherited.districts)
        if not indicators and inherited.metric and inherited.metric in indicators:
            indicators = [inherited.metric]

    # Two or more named crops is a comparison in its own right, whether or not the
    # user said "compare". The comparison tools accept a crop list, whereas the
    # single-crop path answers only the first named crop - so before this rule a
    # question like "maize and beans production" silently dropped a side instead of
    # comparing them. Promotion is additive: a question that already carried the
    # comparison operation is left untouched.
    if len(crops) >= 2 and "crop_comparison" not in operations:
        operations = [*operations, "crop_comparison"]

    period_code, comparison_period, wants_comparison = _resolve_period(
        question, context, inherited_period
    )
    wants_comparison = wants_comparison or (
        "crop_comparison" in operations and len(crops) >= 2
    )

    plan_value = QueryPlan(
        language=detected,
        operations=operations,
        crops=crops,
        districts=districts,
        provinces=[context.province] if context and context.province else [],
        indicators=indicators,
        period_code=period_code,
        comparison_period_code=comparison_period,
        metric=context.metric if context else None,
        wants_comparison=wants_comparison,
        depth=depth,
        audience=audience,
        page=context.page if context else None,
    )

    # If we can ground nothing and no operation is even recognised, say so rather
    # than guessing.
    if not crops and not districts and not indicators and not operations:
        return plan_value

    return plan_value
