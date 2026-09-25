"""Crop reference endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.repositories import dataset_repository as repo
from app.schemas.crop import CropOut

router = APIRouter(prefix="/crops", tags=["crops"])


@router.get("", response_model=list[CropOut])
def list_crops() -> list[CropOut]:
    df = repo.crops()
    return [
        CropOut(
            crop_code=row["crop_code"],
            crop_name=row["crop_name"],
            category=row.get("category"),
            kinyarwanda_name=row.get("kinyarwanda_name"),
            perishability=row.get("perishability"),
            cold_chain_recommended=bool(row.get("cold_chain_recommended")),
        )
        for _, row in df.iterrows()
    ]
