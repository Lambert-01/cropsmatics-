"""Farm profile upload schemas (offline-first mobile sync)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class FarmCreate(BaseModel):
    district: str
    name: str | None = Field(default=None, max_length=160)
    sector: str | None = Field(default=None, max_length=64)
    farm_size_ha: float | None = Field(default=None, ge=0)
    # Stored for the profile's own record; never returned by the API.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    # Offline-first: client generates the UUID so a retried upload is
    # idempotent instead of creating a duplicate profile.
    client_uuid: str | None = Field(default=None, max_length=64)


class FarmOut(BaseModel):
    id: str
    client_uuid: str | None = None
    district: str | None = None
    name: str | None = None
    farm_size_ha: float | None = None
