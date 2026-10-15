"""The one forecast question the assistant answers.

The assistant refuses every request to *predict* — it has no tool that returns a
future value. But a question about the **published** forecast (does one exist,
what does its interval mean, why was none issued) is a question about the
platform's own publication gate, answerable verbatim from the backtest report.

These tests pin both halves of that boundary: the explanation is routed and
answered, and a request to produce a value is still refused. A test that only
covered the first half would license the assistant to forecast.
"""

from __future__ import annotations

from app.ai import grounded
from app.ai.planner import plan
from app.ai.schemas import AIRequest


def _plan(question: str, **over):
    return plan(AIRequest(question=question, language="en", **over))


# --- the explanation is routed ----------------------------------------------


def test_a_published_forecast_question_is_not_refused():
    p = _plan("Is there a published maize forecast for next season?")
    assert p.unsupported_topic is None
    assert "forecast_status" in p.operations


def test_an_interval_question_is_not_refused():
    p = _plan("What does the published forecast interval mean?")
    assert p.unsupported_topic is None
    assert "forecast_status" in p.operations


def test_a_why_none_was_issued_question_is_not_refused():
    p = _plan("Why is no forecast published for this dataset?")
    assert p.unsupported_topic is None


# --- a request to predict is still refused -----------------------------------


def test_a_request_to_predict_is_still_refused():
    p = _plan("Forecast maize yield in Gisagara for next season.")
    assert p.unsupported_topic == "forecast"
    assert "forecast_status" not in p.operations


def test_what_will_yield_be_is_still_refused():
    p = _plan("What will maize yield be in 2027?")
    assert "forecast_status" not in p.operations


def test_a_weather_forecast_is_still_refused():
    p = _plan("What is the weather forecast for Kigali?")
    assert p.unsupported_topic == "weather"
    assert "forecast_status" not in p.operations


# --- the deterministic answer reads the gate, not the model ------------------


def test_the_deterministic_answer_reports_the_gate_verdict():
    answer = grounded.forecast_status()
    # Grounded in the report, never in the model's own numbers.
    assert answer.grounded is True
    assert answer.intent == "forecast_status"
    assert answer.limitations


def test_the_answer_never_contains_a_supplied_forecast_when_withheld():
    answer = grounded.forecast_status()
    from app.services import meta_service

    status = meta_service.forecast_status()
    if status.get("serves_forecast"):
        # A published forecast must be labelled modelled, with an interval note.
        assert "modelled" in answer.answer.lower() or "interval" in answer.answer.lower()
    else:
        # The withholding is the answer: it must say no forecast is published.
        lowered = answer.answer.lower()
        assert "no forecast" in lowered or "not published" in lowered or "no backtest" in lowered


def test_the_withheld_answer_carries_the_blocking_reasons():
    from app.services import meta_service

    status = meta_service.forecast_status()
    if status.get("serves_forecast") or not status.get("report_available"):
        return
    answer = grounded.forecast_status()
    # At least one reason the gate recorded reaches the reader.
    assert answer.evidence.get("serves_forecast") is False
