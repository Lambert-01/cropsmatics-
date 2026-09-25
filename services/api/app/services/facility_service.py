"""Facility / storage context service.

Serves the verified cold-chain *program context*. Capacity is never invented: the
public source does not provide facility-level capacity, so ``capacity_kg`` stays
null and ``capacity_status`` is ``not_verified``.
"""

from __future__ import annotations

import numpy as np

from app.repositories import dataset_repository as repo


def context(district: str | None = None) -> dict:
    try:
        df = repo.cold_chain_context().replace({np.nan: None})
    except Exception:
        return {
            "capacity_not_verified": True,
            "facilities": [],
            "note": "Cold-chain context dataset not built. Run `make data`.",
            "provenance": {"source_id": "MINAGRI_ACES_COLDCHAIN_2026", "source_period": "2026"},
        }

    if district:
        df = df[df["district"].astype(str).str.lower() == district.lower()]

    facilities = [
        {
            "district": str(row["district"]),
            "district_code": row.get("district_code"),
            "initiative": row.get("initiative"),
            "context": row.get("verified_context"),
            "capacity_kg": row.get("capacity"),
            "capacity_status": row.get("capacity_status") or "not_verified",
            "capacity_note": row.get("capacity_note"),
            "source_id": row.get("source_id"),
        }
        for _, row in df.iterrows()
    ]
    return {
        "capacity_not_verified": True,
        "facilities": facilities,
        "note": "Capacity is intentionally null: public sources do not provide facility-level capacity.",
        "provenance": {
            "source_id": "MINAGRI_ACES_COLDCHAIN_2026",
            "source_period": "2026",
            "method": "public program announcement, transcribed verbatim",
            "limitations": [
                "program context only; no facility coordinates or capacities",
                "not a facility registry",
            ],
        },
    }
