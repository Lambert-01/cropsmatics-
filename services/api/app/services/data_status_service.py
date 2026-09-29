"""Canonical data status: version, coverage, and the data dictionary.

PostgreSQL is preferred and the processed CSVs are the fallback. Which one
answered is always reported, so a caller can distinguish "the canonical database
says this period has 30 districts" from "the pipeline's files say so because no
database is configured here".

The fallback is deliberately automatic rather than a config switch: a fresh
clone, CI, and a deploy whose migration has not run yet all keep working, and
none of them can silently present CSV values as database values.
"""

from __future__ import annotations

from app.data.catalogue import (
    DOMAIN_ORDER,
    INDICATORS,
    INDICATORS_BY_CODE,
    UNITS_BY_CODE,
)
from app.repositories import canonical_repository as canonical
from app.services import meta_service

LIMITATIONS_DB = [
    "Values are read from the canonical PostgreSQL tables and exclude rows flagged synthetic.",
    "Only published periods appear; a period with no rows is absent rather than shown as zero.",
]

LIMITATIONS_CSV = [
    "PostgreSQL is not serving canonical data in this environment, so the processed "
    "pipeline files answered instead.",
    "Run `make migrate` and `python scripts/data/load_postgres.py` to make the canonical "
    "database authoritative.",
]


def _envelope(data: dict, source: str) -> dict:
    return {
        "data": data,
        "source": source,
        "generated_at": canonical.generated_at(),
        "limitations": LIMITATIONS_DB if source == "postgres" else LIMITATIONS_CSV,
    }


def version() -> dict:
    """Identify the dataset build and what is loaded, canonical if possible."""
    probe = canonical.probe()
    if probe["availability"] != "ready":
        payload = meta_service.data_version()
        payload["canonical"] = {
            "availability": probe["availability"],
            "reason": probe["reason"],
        }
        return _envelope(payload, "processed_csv")

    payload = canonical.current_version() or {}
    payload["counts"] = canonical.entity_counts()
    payload["canonical"] = {"availability": "ready", "reason": None}
    return _envelope(payload, "postgres")


def coverage() -> dict:
    """Which period is covered at which geographic level, and by how much."""
    probe = canonical.probe()
    if probe["availability"] != "ready":
        payload = meta_service.coverage()
        payload["canonical"] = {
            "availability": probe["availability"],
            "reason": probe["reason"],
        }
        return _envelope(payload, "processed_csv")

    rows = canonical.coverage_rows()
    periods = sorted({row["period"] for row in rows})
    return _envelope(
        {
            "periods": periods,
            "details": rows,
            "counts": canonical.entity_counts(),
            "canonical": {"availability": "ready", "reason": None},
        },
        "postgres",
    )


def indicators() -> dict:
    """The machine-readable data dictionary.

    Served from the database when it has been seeded; otherwise from the same
    catalogue module the loader seeds the database from, so the two can only
    disagree if an unapplied change is in flight.
    """
    probe = canonical.probe()
    source = "postgres"
    rows: list[dict]
    if probe["availability"] == "ready":
        rows = canonical.indicator_rows()
        if not rows:
            source = "catalogue"
            rows = _catalogue_rows()
    else:
        source = "catalogue"
        rows = _catalogue_rows()

    for row in rows:
        unit = UNITS_BY_CODE.get(row["unit_code"])
        row["unit_name"] = unit.name if unit else None
        row["unit_dimension"] = unit.dimension if unit else None
        definition = INDICATORS_BY_CODE.get(row["indicator_code"])
        row["source_files"] = [definition.source_file] if definition else []

    rows.sort(key=lambda row: (DOMAIN_ORDER.index(row["domain"]) if row["domain"] in DOMAIN_ORDER else 99, row["indicator_code"]))
    return {
        "indicators": rows,
        "source": source,
        "generated_at": canonical.generated_at(),
        "count": len(rows),
    }


def _catalogue_rows() -> list[dict]:
    return [
        {
            "indicator_code": item.code,
            "name": item.name,
            "description": item.description or None,
            "unit_code": item.unit,
            "domain": item.domain,
            "geographic_levels": list(item.geographic_levels),
            "has_crop_dimension": item.has_crop_dimension,
        }
        for item in INDICATORS
    ]
