"""Crop reference endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.repositories import dataset_repository as repo
from app.schemas.crop import CropOut
from app.services import slugs

router = APIRouter(prefix="/crops", tags=["crops"])


def _to_out(row: dict) -> CropOut:
    return CropOut(
        crop_code=row["crop_code"],
        crop_name=row["crop_name"],
        category=row.get("category"),
        kinyarwanda_name=row.get("kinyarwanda_name"),
        perishability=row.get("perishability"),
        cold_chain_recommended=bool(row.get("cold_chain_recommended")),
    )


@router.get("", response_model=list[CropOut])
def list_crops() -> list[CropOut]:
    df = repo.crops()
    return [_to_out(dict(row)) for _, row in df.iterrows()]


@router.get("/{slug}", response_model=CropOut)
def get_crop(slug: str) -> CropOut:
    """Look a crop up by ``crop_code`` (``CROP-MAI``) or slug (``maize``).

    URL-safe entity routes: the client never has to interpolate a raw crop name
    such as ``Irish Potato`` into a path.
    """
    row = slugs.resolve_crop_slug(slug)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "crop not found")
    return _to_out(row)
