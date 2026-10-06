"""Document retrieval over Cropmatics' explanatory knowledge.

This is the RAG half of the assistant, and it is deliberately the *only* half that
retrieves prose. The separation is the whole point:

* a **numerical fact** ("maize yield in Gisagara was 1,159 kg/ha") comes from the
  tool layer and the canonical database, and never from here;
* an **explanatory statement** ("the gap index is 100 x (median - observed) /
  median") comes from these documents.

The retriever is a dependency-free lexical ranker (a small BM25), chosen over an
embedding store because it is deterministic, auditable and works offline: the same
question returns the same documents on a laptop, in CI and on a server with no
model endpoint. Documents are curated markdown-like records, not scraped text, so
a retrieval result can be trusted enough to show a user.

If embedding-based retrieval is added later, it replaces ``search`` and nothing
else - the tool, the evidence contract and the "explanatory only" rule stay.
"""

from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

DOCS_PATH = Path(__file__).parent / "knowledge" / "documents.jsonl"

_TOKEN = re.compile(r"[a-z0-9]+")

#: Very common words carry no retrieval signal.
STOPWORDS: frozenset[str] = frozenset(
    {
        "the", "a", "an", "of", "to", "in", "is", "are", "was", "were", "and", "or",
        "for", "on", "at", "by", "with", "as", "it", "this", "that", "be", "how",
        "what", "why", "do", "does", "you", "i", "we", "me", "my", "your",
    }
)

#: BM25 parameters. Standard values; not tuned, because the corpus is small and
#: curated, and an untuned-but-explainable ranker beats a tuned black box here.
_K1 = 1.5
_B = 0.75

#: Window weights: a term in the title is stronger evidence of relevance than a
#: term buried in the body.
_TITLE_WEIGHT = 3
_TAG_WEIGHT = 2


class Document(BaseModel):
    """One explanatory record. Not a source of numerical observations."""

    id: str
    title: str
    category: str
    tags: list[str] = Field(default_factory=list)
    summary: str = ""
    text: str = ""


def _tokens(value: str) -> list[str]:
    return [
        token
        for token in _TOKEN.findall((value or "").lower())
        if token not in STOPWORDS and len(token) > 1
    ]


@lru_cache(maxsize=1)
def load_documents() -> tuple[Document, ...]:
    """Load the curated corpus once per process."""
    if not DOCS_PATH.exists():
        return ()
    documents: list[Document] = []
    for line in DOCS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            documents.append(Document(**json.loads(line)))
    return tuple(documents)


def categories() -> list[str]:
    return sorted({document.category for document in load_documents()})


@lru_cache(maxsize=1)
def _index() -> tuple[dict[str, float], list[dict[str, int]], float]:
    """Build the inverted index: idf per term, weighted term counts, avg length.

    The weighted counts fold in the title and tag boosts, so scoring stays a
    single lookup rather than special-casing fields at query time.
    """
    documents = load_documents()
    df: dict[str, int] = {}
    counts: list[dict[str, int]] = []
    lengths: list[int] = []

    for document in documents:
        weighted: dict[str, int] = {}
        for token in _tokens(document.text):
            weighted[token] = weighted.get(token, 0) + 1
        for token in _tokens(document.summary):
            weighted[token] = weighted.get(token, 0) + 1
        for token in _tokens(" ".join(document.tags)):
            weighted[token] = weighted.get(token, 0) + _TAG_WEIGHT
        for token in _tokens(document.title):
            weighted[token] = weighted.get(token, 0) + _TITLE_WEIGHT
        counts.append(weighted)
        lengths.append(sum(weighted.values()) or 1)
        for token in weighted:
            df[token] = df.get(token, 0) + 1

    total = max(len(documents), 1)
    idf = {term: math.log(1 + (total - freq + 0.5) / (freq + 0.5)) for term, freq in df.items()}
    average_length = sum(lengths) / total if lengths else 1.0
    return idf, counts, average_length


def search(
    query: str, *, limit: int = 4, category: str | None = None
) -> list[tuple[Document, float]]:
    """Rank documents against a query. Returns ``(document, score)`` pairs."""
    documents = load_documents()
    if not documents or not query:
        return []
    idf, counts, average_length = _index()

    query_terms = _tokens(query)
    if not query_terms:
        return []

    scored: list[tuple[int, float]] = []
    for index, document in enumerate(documents):
        if category and document.category != category:
            continue
        weighted = counts[index]
        length = sum(weighted.values()) or 1
        score = 0.0
        for term in query_terms:
            frequency = weighted.get(term, 0)
            if not frequency:
                continue
            term_idf = idf.get(term, 0.0)
            denominator = frequency + _K1 * (1 - _B + _B * length / average_length)
            score += term_idf * (frequency * (_K1 + 1)) / denominator
        if score > 0:
            scored.append((index, score))

    scored.sort(key=lambda item: item[1], reverse=True)
    return [(documents[index], round(score, 6)) for index, score in scored[:limit]]


def get(document_id: str) -> Document | None:
    for document in load_documents():
        if document.id == document_id:
            return document
    return None
