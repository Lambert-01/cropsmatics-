"""The structured response contract: depth, audience, figures and evidence.

The two rules under test are the ones that matter product-wise:

* depth changes the *volume* of what is returned, never the figures or evidence;
* audience changes the *presentation*, never the figures or evidence.
"""

from __future__ import annotations

import pytest

from app.ai.prompting import token_budget

QUERY = "/api/v1/assistant/query"

STRUCTURED_KEYS = {
    "answer_id",
    "conversation_id",
    "language",
    "depth",
    "audience",
    "intent",
    "title",
    "summary",
    "key_findings",
    "figures",
    "comparison",
    "trend",
    "interpretation",
    "limitations",
    "methodology",
    "evidence",
    "sources",
    "suggested_followups",
    "actions",
    "resolved_context",
    "data_version",
    "warnings",
}


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503 or not res.json().get("rows"):
        pytest.skip("processed tables not built; run `make data`")


def _ask(client, question: str, **extra) -> dict:
    res = client.post(QUERY, json={"question": question, **extra})
    assert res.status_code == 200, res.text
    return res.json()


# --- the payload shape ---------------------------------------------------------


def test_structured_payload_has_the_documented_keys(client):
    _require_data(client)
    body = _ask(client, "Why is maize yield low in Gisagara?")
    structured = body["structured"]
    assert STRUCTURED_KEYS.issubset(structured.keys())
    assert structured["summary"] == body["answer"]
    assert structured["intent"] == body["intent"]


def test_every_figure_is_traceable(client):
    _require_data(client)
    structured = _ask(client, "Why is maize yield low in Gisagara?")["structured"]
    assert structured["figures"], "a grounded answer must carry figures"
    for figure in structured["figures"]:
        assert figure["label"]
        assert figure["value"] is not None
        assert figure["source_id"], figure
        assert figure["period_code"], figure


def test_every_evidence_item_carries_its_provenance(client):
    _require_data(client)
    structured = _ask(client, "Why is maize yield low in Gisagara?")["structured"]
    assert structured["evidence"]
    for item in structured["evidence"]:
        assert item["evidence_id"]
        assert item["kind"]
        assert item["metric"]
        # A derived value must state how it was computed.
        if item["kind"] == "derived":
            assert item["method"], item


def test_actions_reflect_the_resolved_entities(client):
    _require_data(client)
    structured = _ask(client, "Why is maize yield low in Gisagara?")["structured"]
    types = {action["type"] for action in structured["actions"]}
    assert "view_evidence" in types
    assert "open_crop" in types
    assert "open_district" in types
    assert structured["resolved_context"]["crops"] == ["Maize"]
    assert structured["resolved_context"]["districts"] == ["Gisagara"]


# --- depth changes volume, not truth ------------------------------------------


def test_quick_depth_is_smaller_than_standard(client):
    _require_data(client)
    question = "Why is maize yield low in Gisagara?"
    quick = _ask(client, question, depth="quick")["structured"]
    standard = _ask(client, question, depth="standard")["structured"]
    assert quick["depth"] == "quick"
    assert standard["depth"] == "standard"
    assert quick["key_findings"] == []
    assert quick["suggested_followups"] == []
    assert standard["suggested_followups"]
    # The evidence retrieved is the same; only the surfaced volume differs.
    assert len(quick["evidence"]) <= len(standard["evidence"])
    assert quick["summary"] == standard["summary"]


def test_deep_depth_adds_interpretation_and_methodology(client):
    _require_data(client)
    deep = _ask(client, "Compare maize and beans in Rwanda", depth="deep")["structured"]
    assert deep["depth"] == "deep"
    assert deep["interpretation"]
    assert deep["methodology"]
    assert deep["comparison"], "a comparison answer must surface its comparison"
    assert deep["figures"]


# --- audience changes presentation, not evidence ------------------------------


def test_audience_never_changes_figures_or_evidence(client):
    _require_data(client)
    question = "Why is maize yield low in Gisagara?"
    farmer = _ask(client, question, audience="farmer")["structured"]
    analyst = _ask(client, question, audience="analyst")["structured"]

    assert farmer["audience"] == "farmer"
    assert analyst["audience"] == "analyst"
    # The evidence and figures are byte-for-byte identical.
    assert farmer["figures"] == analyst["figures"]
    assert farmer["evidence"] == analyst["evidence"]
    assert farmer["summary"] == analyst["summary"]
    assert farmer["sources"] == analyst["sources"]
    # Only the researcher is shown methodology by default.
    assert analyst["methodology"]
    assert farmer["methodology"] == []


# --- unsupported questions -----------------------------------------------------


def test_unsupported_question_is_structured_and_warned(client):
    body = _ask(client, "What is the market price of maize?")
    structured = body["structured"]
    assert structured["intent"] == "unsupported"
    assert structured["figures"] == []
    assert structured["evidence"] == []
    assert structured["warnings"]


# --- the depth output budget ---------------------------------------------------


def test_token_budget_scales_with_depth():
    assert token_budget(700, "quick") < 700
    assert token_budget(700, "standard") == 700
    assert token_budget(700, "deep") > 700
    # Clamped so a deep request cannot run unbounded.
    assert token_budget(100000, "deep") <= 4096
