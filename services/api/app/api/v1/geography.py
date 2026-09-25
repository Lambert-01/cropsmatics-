"""Geography reference endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.repositories import dataset_repository as repo
from app.schemas.geography import DistrictOut, ProvinceOut

router = APIRouter(prefix="/geography", tags=["geography"])


@router.get("/districts", response_model=list[DistrictOut])
def list_districts() -> list[DistrictOut]:
    df = repo.districts()
    return [
        DistrictOut(
            district_code=row["district_code"],
            district=row["district"],
            province=row.get("province"),
            agro_ecological_zone=row.get("agro_ecological_zone"),
        )
        for _, row in df.iterrows()
    ]


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
