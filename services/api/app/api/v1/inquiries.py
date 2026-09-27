"""Information-inquiry endpoints.

Privacy-first design. There are exactly two public endpoints:

* ``POST /inquiries`` — submit an inquiry, receive a secret receipt token.
* ``GET  /inquiries/topics`` — the static topic vocabulary.

There is deliberately **no public list endpoint** and no bare
``GET /inquiries/{id}``: an anonymous visitor must never be able to enumerate or
read other people's submissions or contact details. Status can be read only by
presenting the secret ``receipt_token`` issued at creation, and even then the
response is a sanitized projection (id / status / timestamps).

Administrative listing is intentionally absent until real admin authorization is
in place. ``inquiry_service.list_recent`` exists for internal tooling only.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.inquiry import (
    TOPICS,
    InquiryIn,
    InquiryReceipt,
    InquiryStatusOut,
)
from app.services import inquiry_service

router = APIRouter(prefix="/inquiries", tags=["inquiries"])


def _reference(inquiry_id: str) -> str:
    """Stable, non-secret, human-friendly reference (no PII, not reversible)."""
    return "CROPM-" + inquiry_id.replace("-", "")[:10].upper()


@router.get("/topics")
def topics() -> dict:
    """Suggested inquiry topics (static vocabulary, not data-derived)."""
    return {"topics": list(TOPICS)}


@router.post("", response_model=InquiryReceipt, status_code=status.HTTP_201_CREATED)
def create(payload: InquiryIn) -> InquiryReceipt:
    row = inquiry_service.create(payload.model_dump())
    return InquiryReceipt(
        id=row["id"],
        receipt_token=row["receipt_token"],
        status=row.get("status", "RECEIVED"),
        created_at=row["created_at"],
        reference=_reference(row["id"]),
    )


@router.get("/{inquiry_id}/status", response_model=InquiryStatusOut)
def inquiry_status(
    inquiry_id: str,
    token: str = Query(..., min_length=16, max_length=128),
) -> InquiryStatusOut:
    """Read back the status of *your own* inquiry using its receipt token.

    A wrong token is indistinguishable from a missing inquiry (404), so an
    attacker cannot confirm whether an id exists.
    """
    row = inquiry_service.get_by_receipt(inquiry_id, token)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "inquiry not found")
    return InquiryStatusOut(**inquiry_service.public_status(row))
