"""Authentication primitives: Argon2 password hashing and JWT tokens.

Nothing here touches the database — pure functions over the configured secret,
so they are easy to unit-test and reuse.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import get_settings

_hasher = PasswordHasher()

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def hash_password(password: str) -> str:
    """Hash a plaintext password with Argon2id."""
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Constant-time password verification."""
    try:
        return _hasher.verify(hashed, password)
    except VerifyMismatchError:
        return False


def _create_token(subject: str, token_type: str, expires_delta: timedelta, extra: dict | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str, extra: dict | None = None) -> str:
    settings = get_settings()
    return _create_token(subject, ACCESS_TOKEN_TYPE, timedelta(minutes=settings.access_token_expire_minutes), extra)


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    return _create_token(subject, REFRESH_TOKEN_TYPE, timedelta(days=settings.refresh_token_expire_days))


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises ``jose.JWTError`` when invalid."""
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


__all__ = [
    "JWTError",
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
]
