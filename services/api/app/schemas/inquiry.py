"""Information-inquiry schemas.

Anonymous-first: every contact field is optional, and a submission with no contact
details is a first-class, supported case.

Privacy contract
----------------

* ``InquiryReceipt`` is returned exactly once, at creation. It contains the
  secret ``receipt_token`` the submitter uses to read their own inquiry back.
* ``InquiryStatusOut`` is the *only* public read model. It never carries the
  message, the contact name, the email or the organisation.
* There is no public list model — an anonymous visitor cannot enumerate other
  people's inquiries.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

InquiryStatus = Literal["RECEIVED", "REVIEWING", "ANSWERED", "CLOSED"]

TOPICS = (
    "Data question",
    "Request dataset access",
    "Methodology clarification",
    "Report an error",
    "Partnership or collaboration",
    "Other",
)


class InquiryIn(BaseModel):
    topic: str = Field(min_length=2, max_length=120)
    crop: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    message: str = Field(min_length=5, max_length=4000)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: str | None = Field(default=None, max_length=254)
    organization: str | None = Field(default=None, max_length=160)
    # Idempotency key created on the device, so a queued offline submission can
    # be retried without creating duplicates.
    client_uuid: str | None = Field(default=None, max_length=64)

    @field_validator("contact_email")
    @classmethod
    def _check_email(cls, value: str | None) -> str | None:
        """Reject obvious non-addresses without adding an email dependency."""
        if value is None or not value.strip():
            return None
        candidate = value.strip()
        local, _, domain = candidate.partition("@")
        if not local or not domain or "." not in domain or " " in candidate:
            raise ValueError("contact_email must be a valid email address")
        return candidate

    @field_validator("topic", "message")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


class InquiryReceipt(BaseModel):
    """Returned once at creation. The caller must store ``receipt_token``."""

    id: str
    receipt_token: str
    status: InquiryStatus = "RECEIVED"
    created_at: str
    # A short human-friendly reference derived from the id (no PII).
    reference: str


class InquiryStatusOut(BaseModel):
    """Public, sanitized status projection — no message and no contact details."""

    id: str
    status: InquiryStatus = "RECEIVED"
    created_at: str
    updated_at: str | None = None
