"""The citation guard: a citation must name evidence that was actually retrieved.

A model that cites an evidence id it was never given is fabricating provenance,
which is worse than fabricating a number - it makes the claim look checkable.
Invalid citations are dropped and recorded; a citation cannot be invented into
existence.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.ai.evidence import EvidenceBundle


@dataclass
class CitationResult:
    valid: list[str] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.invalid

    def as_dict(self) -> dict:
        return {"ok": self.ok, "valid": len(self.valid), "invalid": self.invalid[:20]}


def check(citations: list[str], bundle: EvidenceBundle) -> CitationResult:
    """Split citations into those the bundle supports and those it does not."""
    known = bundle.evidence_ids()
    result = CitationResult()
    seen: set[str] = set()

    for citation in citations or []:
        identifier = str(citation).strip()
        if not identifier or identifier in seen:
            continue
        seen.add(identifier)
        (result.valid if identifier in known else result.invalid).append(identifier)

    return result
