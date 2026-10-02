"""Mobile intelligence endpoints: the Home read model must reflect real data.

These tests assert the *contract* the mobile client relies on. In particular they
guard the rule that a missing value is never presented as a measured zero, and
that every suggested question is actually answerable.
"""

from __future__ import annotations

REQUIRED_FIELDS = {
    "latest_period",
    "crop_count",
    "district_count",
    "indicator_count",
    "source_count",
    "featured_topics",
    "suggested_questions",
    "data_version",
}


def test_home_exposes_the_required_contract(client):
    resp = client.get("/api/v1/mobile/home")
    assert resp.status_code == 200
    body = resp.json()
    assert REQUIRED_FIELDS <= set(body)
    assert body["provenance"]["source_id"]


def test_home_counts_match_the_reference_dictionaries(client):
    home = client.get("/api/v1/mobile/home").json()
    crops = client.get("/api/v1/crops").json()
    districts = client.get("/api/v1/geography/districts").json()

    assert home["crop_count"] == len(crops)
    assert home["district_count"] == len(districts)
    assert home["district_count"] == 30
    # Every count is a real, positive count — none is a placeholder.
    assert home["crop_count"] > 0
    assert home["indicator_count"] > 0
    assert home["source_count"] > 0


def test_home_reports_the_district_period_only_where_districts_exist(client):
    home = client.get("/api/v1/mobile/home").json()
    assert home["latest_period"] == "2025B"
    assert home["latest_period_label"] == "2025 Season B"
    assert home["latest_period_coverage"] == "district"


def test_home_summary_cards_are_consistent_with_the_headline_counts(client):
    home = client.get("/api/v1/mobile/home").json()
    cards = {card["id"]: card for card in home["summary_cards"]}

    assert set(cards) == {"crops", "districts", "indicators", "sources"}
    assert cards["crops"]["value"] == home["crop_count"]
    assert cards["districts"]["value"] == home["district_count"]
    assert cards["indicators"]["value"] == home["indicator_count"]
    assert cards["sources"]["value"] == home["source_count"]
    for card in cards.values():
        assert card["route"].startswith("/")


def test_featured_topics_are_grounded_in_a_real_source(client):
    topics = client.get("/api/v1/mobile/home").json()["featured_topics"]
    assert topics, "home should lead with at least one real insight"
    for topic in topics:
        assert topic["source_id"], topic
        assert topic["period"], topic
        # A summary must state a figure, not a placeholder.
        assert any(char.isdigit() for char in topic["summary"]), topic


def test_suggested_questions_are_all_answerable(client):
    """A suggestion that cannot be grounded would be a broken promise."""
    questions = client.get("/api/v1/mobile/home").json()["suggested_questions"]
    assert questions
    for question in questions:
        answer = client.post("/api/v1/assistant/query", json={"question": question}).json()
        assert answer["grounded"] is True, question
        assert answer["source"], question
        assert answer["period"], question
