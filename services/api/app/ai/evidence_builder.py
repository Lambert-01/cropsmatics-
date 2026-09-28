"""Assemble an EvidenceBundle for a routed question.

The builder runs the allow-listed tools for an intent and collects their typed
evidence. Tools read the *same* frames the grounded answers read, so the bundle
and the answer cannot disagree about a published value.

A tool that raises is skipped rather than failing the request: a question is still
answerable from the evidence that was retrieved, and the failure is recorded so it
is visible rather than silent.
"""

from __future__ import annotations

import logging

from app.ai import tool_registry
from app.ai.evidence import EvidenceBundle, EvidenceItem
from app.ai.handlers import HANDLERS
from app.ai.schemas import RoutedRequest

logger = logging.getLogger(__name__)


def _dedupe(items: list[EvidenceItem]) -> list[EvidenceItem]:
    """Keep the first item for each evidence id, preserving tool order."""
    seen: set[str] = set()
    out: list[EvidenceItem] = []
    for item in items:
        if item.evidence_id in seen:
            continue
        seen.add(item.evidence_id)
        out.append(item)
    return out


def build(routed: RoutedRequest, *, query_id: str) -> EvidenceBundle:
    """Retrieve every piece of evidence an intent calls for."""
    bundle = EvidenceBundle(
        query_id=query_id,
        intent=routed.intent,
        requested=routed.requested,
    )

    if not bundle.intent or routed.intent == "unsupported":
        return bundle

    for name in tool_registry.INTENT_TOOLS.get(routed.intent, ()):
        handler = HANDLERS.get(name)
        if handler is None:
            # A tool planned for an intent with no handler is a programming error,
            # not a user-facing one. Recorded, never guessed at.
            logger.warning("no parameter handler for planned tool %s", name)
            continue
        params = handler(routed)
        if params is None:
            continue
        try:
            items = tool_registry.call(name, params)
        except Exception:
            logger.warning("tool %s failed for intent %s", name, routed.intent, exc_info=True)
            continue
        if items:
            bundle.tools_used.append(name)
            bundle.items.extend(items)

    bundle.items = _dedupe(bundle.items)
    bundle.sources = sorted({item.source_id for item in bundle.items if item.source_id})

    # Districts the tool set could not cover at all: this is what makes "the data
    # do not say" a reportable fact rather than an absence of output.
    districts = {item.district for item in bundle.items if item.district}
    if routed.district and routed.district not in districts:
        bundle.missing_data.append(
            f"no published observation was retrieved for {routed.district} "
            f"for the requested selection"
        )

    return bundle
