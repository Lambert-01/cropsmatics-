"""Metadata tools: what a figure came from, and which models actually exist.

These ground *statements about the platform* rather than about agriculture, so an
explanation can cite a real source id or a real model card instead of describing
provenance from memory.
"""

from __future__ import annotations

from app.ai.evidence import EvidenceItem, EvidenceKind
from app.repositories import dataset_repository as repo
from app.services import meta_service


def source_metadata(*, source_id: str | None = None) -> list[EvidenceItem]:
    """Registered sources, optionally filtered to one id."""
    try:
        rows = meta_service.sources()
    except Exception:
        rows = []

    items: list[EvidenceItem] = []
    for row in rows:
        identifier = str(row.get("source_id") or "")
        if source_id and identifier != source_id:
            continue
        items.append(
            EvidenceItem(
                evidence_id=f"source:{identifier}",
                kind=EvidenceKind.CONTEXT,
                metric="source",
                value=identifier or None,
                period_code=None if row.get("source_period") is None else str(row["source_period"]),
                source_id=identifier or None,
                note=None if row.get("title") is None else str(row["title"]),
            )
        )
    return items


def source_registry(*, query: str | None = None) -> list[EvidenceItem]:
    """The curated source registry (owner, type, access, limitations)."""
    try:
        frame = repo.curated_sources()
    except Exception:
        return []
    if frame.empty:
        return []

    items: list[EvidenceItem] = []
    for _, row in frame.iterrows():
        dataset = str(row.get("dataset") or "")
        if query and query.lower() not in dataset.lower():
            continue
        items.append(
            EvidenceItem(
                evidence_id=f"registry:{dataset}",
                kind=EvidenceKind.CONTEXT,
                metric="source_registry_entry",
                value=dataset or None,
                source_id=None if row.get("owner") is None else str(row["owner"]),
                note=None if row.get("limitations") is None else str(row["limitations"]),
            )
        )
    return items


def model_metadata() -> list[EvidenceItem]:
    """Model cards that actually exist. Empty when nothing is registered."""
    try:
        cards = meta_service.models()
    except Exception:
        return []

    items: list[EvidenceItem] = []
    for card in cards:
        name = str(card.get("name") or "model")
        version = card.get("version")
        for metric in ("mae", "rmse", "r2"):
            value = card.get(metric)
            if value is None:
                continue
            items.append(
                EvidenceItem(
                    evidence_id=f"model:{name}:{metric}",
                    kind=EvidenceKind.MODELLED,
                    metric=f"model_{metric}",
                    value=round(float(value), 4),
                    unit=None,
                    source_id=name,
                    method=(
                        "registered model card; validation method "
                        f"{card.get('validation_method') or 'not stated'}"
                    ),
                    note=f"{name} {version or ''}".strip(),
                )
            )
    return items
