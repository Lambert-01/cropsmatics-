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


def test_small_talk_is_conversational(client):
    answer = ask(client, "are you good")
    assert answer["grounded"] is True
    assert answer["intent"] == "greeting"
    assert answer["answer_mode"] == "conversational"
    assert "ready to help" in answer["answer"]


def test_all_seasons_returns_published_coverage(client):
    answer = ask(client, "check all season")
    assert answer["grounded"] is True
    assert answer["intent"] == "data_coverage"
    assert "publishes 14 periods" in answer["answer"]


def test_district_production_question_returns_requested_metric(client):
    answer = ask(client, "tell me production of sorghum on gatsibo")
    assert answer["grounded"] is True
    assert answer["intent"] == "district_crop_observation"
    assert answer["evidence"]["district"] == "Gatsibo"
    assert answer["evidence"]["crop"] == "Sorghum"
    assert answer["evidence"]["production_mt"] is not None
    assert "production" in answer["answer"].lower()
    assert "yield" not in answer["answer"].lower()
    assert [figure["label"] for figure in answer["key_figures"]] == ["production"]


def test_two_district_question_compares_both_districts(client):
    answer = ask(client, "Compare Ngoma and Gatsibo")
    assert answer["grounded"] is True
    assert answer["intent"] == "district_comparison"
    assert [row["district"] for row in answer["evidence"]["districts"]] == [
        "Ngoma",
        "Gatsibo",
    ]
    assert "Ngoma" in answer["answer"]
    assert "Gatsibo" in answer["answer"]


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


def test_every_returned_intent_is_advertised(client):
    """An intent that can be returned must appear in the advertised registry."""
    advertised = set(client.get("/api/v1/assistant/suggestions").json()["intents"])
    assert "national_indicator" in advertised
    for question in (
        "Why is maize yield low in Gisagara?",
        "Tell me about Musanze",
        "How is maize used after harvest?",
        "How many farmers use irrigation?",
        "What is the meaning of life?",
    ):
        assert ask(client, question)["intent"] in advertised, question


def test_no_cross_crop_average_yield_is_reported(client):
    """A district summary must never average yields across unrelated crops."""
    answer = ask(client, "Tell me about Musanze")
    evidence = answer["evidence"]
    assert evidence["cross_crop_yield_mean"] is None
    assert "mean_yield_kg_ha" not in evidence
    assert "average yield" not in answer["answer"].lower()
    assert evidence["n_crops_with_data"] > 0
    assert evidence["largest_production_crops"]


def test_crop_required_indicator_is_not_averaged_nationally(client):
    """Yield across different crops has no meaningful national mean."""
    # A crop-specific yield question must still resolve as a crop context, not an
    # invented cross-crop national average.
    answer = ask(client, "What is the national yield?")
    if answer["grounded"]:
        for item in answer["evidence"].get("indicators", []):
            assert item["id"] != "yield", "yield must never be mean-aggregated"


def test_kinyarwanda_answer_uses_identical_evidence(client):
    """Language changes the prose only; numbers, source and period are equal."""
    question = "Tell me about Musanze"
    english = client.post(
        "/api/v1/assistant/query", json={"question": question, "language": "en"}
    ).json()
    kinyarwanda = client.post(
        "/api/v1/assistant/query", json={"question": question, "language": "rw"}
    ).json()

    assert english["language"] == "en"
    assert english["translation_status"] is None
    assert kinyarwanda["language"] == "rw"
    # The evidence is byte-for-byte identical across languages.
    assert english["evidence"] == kinyarwanda["evidence"]
    assert english["key_figures"] == kinyarwanda["key_figures"]
    assert english["source"] == kinyarwanda["source"]
    assert english["period"] == kinyarwanda["period"]
    # Kinyarwanda text differs and is honest about its review status.
    assert kinyarwanda["answer"] != english["answer"]
    assert kinyarwanda["translation_status"] in (
        "TRANSLATED",
        "TEMPORARY_ENGLISH_FALLBACK",
    )


def test_kinyarwanda_refusal_is_reviewed(client):
    answer = client.post(
        "/api/v1/assistant/query",
        json={"question": "What is the meaning of life?", "language": "rw"},
    ).json()
    assert answer["grounded"] is False
    assert answer["translation_status"] == "TRANSLATED"
    assert answer["answer"].startswith("Cropmatics nta makuru")
