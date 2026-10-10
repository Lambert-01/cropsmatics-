"""The structured query planner and the expanded analytical tool registry.

These pin two things at once:

* the planner resolves language, entities and operation into a structured plan,
  including bilingual and code-switched questions;
* the new capabilities are grounded and guard-clean end to end - a planner that
  routes to a tool which then returns an unattributable figure would be worse
  than no planner at all.
"""

from __future__ import annotations

import pytest

from app.ai import language, tool_registry
from app.ai.handlers import HANDLERS
from app.ai.planner import plan
from app.ai.schemas import AIContext, AIRequest

QUERY = "/api/v1/assistant/query"


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not res.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _ask(client, question: str, **context) -> dict:
    res = client.post(QUERY, json={"question": question, "context": context or None})
    assert res.status_code == 200, res.text
    return res.json()


# --- language detection --------------------------------------------------------


def test_language_detection_english():
    assert language.detect("What is maize yield in Gisagara?") == "en"


def test_language_detection_kinyarwanda():
    assert language.detect("Kuki umusaruro w'ibigori uri hasi muri Gisagara?") == "rw"


def test_language_detection_mixed():
    assert language.detect("Kuki umusaruro w'ibigori hano uri hasi? Compare with last Season B") == "mixed"


def test_normalize_only_advertises_supported_languages():
    assert language.normalize("rw") == "rw"
    assert language.normalize("Kinyarwanda") == "rw"
    # ``mixed`` is an internal detection result, never a wire value.
    assert language.normalize("mixed") == "en"


# --- multi-entity resolution ---------------------------------------------------


def test_multiple_crops_and_districts_are_resolved():
    from app.ai.entity_resolver import extract_multi

    districts, crops = extract_multi("Compare maize and beans in Ngoma and Gatsibo")
    assert crops == ["Maize", "Beans"]
    assert districts == ["Ngoma", "Gatsibo"]


def test_crop_and_district_order_follows_the_question():
    from app.ai.entity_resolver import extract_multi

    districts, crops = extract_multi("beans versus rice in Musanze")
    assert crops[0] == "Beans"
    assert "Paddy rice" in crops
    assert districts == ["Musanze"]


# --- planner -------------------------------------------------------------------


def test_plan_resolves_a_two_crop_comparison():
    resolved = plan(AIRequest(question="Compare maize and beans in Rwanda"))
    assert resolved.intent == "crop_comparison"
    assert resolved.crops == ["Maize", "Beans"]
    assert resolved.wants_comparison is True


def test_plan_promotes_two_named_crops_to_a_comparison_without_the_word_compare():
    """Two named crops are a comparison even when the user never says "compare".

    The single-crop path answers only the first named crop, so without this rule a
    question like "maize and beans production" silently dropped a side instead of
    comparing them.
    """
    resolved = plan(AIRequest(question="maize and beans production in Rwanda"))
    assert resolved.intent == "crop_comparison"
    assert resolved.crops == ["Maize", "Beans"]
    assert resolved.wants_comparison is True


def test_plan_resolves_a_district_ranking():
    resolved = plan(AIRequest(question="Which districts have the largest maize yield gap?"))
    assert resolved.intent == "district_ranking"
    assert resolved.crops == ["Maize"]


def test_plan_resolves_a_practice_association_question():
    resolved = plan(AIRequest(question="Which practices are associated with maize yield?"))
    assert resolved.intent == "practice_associations"
    assert resolved.crops == ["Maize"]


def test_plan_refuses_a_price_question_before_resolving_entities():
    resolved = plan(AIRequest(question="What is the price of beans in Kigali?"))
    assert resolved.intent == "unsupported"
    assert resolved.unsupported_topic


def test_plan_about_the_platform_needs_no_crop_or_district():
    assert plan(AIRequest(question="How do you compute the productivity gap?")).intent == "methodology"
    assert plan(AIRequest(question="Where did this number come from?")).intent == "source_provenance"
    assert plan(AIRequest(question="Which periods are covered?")).intent == "data_coverage"


def test_plan_page_context_only_narrows_grounding():
    """A context crop never overrides a crop the question names explicitly."""
    resolved = plan(
        AIRequest(
            question="How is maize yield?",
            context=AIContext(page="crop-detail", crop="Cassava", district="Musanze"),
        )
    )
    assert resolved.crops == ["Maize"]
    assert resolved.districts == ["Musanze"]


def test_plan_resolves_last_season_b_to_the_previous_same_season():
    """\"last Season B\" must become the same season one year earlier, if published."""
    from app.services import period_service

    latest = period_service.latest_district()
    if not latest:
        pytest.skip("period catalogue not built; run `make data`")
    year, season = period_service.parse(latest)
    previous = f"{year - 1}{season}"
    if previous not in period_service.period_codes():
        pytest.skip("no previous-year same season published")

    resolved = plan(
        AIRequest(
            question="Compare maize with last Season B",
            context=AIContext(page="crop-detail", crop="Maize", period_code=latest),
        )
    )
    assert resolved.period_code == previous


# --- the expanded registry -----------------------------------------------------


def test_new_tools_are_registered_and_have_handlers():
    for name in (
        "get_crop_comparison",
        "get_period_change",
        "get_factor_associations",
        "get_data_coverage",
        "get_indicator_definitions",
    ):
        assert name in tool_registry.TOOL_REGISTRY, name
        assert name in HANDLERS, name


def test_every_planned_tool_is_registered_and_has_a_handler():
    for intent, tools in tool_registry.INTENT_TOOLS.items():
        for name in tools:
            assert name in tool_registry.TOOL_REGISTRY, (intent, name)
            assert name in HANDLERS, (intent, name)


def test_comparison_params_require_at_least_two_crops():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        tool_registry.validate_params("get_crop_comparison", {"crops": ["Maize"]})


# --- end to end: grounding and the numeric guard -------------------------------


def test_new_intents_are_advertised(client):
    advertised = set(client.get("/api/v1/assistant/suggestions").json()["intents"])
    for intent in (
        "crop_comparison",
        "period_comparison",
        "district_ranking",
        "crop_trend",
        "practice_associations",
        "postharvest_analysis",
        "data_coverage",
        "source_provenance",
        "methodology",
    ):
        assert intent in advertised, intent


def test_crop_comparison_is_grounded_and_guard_clean(client):
    _require_data(client)
    body = _ask(client, "Compare maize and beans in Rwanda")
    assert body["grounded"] is True
    assert body["intent"] == "crop_comparison"
    assert body["validation"]["numeric"]["ok"] is True, body["validation"]["numeric"]
    assert body["evidence_count"] > 0


def test_district_ranking_is_grounded_and_guard_clean(client):
    _require_data(client)
    body = _ask(client, "Which districts have the largest maize productivity gaps?")
    assert body["grounded"] is True
    assert body["intent"] == "district_ranking"
    assert body["validation"]["numeric"]["ok"] is True, body["validation"]["numeric"]


def test_practice_association_is_grounded(client):
    _require_data(client)
    body = _ask(client, "Which practices are associated with maize yield?")
    assert body["grounded"] is True
    assert body["intent"] == "practice_associations"
    assert body["validation"]["numeric"]["ok"] is True, body["validation"]["numeric"]
    # Association is never presented as causation.
    assert "caus" not in body["answer"].lower() or "not causal" in body["answer"].lower()


def test_metadata_questions_are_grounded(client):
    _require_data(client)
    body = _ask(client, "Which periods are covered?")
    assert body["grounded"] is True
    assert body["intent"] == "data_coverage"

    methodology = _ask(client, "How do you compute the productivity gap?")
    assert methodology["intent"] == "methodology"
    assert methodology["grounded"] is True


def test_kinyarwanda_comparison_is_understood(client):
    _require_data(client)
    body = _ask(client, "Gereranya ibigori n'ibishyimbo mu Rwanda")
    assert body["grounded"] is True
    assert body["intent"] == "crop_comparison"
    assert body["evidence"]["crops"] == ["Maize", "Beans"]
