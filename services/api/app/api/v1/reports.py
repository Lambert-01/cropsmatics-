"""Reporting endpoints built from processed analytical tables."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, HTTPException, status

from app.repositories import dataset_repository as repo
from app.schemas.common import Provenance

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/district-summary")
def district_summary(district: str) -> dict:
    df = repo.training_dataset()
    sub = df[df["district"].astype(str).str.lower() == district.lower()]
    if sub.empty:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no data for district: {district}")

    valid = sub[sub["yield_kg_ha"].fillna(0) > 0]
    by_crop = (
        valid.groupby("canonical_crop_name")
        .agg(
            crop_yield_median_kg_ha=("yield_kg_ha", "median"),
            production_mt=("production_mt", "sum"),
            harvested_area_ha=("harvested_area_ha", "sum"),
        )
        .reset_index()
        .rename(columns={"canonical_crop_name": "crop"})
    )
    by_crop = by_crop.where(pd.notna(by_crop), None)
    return {
        "district": district,
        "crops": by_crop.to_dict(orient="records"),
        "provenance": Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period="2025-B",
            method="aggregation of processed district x crop table",
            limitations=["district aggregates; within-district variation is not shown"],
        ).model_dump(),
    }
