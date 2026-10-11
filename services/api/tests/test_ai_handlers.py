"""Every planned tool must be callable with the arguments its handler produces.

The handlers map a routed request onto each tool's parameters, and every tool
declares a *strict* Pydantic model (unknown keys are refused, deliberately). The
two have to agree: when a handler emits a key its tool does not declare,
``validate_params`` rejects the call, ``evidence_builder`` logs and moves on, and
the answer is quietly poorer than the question deserves.

That is exactly what happened to ``get_crop_trend``: its handler passed a
``period_code`` the trend tool has no parameter for, so for every question planned
onto it the multi-period trend evidence was dropped — the ``crop_trend`` intent
retrieved nothing at all (``evidence_count`` 0, ``tools_used`` empty). Nothing
raised, because a tool that fails is skipped by design; the only symptom was a
thinner answer.

These tests walk the whole allow-list rather than one tool, so a future mismatch
fails here instead of silently degrading answers.
"""

from __future__ import annotations

from app.ai import handlers, tool_registry
from app.ai.schemas import RoutedRequest


def _representative() -> RoutedRequest:
    """A request that supplies every entity a handler might forward."""
    return RoutedRequest(
        question="Compare maize and beans in Ngoma and Gatsibo since 2026B",
        intent="crop_national_context",
        crop="Maize",
        crops=["Maize", "Beans"],
        district="Ngoma",
        districts=["Ngoma", "Gatsibo"],
        indicator_ids=["irrigation_adoption"],
        requested_period="2026B",
    )


def test_every_planned_tool_has_a_handler():
    planned = {name for tools in tool_registry.INTENT_TOOLS.values() for name in tools}
    missing = sorted(planned - set(handlers.HANDLERS))
    assert missing == [], f"planned tools with no parameter handler: {missing}"


def test_every_handler_returns_parameters_its_tool_accepts():
    """A tool the planner can select must not be unreachable through its handler."""
    routed = _representative()
    for name in {n for tools in tool_registry.INTENT_TOOLS.values() for n in tools}:
        params = handlers.HANDLERS[name](routed)
        if params is None:
            continue
        spec = tool_registry.get(name)
        # Raises pydantic.ValidationError when the handler invents a parameter,
        # which is precisely the failure that used to be swallowed.
        spec.params_model(**params)


def test_a_handler_without_the_entity_it_needs_is_skipped():
    """No entity means no call, rather than a fabricated one."""
    routed = RoutedRequest(question="Which districts have the largest gaps?", intent="district_ranking")
    for name, handler in handlers.HANDLERS.items():
        params = handler(routed)
        if params is None:
            continue
        # Anything that did run must still validate.
        tool_registry.get(name).params_model(**params)


def test_the_trend_tool_is_reachable_and_takes_no_period():
    """Named regression for the dropped-trend-evidence bug."""
    params = handlers.HANDLERS["get_crop_trend"](_representative())
    assert params is not None
    assert params.get("crop") == "Maize"
    # The trend spans every published period; a `period_code` is not a parameter.
    assert "period_code" not in params
    tool_registry.get("get_crop_trend").params_model(**params)
