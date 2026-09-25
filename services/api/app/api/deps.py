"""Shared FastAPI dependencies (DB session, current user, RBAC)."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import JWTError, decode_token
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{get_settings().api_v1_prefix}/auth/login", auto_error=False
)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(token: Annotated[str | None, Depends(oauth2_scheme)]) -> dict:
    """Decode the bearer token. Does not hit the DB yet (kept swappable)."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except JWTError as exc:  # pragma: no cover - jose raises JWTError
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    return {"id": payload.get("sub"), "roles": payload.get("roles", [])}


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_roles(*allowed: str):
    """Dependency factory enforcing server-side RBAC."""

    def _checker(user: CurrentUser) -> dict:
        if not allowed:
            return user
        if not set(user.get("roles", [])) & set(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed)}",
            )
        return user

    return _checker


def db_session() -> Iterator[Session]:
    """Back-compat alias for tests importing ``db_session``."""
    yield from get_db()
