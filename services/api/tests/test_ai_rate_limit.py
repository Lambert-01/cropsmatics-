"""Focused tests for the assistant's bounded, privacy-preserving limiter."""

from __future__ import annotations

import pytest

from app.ai.rate_limit import AssistantRateLimiter, AssistantRateLimitExceeded


def test_limiter_blocks_after_the_configured_window_budget():
    limiter = AssistantRateLimiter(max_requests=2, window_seconds=60)
    limiter.check("hashed-user", now=100.0)
    limiter.check("hashed-user", now=101.0)

    with pytest.raises(AssistantRateLimitExceeded) as error:
        limiter.check("hashed-user", now=102.0)

    assert error.value.retry_after == 58


def test_limiter_allows_a_request_after_old_events_expire():
    limiter = AssistantRateLimiter(max_requests=1, window_seconds=10)
    limiter.check("hashed-user", now=100.0)
    limiter.check("hashed-user", now=110.1)


def test_different_privacy_keys_have_independent_budgets():
    limiter = AssistantRateLimiter(max_requests=1, window_seconds=60)
    limiter.check("digest-a", now=100.0)
    limiter.check("digest-b", now=100.0)


def test_assistant_endpoint_returns_retryable_429_when_quota_is_exhausted(client):
    from app.ai.rate_limit import reset_rate_limiter
    from app.core.config import get_settings

    settings = get_settings()
    original = (
        settings.ai_rate_limit_requests,
        settings.ai_rate_limit_window_seconds,
        settings.ai_rate_limit_max_keys,
    )
    try:
        settings.ai_rate_limit_requests = 1
        settings.ai_rate_limit_window_seconds = 60
        settings.ai_rate_limit_max_keys = 100
        reset_rate_limiter()

        first = client.post("/api/v1/assistant/query", json={"question": "hello"})
        second = client.post("/api/v1/assistant/query", json={"question": "hello again"})

        assert first.status_code == 200
        assert second.status_code == 429
        assert second.headers["retry-after"]
        assert second.json()["detail"]["code"] == "ASSISTANT_RATE_LIMITED"
    finally:
        (
            settings.ai_rate_limit_requests,
            settings.ai_rate_limit_window_seconds,
            settings.ai_rate_limit_max_keys,
        ) = original
        reset_rate_limiter()
