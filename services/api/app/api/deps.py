"""Shared FastAPI dependencies (DB session, current user, RBAC)."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import JWTError, decode_token
from app.db.session import get_db
from app.models.farm import FarmerProfile

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{get_settings().api_v1_prefix}/auth/login", auto_error=False
)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(token: Annotated[str | None, Depends(oauth2_scheme)]) -> dict:
    """Decode the bearer token. Does not hit the DB yet (kept swappable).

    Only an *access* token is accepted: a refresh token is long-lived by design
    and must not be usable as a bearer credential.
    """
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except JWTError as exc:  # also covers expired signatures
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    if payload.get("type", "access") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an access token")
    return {"id": payload.get("sub"), "roles": payload.get("roles", [])}


CurrentUser = Annotated[dict, Depends(get_current_user)]


def get_current_farmer_profile(user: CurrentUser, db: DbSession) -> FarmerProfile:
    """The ownership anchor for operational records (farms, harvests).

    Every account has at most one ``FarmerProfile``; it is created on first use
    so a fresh registration can immediately own uploaded records. Creation is
    left uncommitted here: the route's own commit decides, and an error raised
    before it rolls the whole request back.

    Ownership is checked against this profile id on create, lookup, replay,
    linking and risk access - a bearer token for account B never reads or
    relinks account A's records.
    """
    try:
        user_id = uuid.UUID(str(user.get("id")))
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid subject") from None

    profile = db.query(FarmerProfile).filter(FarmerProfile.user_id == user_id).one_or_none()
    if profile is None:
        profile = FarmerProfile(user_id=user_id)
        try:
            # The unique user_id constraint makes concurrent first requests
            # converge on one ownership anchor instead of creating profiles
            # that later make ownership queries ambiguous.
            with db.begin_nested():
                db.add(profile)
                db.flush()
        except IntegrityError:
            profile = (
                db.query(FarmerProfile)
                .filter(FarmerProfile.user_id == user_id)
                .one()
            )
    return profile


CurrentFarmerProfile = Annotated[FarmerProfile, Depends(get_current_farmer_profile)]


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
