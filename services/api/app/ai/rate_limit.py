"""Privacy-preserving rate limiting for the grounded assistant.

Only a keyed digest is retained in memory. Raw IP addresses, bearer tokens and
questions are never stored by this limiter. Authenticated users are keyed by
their token subject; anonymous callers fall back to the connection address (or
the first forwarded address only when explicitly trusted by configuration).
"""

from __future__ import annotations

import hashlib
import hmac
import threading
import time
from collections import deque

from fastapi import Request

from app.core.config import get_settings
from app.core.security import JWTError, decode_token


class AssistantRateLimitExceeded(RuntimeError):
    def __init__(self, retry_after: int) -> None:
        self.retry_after = max(1, int(retry_after))
        super().__init__("assistant request rate limit exceeded")


class AssistantRateLimiter:
    """Bounded sliding-window limiter suitable for one API process."""

    def __init__(self, *, max_requests: int = 60, window_seconds: int = 60, max_keys: int = 10_000):
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1, int(window_seconds))
        self.max_keys = max(1, int(max_keys))
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, *, now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        with self._lock:
            events = self._events.setdefault(key, deque())
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.max_requests:
                retry_after = max(1, int(events[0] + self.window_seconds - current + 0.999))
                raise AssistantRateLimitExceeded(retry_after)
            events.append(current)
            if len(self._events) > self.max_keys:
                oldest = sorted(self._events, key=lambda item: self._events[item][-1] if self._events[item] else 0)
                for old_key in oldest[: len(self._events) - self.max_keys]:
                    self._events.pop(old_key, None)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


def _identity(request: Request) -> str:
    settings = get_settings()
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        try:
            payload = decode_token(token)
            subject = str(payload.get("sub") or "")
            if subject:
                return f"user:{subject}"
        except (JWTError, ValueError, TypeError):
            # An invalid bearer is still rate limited, but never stored or logged.
            return f"bearer:{hashlib.sha256(token.encode()).hexdigest()}"

    host = request.client.host if request.client else "unknown"
    if settings.ai_trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        if forwarded:
            host = forwarded
    return f"anonymous:{host}"


def request_key(request: Request) -> str:
    """Return a one-way, deployment-secret-bound identity key."""
    settings = get_settings()
    return hmac.new(
        settings.jwt_secret.encode(), _identity(request).encode(), hashlib.sha256
    ).hexdigest()


def check_request(request: Request) -> None:
    settings = get_settings()
    limiter = AssistantRateLimiter(
        max_requests=settings.ai_rate_limit_requests,
        window_seconds=settings.ai_rate_limit_window_seconds,
        max_keys=settings.ai_rate_limit_max_keys,
    )
    # Keep a stable process-wide limiter, while allowing tests/config reloads to
    # replace it when the settings change.
    global _LIMITER, _LIMITER_CONFIG
    config = (limiter.max_requests, limiter.window_seconds, limiter.max_keys)
    if _LIMITER_CONFIG != config:
        _LIMITER = limiter
        _LIMITER_CONFIG = config
    _LIMITER.check(request_key(request))


def reset_rate_limiter() -> None:
    """Clear process-local events for hermetic tests and controlled reloads."""
    _LIMITER.clear()


_LIMITER = AssistantRateLimiter()
_LIMITER_CONFIG = (60, 60, 10_000)
