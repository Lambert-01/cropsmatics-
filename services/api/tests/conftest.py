"""Shared pytest fixtures for API tests (no database required)."""

from __future__ import annotations

import os

import pytest

# Ensure settings never read a real secret during tests.
os.environ.setdefault("JWT_SECRET", "test-secret")


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
