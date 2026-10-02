"""Geography reference endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.repositories import dataset_repository as repo
from app.schemas.geography import DistrictOut, ProvinceOut
from app.services import slugs

router = APIRouter(prefix="/geography", tags=["geography"])


def _to_out(row: dict) -> DistrictOut:
    return DistrictOut(
        district_code=row["district_code"],
        district=row["district"],
        province=row.get("province"),
        agro_ecological_zone=row.get("agro_ecological_zone"),
    )


@router.get("/districts", response_model=list[DistrictOut])
def list_districts() -> list[DistrictOut]:
    df = repo.districts()
    return [_to_out(dict(row)) for _, row in df.iterrows()]


@router.get("/districts/{slug}", response_model=DistrictOut)
def get_district(slug: str) -> DistrictOut:
    """Look a district up by ``district_code`` (``RW-NO-RUL``) or slug."""
    row = slugs.resolve_district_slug(slug)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "district not found")
    return _to_out(row)


@router.get("/provinces", response_model=list[ProvinceOut])
def list_provinces() -> list[ProvinceOut]:
    df = repo.districts()
    out: list[ProvinceOut] = []
    for province, group in df.groupby("province", sort=True):
        out.append(
            ProvinceOut(
                province=str(province),
                districts=[
                    DistrictOut(
                        district_code=r["district_code"],
                        district=r["district"],
                        province=r.get("province"),
                        agro_ecological_zone=r.get("agro_ecological_zone"),
                    )
                    for _, r in group.iterrows()
                ],
            )
        )
    return out
