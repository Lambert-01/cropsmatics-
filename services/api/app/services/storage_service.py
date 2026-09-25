"""National post-harvest infrastructure and cold-chain program context.

Two official MINAGRI add-on tables feed this service:

* ``national_postharvest_infrastructure.csv`` (Annual Report 2024/2025) --
  national counts and capacities by infrastructure type.
* ``cold_chain_network_summary.csv`` (MINAGRI-ACES 2026) -- program-level
  indicators for the 10-packhouse cold-chain network.

**Level of analysis.** Both are national/program tables. They are never joined
to districts, never attached to a facility marker, and never used to infer a
per-facility capacity. Facility-level capacity and coordinates remain
``not_verified`` / ``not_published`` because the official sources do not publish
them - the service says so explicitly rather than returning an empty or zero
value that a chart could render as a real quantity.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo

# Columns published by the infrastructure table.
_INFRA_FIELDS = [
    "infrastructure_type",
    "existing_number",
    "existing_capacity_mt",
    "new_number",
    "new_capacity_mt",
    "total_number",
    "total_capacity_mt",
    "period",
    "source_url",
]

_PROGRAM_FIELDS = ["indicator", "value", "unit", "notes", "period", "source_url"]

PROGRAM_DISTRICT_INDICATOR = "Program districts named"

NOT_VERIFIED_LIMITATIONS = [
    "national totals only - never assign them to a district or a single facility",
    "facility-level capacity is not published by the official source",
    "exact facility coordinates are not published",
    "program indicators are program-level estimates, not measured outcomes",
]


def _num(value) -> float | int | None:
    """Return a JSON-safe number, preserving null (never coerced to 0)."""
    if value is None:
        return None
    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
        return None
    if isinstance(value, np.integer | int) and not isinstance(value, bool):
        return int(value)
    if isinstance(value, np.floating | float):
        as_float = float(value)
        return int(as_float) if as_float.is_integer() else round(as_float, 3)
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        return None
    return int(as_float) if as_float.is_integer() else round(as_float, 3)


def _text(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and np.isnan(value):
        return None
    text = str(value).strip()
    return text or None


def _infrastructure() -> tuple[list[dict], dict | None]:
    df = repo.postharvest_infrastructure().replace({np.nan: None})
    derived = df[df.get("is_derived_total") == True]  # noqa: E712 - pandas comparison
    published = df[df.get("is_derived_total") != True]  # noqa: E712

    items = [
        {field: (_num(row.get(field)) if field not in ("infrastructure_type", "period", "source_url") else _text(row.get(field))) for field in _INFRA_FIELDS}
        for _, row in published.iterrows()
    ]

    totals: dict | None = None
    if not derived.empty:
        row = derived.iloc[0]
        totals = {
            "existing_number": _num(row.get("existing_number")),
            "existing_capacity_mt": _num(row.get("existing_capacity_mt")),
            "new_number": _num(row.get("new_number")),
            "new_capacity_mt": _num(row.get("new_capacity_mt")),
            "total_number": _num(row.get("total_number")),
            "total_capacity_mt": _num(row.get("total_capacity_mt")),
            "capacity_unit": _text(row.get("capacity_unit")) or "mt",
            "period": _text(row.get("period")),
            "note": "derived sum of the published national rows",
        }
    return items, totals


def _program() -> dict:
    df = repo.cold_chain_network_summary().replace({np.nan: None})
    indicators = [
        {
            "indicator": _text(row.get("indicator")),
            "value": _num(row.get("value")),
            "unit": _text(row.get("unit")),
            "notes": _text(row.get("notes")),
            "period": _text(row.get("period")),
            "source_url": _text(row.get("source_url")),
        }
        for _, row in df.iterrows()
    ]

    districts: list[str] = []
    district_row = df[df.get("indicator") == PROGRAM_DISTRICT_INDICATOR]
    if not district_row.empty:
        raw = _text(district_row.iloc[0].get("district_names")) or _text(
            district_row.iloc[0].get("notes")
        )
        districts = [d.strip() for d in str(raw or "").split(",") if d.strip()]

    return {
        "indicators": indicators,
        "program_districts": districts,
        "facility_capacity": None,
        "facility_capacity_status": "not_verified",
        "facility_location_status": "not_published",
        "note": (
            "The 2026 cold-chain announcement names program districts and a "
            "packhouse network but publishes no facility-level capacity or "
            "coordinates. Cropmatics shows 'not verified' instead of a number."
        ),
    }


def infrastructure_summary() -> dict:
    """National infrastructure table + program context for the storage pages."""
    try:
        items, totals = _infrastructure()
        infra_error = None
    except Exception as exc:  # dataset not built yet
        items, totals, infra_error = [], None, str(exc)

    try:
        program = _program()
    except Exception as exc:
        program = {
            "indicators": [],
            "program_districts": [],
            "facility_capacity": None,
            "facility_capacity_status": "not_verified",
            "facility_location_status": "not_published",
            "note": f"cold-chain program table unavailable: {exc}",
        }

    return {
        "level_of_analysis": "national",
        "label": "National totals - not facility-level capacity",
        "items": items,
        "totals": totals,
        "program": program,
        "provenance": {
            "source_id": "MINAGRI_ANNUAL_REPORT_2024_2025_POSTHARVEST_INFRA",
            "source_period": _period_of(items),
            "method": (
                "published MINAGRI national post-harvest infrastructure table plus "
                "program-level cold-chain indicators; values are passed through unchanged"
            ),
            "limitations": NOT_VERIFIED_LIMITATIONS,
            **({"data_error": infra_error} if infra_error else {}),
        },
    }


def _period_of(items: list[dict]) -> str | None:
    for item in items:
        if item.get("period"):
            return str(item["period"])
    return None


def facility_context(district: str | None = None) -> dict:
    """Program districts that are relevant to a district selection.

    Used by the storage mobile/API layer to answer "is my district part of the
    verified program?" without implying a facility exists at a specific point.
    """
    try:
        df = repo.cold_chain_context()
    except Exception:
        return {"district_in_program": None, "program_districts": [], "capacity": None}

    df = df.replace({np.nan: None})
    districts = sorted({str(d) for d in df["district"].dropna().unique()})
    matched = None
    if district:
        matched = district.strip().lower() in {d.lower() for d in districts}
    return {
        "district_in_program": matched,
        "program_districts": districts,
        "capacity": None,
        "capacity_status": "not_verified",
    }


def to_frame() -> pd.DataFrame:
    """Raw national infrastructure frame (used by report exports and tests)."""
    return repo.postharvest_infrastructure()
