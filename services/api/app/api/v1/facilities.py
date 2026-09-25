"""Facility context endpoints.

No facility capacity is fabricated. Until verified capacity snapshots exist, this
endpoint returns the public cold-chain **context** and marks capacity as
``not_verified``.
"""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/facilities", tags=["facilities"])

CONTEXT_FILE = "08_verified_cold_chain_context_2026.csv"
CONTEXT_SUBDIR = "cropmatics_real_data_2024_2026"


@router.get("/nearby")
def nearby(district: str | None = None) -> dict:
    path = get_settings().raw_dir / CONTEXT_SUBDIR / CONTEXT_FILE
    if not path.exists():
        return {"capacity_not_verified": True, "facilities": [], "note": "context dataset missing"}
    df = pd.read_csv(path)
    if district:
        df = df[df["district"].astype(str).str.lower() == district.lower()]
    facilities = [
        {
            "district": row["district"],
            "initiative": row.get("initiative"),
            "context": row.get("verified_context"),
            "capacity_kg": None,
            "capacity_status": "not_verified",
            "capacity_note": row.get("capacity_note") or row.get("capacity") or "not verified",
        }
        for _, row in df.iterrows()
    ]
    return {
        "capacity_not_verified": True,
        "facilities": facilities,
        "note": "Capacity is intentionally null: public sources do not provide facility-level capacity.",
    }
