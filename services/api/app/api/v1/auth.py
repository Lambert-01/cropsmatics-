"""Authentication endpoints (register / login / refresh / me)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Body, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models.enums import RoleName
from app.models.user import Role, User, UserRole
from app.schemas.auth import TokenPair, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])


def _ensure_role(db, name: str) -> Role:
    role = db.query(Role).filter(Role.name == name).one_or_none()
    if role is None:
        role = Role(name=name, description=name.replace("_", " ").title())
        db.add(role)
        db.flush()
    return role


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: DbSession) -> TokenPair:
    if db.query(User).filter(User.email == payload.email).one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        preferred_language=payload.preferred_language,
    )
    db.add(user)
    db.flush()

    role = _ensure_role(db, RoleName.FARMER.value)
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()

    roles = [RoleName.FARMER.value]
    return TokenPair(
        access_token=create_access_token(str(user.id), extra={"roles": roles}),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenPair)
def login(payload: UserLogin, db: DbSession) -> TokenPair:
    user = db.query(User).filter(User.email == payload.email).one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    roles = [ur.role.name for ur in user.roles] if user.roles else [RoleName.FARMER.value]
    return TokenPair(
        access_token=create_access_token(str(user.id), extra={"roles": roles}),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenPair)
def refresh(refresh_token: str = Body(..., embed=True)) -> TokenPair:
    try:
        payload = decode_token(refresh_token)
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not a refresh token")
    subject = payload.get("sub")
    return TokenPair(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, db: DbSession) -> UserOut:
    try:
        uid = uuid.UUID(str(user["id"]))
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid subject") from None
    db_user = db.get(User, uid)
    if db_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    return UserOut(
        id=str(db_user.id),
        email=db_user.email,
        full_name=db_user.full_name,
        preferred_language=db_user.preferred_language,
        roles=user.get("roles", []),
    )
