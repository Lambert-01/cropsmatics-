"""RAG over methodology, glossary and source metadata.

The property under test above all: retrieval explains *how*, and can never be
mistaken for *what*. Every knowledge item is CONTEXT kind, it is only wired into
explanatory intents, and it is carried in its own field on the bundle.
"""

from __future__ import annotations

from app.ai import knowledge_base, tool_registry
from app.ai.evidence import EvidenceBundle, EvidenceItem, EvidenceKind
from app.ai.handlers import HANDLERS
from app.ai.providers.remote import RemoteConfig, RemoteProvider
from app.ai.schemas import AIRequest, RoutedRequest

# --- the corpus ----------------------------------------------------------------


def test_corpus_loads_with_unique_ids_and_known_categories():
    documents = knowledge_base.load_documents()
    assert documents
    ids = [doc.id for doc in documents]
    assert len(ids) == len(set(ids))
    known = set(knowledge_base.categories())
    for doc in documents:
        assert doc.title
        assert doc.text
        assert doc.category in known


def test_search_ranks_the_relevant_document_first():
    matches = knowledge_base.search("how is the productivity gap computed", limit=3)
    assert matches
    assert matches[0][0].id == "method-gap"


def test_search_finds_the_glossary():
    matches = knowledge_base.search("kinyarwanda glossary of terms", limit=3)
    assert any(doc.id == "glossary-core" for doc, _ in matches)


def test_search_is_deterministic():
    first = [doc.id for doc, _ in knowledge_base.search("season comparison year on year")]
    second = [doc.id for doc, _ in knowledge_base.search("season comparison year on year")]
    assert first == second


# --- the tool is an explanatory allow-list entry -------------------------------


def test_knowledge_tool_is_registered_and_has_a_handler():
    assert "search_knowledge_base" in tool_registry.TOOL_REGISTRY
    assert "search_knowledge_base" in HANDLERS


def test_knowledge_tool_only_emits_context_items():
    items = tool_registry.call("search_knowledge_base", {"query": "productivity gap", "limit": 3})
    assert items
    for item in items:
        assert item.kind is EvidenceKind.CONTEXT
        assert item.metric in ("knowledge_document", "knowledge_document_summary")


def test_numerical_intents_do_not_retrieve_documents():
    """RAG is never used as a source of numbers."""
    for intent in ("district_crop_gap", "crop_comparison", "district_ranking"):
        assert "search_knowledge_base" not in tool_registry.INTENT_TOOLS.get(intent, ())


def test_explanatory_intents_retrieve_documents():
    assert "search_knowledge_base" in tool_registry.INTENT_TOOLS["methodology"]
    assert "search_knowledge_base" in tool_registry.INTENT_TOOLS["source_provenance"]


# --- retrieved documents reach the provider in their own block -----------------


def test_retrieved_documents_are_passed_to_the_provider_separately():
    provider = RemoteProvider(
        RemoteConfig(
            enabled=True, model="m", base_url="https://example.invalid/v1", api_key="k"
        )
    )
    bundle = EvidenceBundle(
        query_id="t",
        intent="methodology",
        items=[
            EvidenceItem(
                evidence_id="doc:method-gap",
                kind=EvidenceKind.CONTEXT,
                metric="knowledge_document",
                value="method-gap",
                note="How the productivity gap is computed",
            )
        ],
        retrieved=[{"id": "method-gap", "title": "How the productivity gap is computed", "category": "methodology", "text": "..."}],
    )
    messages = provider._messages(
        AIRequest(question="What is the productivity gap?"),
        RoutedRequest(question="What is the productivity gap?", intent="methodology"),
        bundle,
    )
    content = messages[-1]["content"]
    assert "RETRIEVED DOCUMENTS" in content
    assert "method-gap" in content
    # The evidence contract is untouched: retrieved text is never evidence items.
    assert all(item.metric != "knowledge_document" or item.kind is EvidenceKind.CONTEXT for item in bundle.items)


def test_no_retrieved_block_when_nothing_was_retrieved():
    provider = RemoteProvider(
        RemoteConfig(
            enabled=True, model="m", base_url="https://example.invalid/v1", api_key="k"
        )
    )
    bundle = EvidenceBundle(query_id="t", intent="district_crop_gap")
    messages = provider._messages(
        AIRequest(question="Maize in Gisagara"),
        RoutedRequest(question="Maize in Gisagara", intent="district_crop_gap"),
        bundle,
    )
    assert "RETRIEVED DOCUMENTS" not in messages[-1]["content"]


# --- end to end ----------------------------------------------------------------


def test_methodology_question_is_grounded_from_documents(client):
    body = client.post(
        "/api/v1/assistant/query", json={"question": "How do you compute the productivity gap?"}
    ).json()
    assert body["grounded"] is True
    assert body["intent"] == "methodology"
    assert "search_knowledge_base" in body["tools_used"]
    assert body["validation"]["numeric"]["ok"] is True, body["validation"]["numeric"]
