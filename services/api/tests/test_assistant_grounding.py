"""Grounded assistant: no number may be stated unless the data support it."""

from __future__ import annotations

NOT_GROUNDED = "Cropmatics does not currently have verified data to answer this question."


def ask(client, question: str) -> dict:
    resp = client.post("/api/v1/assistant/query", json={"question": question})
    assert resp.status_code == 200
    return resp.json()


def test_district_and_crop_question_is_grounded(client):
    answer = ask(client, "Why is maize yield low in Gisagara?")
    assert answer["grounded"] is True
    assert answer["intent"] == "district_crop_gap"
    assert answer["evidence"]["district"] == "Gisagara"
    assert answer["evidence"]["crop"] == "Maize"
    # Grounding metadata is mandatory on a grounded answer.
    assert answer["source"]
    assert answer["period"]
    assert answer["coverage"]
    assert answer["limitations"]


def test_unsupported_question_uses_the_exact_refusal(client):
    answer = ask(client, "What is the meaning of life?")
    assert answer["grounded"] is False
    assert answer["answer"] == NOT_GROUNDED
    assert answer["intent"] == "unsupported"
    assert answer["source"] is None


def test_out_of_scope_topics_are_refused_not_approximated(client):
    """Prices and weather are not in the dataset, so a neighbouring production
    figure must never be substituted for the answer."""
    for question in (
        "What is the price of beans in Kigali tomorrow?",
        "Will it rain in Musanze next week?",
        "What is the market price of maize?",
        "Which fertiliser subsidy can I get?",
    ):
        answer = ask(client, question)
        assert answer["grounded"] is False, question
        assert answer["answer"] == NOT_GROUNDED, question


def test_crop_only_question_returns_national_context(client):
    answer = ask(client, "How is maize used after harvest?")
    assert answer["grounded"] is True
    assert answer["intent"] == "crop_national_context"
    assert answer["coverage"] == "national crop-level"
    assert answer["period"]


def test_district_only_question_returns_district_context(client):
    answer = ask(client, "Tell me about Musanze")
    assert answer["grounded"] is True
    assert answer["intent"] == "district_context"
    assert answer["coverage"] == "district"
    assert answer["evidence"]["district"] == "Musanze"


def test_national_indicator_question_is_grounded(client):
    answer = ask(client, "How many farmers use irrigation?")
    assert answer["grounded"] is True
    assert answer["intent"] == "national_indicator"
    assert answer["period"]
    assert answer["evidence"]["indicators"]


def test_crop_alias_resolves_to_the_canonical_name(client):
    """"rice" must reach "Paddy rice" — the published crop name."""
    answer = ask(client, "How much rice is produced in Rwanda?")
    assert answer["grounded"] is True
    assert answer["evidence"]["crop"] == "Paddy rice"


def test_ambiguous_trailing_word_is_not_guessed(client):
    """"potato" fits both Irish and sweet potato, so it must not be resolved."""
    answer = ask(client, "How much potato is produced?")
    assert answer["grounded"] is False


def test_suggestions_endpoint_is_self_consistent(client):
    body = client.get("/api/v1/assistant/suggestions").json()
    assert body["questions"]
    for question in body["questions"]:
        assert ask(client, question)["grounded"] is True, question


def test_kinyarwanda_crop_name_is_understood(client):
    answer = ask(client, "Ni gute ibigori bihingwa mu Gisagara?")
    # "ibigori" is the Kinyarwanda name for maize.
    assert answer["grounded"] is True
    assert answer["evidence"]["crop"] == "Maize"
