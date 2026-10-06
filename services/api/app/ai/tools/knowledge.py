"""The knowledge-base tool: explanatory retrieval, clearly not a fact source.

Every item this tool emits is :class:`EvidenceKind.CONTEXT`. That is the mechanism
that keeps RAG separate from observation: a document can explain *how* a gap is
computed, but it can never be cited as *what* the gap is, because it carries no
published value for a district, crop or period.
"""

from __future__ import annotations

from app.ai import knowledge_base
from app.ai.evidence import EvidenceItem, EvidenceKind


def search_knowledge_base(*, query: str, limit: int = 4) -> list[EvidenceItem]:
    """Rank Cropmatics' explanatory documents against a query."""
    matches = knowledge_base.search(query, limit=limit)
    items: list[EvidenceItem] = []
    for document, _score in matches:
        items.append(
            EvidenceItem(
                evidence_id=f"doc:{document.id}",
                kind=EvidenceKind.CONTEXT,
                metric="knowledge_document",
                value=document.id,
                note=document.title,
                method=(
                    "lexical retrieval over Cropmatics methodology documents; "
                    "explanatory only, never a numerical observation"
                ),
            )
        )
        if document.summary:
            items.append(
                EvidenceItem(
                    evidence_id=f"doc:{document.id}:summary",
                    kind=EvidenceKind.CONTEXT,
                    metric="knowledge_document_summary",
                    value=document.id,
                    # The summary is placed in ``note`` so any constant it names
                    # (a formula coefficient, say) is attributable if the answer
                    # explains the formula.
                    note=document.summary,
                    method=f"document category: {document.category}",
                )
            )
    return items
