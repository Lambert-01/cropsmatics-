"""Crop schemas."""

from __future__ import annotations

from pydantic import BaseModel


class CropOut(BaseModel):
    crop_code: str
    crop_name: str
    category: str | None = None
    kinyarwanda_name: str | None = None
    perishability: str | None = None
    cold_chain_recommended: bool | None = None
