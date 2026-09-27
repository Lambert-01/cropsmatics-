"""Information-inquiry endpoints.

Anonymous-first: contact details are optional and a submission without them is
fully supported. Submissions are written to an append-only local store (see
``app.services.inquiry_service``) so the endpoint keeps working when the optional
relational database is not configured.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.inquiry import TOPICS, InquiryIn, InquiryListOut, InquiryOut
from app.services import inquiry_service

router = APIRouter(prefix="/inquiries", tags=["inquiries"])

_OMIT = ("client_uuid",)


def _out(row: dict) -> InquiryOut:
    return InquiryOut(**{k: v for k, v in row.items() if k not in _OMIT})


@router.get("/topics")
def topics() -> dict:
    """Suggested inquiry topics (static vocabulary, not data-derived)."""
    return {"topics": list(TOPICS)}


@router.post("", response_model=InquiryOut, status_code=status.HTTP_201_CREATED)
def create(payload: InquiryIn) -> InquiryOut:
    return _out(inquiry_service.create(payload.model_dump()))


@router.get("", response_model=InquiryListOut)
def list_inquiries(limit: int = Query(50, ge=1, le=200)) -> InquiryListOut:
    rows = inquiry_service.list_recent(limit=limit)
    return InquiryListOut(count=len(rows), inquiries=[_out(row) for row in rows])


@router.get("/{inquiry_id}", response_model=InquiryOut)
def get_inquiry(inquiry_id: str) -> InquiryOut:
    row = inquiry_service.get(inquiry_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "inquiry not found")
    return _out(row)
