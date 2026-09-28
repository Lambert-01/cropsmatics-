"""Structured assistant context.

A contextual action such as "Explain this yield pattern" must be grounded in the
selection the page is showing. Before this existed the assistant always read the
legacy 2025 Season B extract, so asking for an explanation while 2026 Season B was
selected silently described a different release.

These tests also pin the safety property that makes the feature acceptable: the
context may only *name* entities. It cannot carry a value, so it cannot be used to
inject a figure into a grounded answer.
"""

from __future__ import annotations

import pytest

ENDPOINT = "/api/v1/assistant/query"


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not res.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _ask(client, question: str, **context) -> dict:
    res = client.post(ENDPOINT, json={"question": question, "context": context})
    assert res.status_code == 200, res.text
    return res.json()


# --- the context drives grounding --------------------------------------------


def test_context_makes_the_explanation_period_aware(client):
    _require_data(client)
    current = _ask(
        client, "Explain this yield pattern", period_code="2026B", crop="Maize", district="Nyagatare"
    )
    earlier = _ask(
        client, "Explain this yield pattern", period_code="2025B", crop="Maize", district="Nyagatare"
    )

    assert current["grounded"] is True
    assert earlier["grounded"] is True
    assert current["period"] == "2026B"
    assert earlier["period"] == "2025B"
    assert current["evidence"]["period_code"] == "2026B"
    assert earlier["evidence"]["period_code"] == "2025B"
    # Two different releases must not produce the same figure.
    assert (
        current["evidence"]["observed_yield_kg_ha"] != earlier["evidence"]["observed_yield_kg_ha"]
    )
    # The source names the release actually used.
    assert current["source"] == "NISR_SAS_2026B"
    assert earlier["source"].startswith("NISR_SAS_2025")


def test_context_produces_a_grounded_district_explanation_with_metadata(client):
    _require_data(client)
    body = _ask(
        client,
        "Explain this yield pattern",
        page="yield-intelligence",
        metric="yield",
        period_code="2026B",
        crop="Maize",
        district="Nyagatare",
    )
    assert body["intent"] == "district_crop_gap"
    assert body["coverage"] == "district"
    assert body["source"]
    assert body["limitations"]
    assert "2026 Season B" in body["answer"]
    assert "Nyagatare" in body["answer"]
    assert body["key_figures"]


def test_crop_only_context_uses_the_canonical_panel_for_that_period(client):
    _require_data(client)
    body = _ask(client, "Explain this yield pattern", period_code="2026B", crop="Maize")
    assert body["grounded"] is True
    assert body["period"] == "2026B"
    assert body["coverage"] == "national"
    assert body["source"].startswith("NISR_SAS_")
    assert "2026 Season B" in body["answer"]


def test_explicit_entities_in_the_question_win_over_the_context(client):
    """The context narrows grounding; it never overrides what the user asked."""
    _require_data(client)
    body = _ask(
        client,
        "How is Maize yield in Bugesera?",
        period_code="2026B",
        crop="Cassava",
        district="Nyagatare",
    )
    assert body["grounded"] is True
    assert body["evidence"]["district"] == "Bugesera"
    assert body["evidence"]["crop"] == "Maize"


def test_absent_context_keeps_the_existing_default_behaviour(client):
    _require_data(client)
    without = client.post(ENDPOINT, json={"question": "Maize yield in Nyagatare"}).json()
    assert without["grounded"] is True
    assert without["intent"] == "district_crop_gap"
    # The default still reads the district productivity table for 2025 Season B.
    assert without["period"] == "2025B"


# --- the context cannot carry numbers ---------------------------------------


def test_context_cannot_inject_a_figure_into_a_grounded_answer(client):
    _require_data(client)
    body = client.post(
        ENDPOINT,
        json={
            "question": "Explain this yield pattern",
            "context": {
                "period_code": "2026B",
                "crop": "Maize",
                "district": "Nyagatare",
                # An unknown key is not part of the context contract and must be
                # dropped rather than echoed into the evidence.
                "observed_yield_kg_ha": 999_999,
                "value": 999_999,
            },
        },
    ).json()

    assert "999999" not in body["answer"]
    assert "999999.0" not in body["answer"]
    flattened = f"{body['evidence']}"
    assert "999999" not in flattened
    assert body["evidence"]["observed_yield_kg_ha"] != 999_999


def test_an_unpublished_context_period_is_ignored_not_rejected(client):
    _require_data(client)
    res = client.post(
        ENDPOINT,
        json={
            "question": "Explain this yield pattern",
            "context": {"period_code": "2026C", "crop": "Maize", "district": "Nyagatare"},
        },
    )
    # The answer request itself stays valid; only the unusable period is dropped.
    assert res.status_code == 200
    body = res.json()
    assert body["grounded"] is True
    assert body["period"] != "2026C"


def test_context_for_an_unsupported_topic_is_still_refused(client):
    _require_data(client)
    body = _ask(
        client,
        "What is the market price of maize?",
        period_code="2026B",
        crop="Maize",
        district="Nyagatare",
    )
    assert body["grounded"] is False
    assert body["intent"] == "unsupported"
