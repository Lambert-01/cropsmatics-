"""Anonymous information inquiries — privacy contract.

The tests redirect the append-only store to a temporary directory so a test run
never writes into the repository's own ``data/interim`` folder.

The privacy tests are the important ones: an anonymous visitor must not be able
to enumerate or read back other people's submissions.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    from app.services import inquiry_service

    monkeypatch.setattr(inquiry_service, "INQUIRY_DIR", tmp_path)
    monkeypatch.setattr(inquiry_service, "INQUIRY_FILE", tmp_path / "inquiries.jsonl")
    yield


def _submit(client, **overrides) -> dict:
    payload = {"topic": "Data question", "message": "Do you have 2025 season A yields?"}
    payload.update(overrides)
    resp = client.post("/api/v1/inquiries", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_anonymous_submission_needs_no_contact_details(client):
    body = _submit(client)
    assert body["status"] == "RECEIVED"
    assert body["id"]
    assert body["created_at"]
    assert body["receipt_token"]
    assert body["reference"].startswith("CROPM-")
    # The public receipt must not echo private contact fields.
    assert "contact_email" not in body
    assert "message" not in body


def test_receipt_token_is_high_entropy_and_not_the_id(client):
    body = _submit(client)
    assert len(body["receipt_token"]) >= 32
    assert body["receipt_token"] != body["id"]


def test_optional_context_is_accepted(client):
    body = _submit(
        client,
        topic="Methodology clarification",
        crop="Maize",
        province="Eastern",
        district="Nyagatare",
        message="How is the productivity gap benchmark chosen?",
        contact_name="A. Uwase",
        contact_email="uwase@example.rw",
        organization="Cooperative",
    )
    # Context is accepted (201 + receipt) but not echoed back to the public caller.
    assert body["id"]
    assert "organization" not in body


def test_client_uuid_makes_a_queued_offline_retry_idempotent(client):
    payload = {
        "topic": "Data question",
        "message": "Submitted twice from the offline queue.",
        "client_uuid": "11111111-2222-3333-4444-555555555555",
    }
    first = client.post("/api/v1/inquiries", json=payload).json()
    second = client.post("/api/v1/inquiries", json=payload).json()
    assert first["id"] == second["id"]
    # The same secret receipt must come back so the retry does not lose access.
    assert first["receipt_token"] == second["receipt_token"]


# --- privacy ---------------------------------------------------------------


def test_anonymous_user_cannot_list_inquiries(client):
    """There must be no public listing endpoint at all."""
    _submit(client)
    for path in ("/api/v1/inquiries", "/api/v1/inquiries/"):
        assert client.get(path).status_code in (404, 405), path


def test_status_requires_the_receipt_token(client):
    created = _submit(client)
    # No token at all -> validation error (token is required).
    assert client.get(f"/api/v1/inquiries/{created['id']}/status").status_code == 422


def test_wrong_receipt_token_cannot_inspect_an_inquiry(client):
    created = _submit(client)
    resp = client.get(
        f"/api/v1/inquiries/{created['id']}/status",
        params={"token": "wrong-token-that-is-long-enough"},
    )
    assert resp.status_code == 404


def test_one_user_cannot_inspect_another_inquiry(client):
    a = _submit(client, message="First person's private question about yields.")
    b = _submit(client, message="Second person's private question about fertilizer.")
    # Using A's token against B's id must fail.
    resp = client.get(
        f"/api/v1/inquiries/{b['id']}/status",
        params={"token": a["receipt_token"]},
    )
    assert resp.status_code == 404


def test_correct_receipt_token_returns_a_sanitized_status(client):
    created = _submit(
        client,
        message="A private message that must not be echoed.",
        contact_email="someone@example.rw",
    )
    resp = client.get(
        f"/api/v1/inquiries/{created['id']}/status",
        params={"token": created["receipt_token"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"id", "status", "created_at", "updated_at"}
    assert body["status"] == "RECEIVED"
    serialized = resp.text
    assert "private message" not in serialized
    assert "someone@example.rw" not in serialized


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
