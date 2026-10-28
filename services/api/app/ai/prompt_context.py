"""Small, bounded evidence views used in model-facing prompts.

The complete evidence bundle remains server-side for validation, citations and
the deterministic answer. Providers only need a compact view to write prose;
keeping that view bounded avoids request-size failures on hosted APIs.
"""

from __future__ import annotations

from app.ai.evidence import EvidenceBundle, EvidenceItem

MAX_INITIAL_ITEMS = 24
MAX_ITEMS_PER_RESULT = 12
MAX_RETRIEVED_TEXT = 1800


def item_payload(item: EvidenceItem) -> dict:
    """Return the attributable fields a model needs, without null padding."""
    payload = {
        "evidence_id": item.evidence_id,
        "kind": item.kind.value,
        "metric": item.metric,
        "value": item.value,
        "unit": item.unit,
        "period_code": item.period_code,
        "district": item.district,
        "crop": item.crop,
        "source_id": item.source_id,
        "source_workbook": item.source_workbook,
        "source_sheets": item.source_sheets,
        "metric_source_map": item.metric_source_map,
        "source_row_min": item.source_row_min,
        "geography_level": item.geography_level,
        "province": item.province,
        "method": item.method,
        "note": item.note,
    }
    return {key: value for key, value in payload.items() if value is not None}


def evidence_summary(bundle: EvidenceBundle) -> dict:
    """Build the bounded evidence envelope sent to a provider."""
    return {
        "intent": bundle.intent,
        "requested": bundle.requested,
        "items": [item_payload(item) for item in bundle.items[:MAX_INITIAL_ITEMS]],
        "items_available": len(bundle.items),
        "limitations": bundle.limitations,
        "missing_data": bundle.missing_data,
    }


def retrieved_summary(bundle: EvidenceBundle) -> list[dict]:
    """Keep explanatory documents useful without copying whole documents."""
    documents: list[dict] = []
    for document in bundle.retrieved:
        text = str(document.get("text") or "")
        documents.append(
            {
                "id": document.get("id"),
                "title": document.get("title"),
                "category": document.get("category"),
                "text": text[:MAX_RETRIEVED_TEXT],
            }
        )
    return documents
