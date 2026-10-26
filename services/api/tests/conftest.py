"""Shared pytest fixtures for API tests (no database required).

Two things are pinned before the application is imported:

* a throwaway ``JWT_SECRET``, so settings never read a real secret;
* an **unreachable** ``DATABASE_URL``, so the suite can never connect to whatever
  database the developer happens to have in ``.env``. The readiness probe is a
  real code path, so pointing it at port 1 keeps tests hermetic and fast, and
  guarantees the canonical layer reports itself unavailable rather than
  depending on the network.

Integration tests that genuinely need PostgreSQL read an explicit connection
string (see ``tests/test_canonical_integration.py``) and skip when it is absent.
CI provides that string from a real ``postgres:16`` service container, so the
canonical integration suite runs there rather than being skipped by default.
"""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault(
    "DATABASE_URL",
    # Port 1 is never listening, so a connection is refused immediately instead
    # of hanging. No credentials, nothing to leak.
    "postgresql+psycopg://test:test@127.0.0.1:1/cropmatics_test",
)


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_assistant_rate_limit():
    """Keep the session client from sharing quota across unrelated tests."""
    from app.ai.rate_limit import reset_rate_limiter

    reset_rate_limiter()
    yield
    reset_rate_limiter()
