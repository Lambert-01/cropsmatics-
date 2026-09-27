"""Anonymous information inquiries.

The tests redirect the append-only store to a temporary directory so a test run
never writes into the repository's own ``data/interim`` folder.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    from app.services import inquiry_service

    monkeypatch.setattr(inquiry_service, "INQUIRY_DIR", tmp_path)
    monkeypatch.setattr(inquiry_service, "INQUIRY_FILE", tmp_path / "inquiries.jsonl")
    yield


def test_anonymous_submission_needs_no_contact_details(client):
    resp = client.post(
        "/api/v1/inquiries",
        json={"topic": "Data question", "message": "Do you have 2025 season A yields?"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "RECEIVED"
    assert body["contact_name"] is None
    assert body["contact_email"] is None
    assert body["id"]
    assert body["created_at"]


def test_optional_context_is_preserved(client):
    body = client.post(
        "/api/v1/inquiries",
        json={
            "topic": "Methodology clarification",
            "crop": "Maize",
            "province": "Eastern",
            "district": "Nyagatare",
            "message": "How is the productivity gap benchmark chosen?",
            "contact_name": "A. Uwase",
            "contact_email": "uwase@example.rw",
            "organization": "Cooperative",
        },
    ).json()
    assert body["crop"] == "Maize"
    assert body["province"] == "Eastern"
    assert body["district"] == "Nyagatare"
    assert body["organization"] == "Cooperative"


def test_client_uuid_makes_a_queued_offline_retry_idempotent(client):
    payload = {
        "topic": "Data question",
        "message": "Submitted twice from the offline queue.",
        "client_uuid": "11111111-2222-3333-4444-555555555555",
    }
    first = client.post("/api/v1/inquiries", json=payload).json()
    second = client.post("/api/v1/inquiries", json=payload).json()
    assert first["id"] == second["id"]


def test_inquiry_can_be_read_back_by_id(client):
    created = client.post(
        "/api/v1/inquiries",
        json={"topic": "Report an error", "message": "The Gasabo figure looks wrong."},
    ).json()
    fetched = client.get(f"/api/v1/inquiries/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]


def test_unknown_inquiry_id_is_not_found(client):
    assert client.get("/api/v1/inquiries/does-not-exist").status_code == 404


def test_invalid_email_is_rejected(client):
    resp = client.post(
        "/api/v1/inquiries",
        json={
            "topic": "Data question",
            "message": "Contact me",
            "contact_email": "not-an-email",
        },
    )
    assert resp.status_code == 422


def test_blank_message_is_rejected(client):
    resp = client.post("/api/v1/inquiries", json={"topic": "Data question", "message": "    "})
    assert resp.status_code == 422


def test_topics_vocabulary_is_offered(client):
    topics = client.get("/api/v1/inquiries/topics").json()["topics"]
    assert "Data question" in topics
