"""Geography schemas."""

from __future__ import annotations

from pydantic import BaseModel


class DistrictOut(BaseModel):
    district_code: str
    district: str
    province: str | None = None
    agro_ecological_zone: str | None = None


class ProvinceOut(BaseModel):
    province: str
    districts: list[DistrictOut] = []
