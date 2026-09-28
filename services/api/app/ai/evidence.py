"""Typed evidence: the only place a number in an answer may come from.

The rule the whole AI layer is built around is that **the model is never the
source of an agricultural fact**. Every figure that reaches a client must exist
as an :class:`EvidenceItem` here, carrying where it came from, which period it
describes and what kind of value it is.

This is not documentation of an intention - it is enforced. ``numeric_guard``
rejects any answer whose numbers cannot be matched against a bundle, and
``output_validator`` falls back to the deterministic explanation when that
happens.
"""

from __future__ import annotations

import re
from enum import Enum

from pydantic import BaseModel, Field

#: Numbers embedded in strings (period codes, "25.0%", "1,159 kg/ha").
_NUMBER_IN_TEXT = re.compile(r"-?\d+(?:\.\d+)?")


class EvidenceKind(str, Enum):
    """Provenance class of a value. Never mixed silently in an answer."""

    OFFICIAL = "official"
    """Published by a statistical source, exactly as published."""

    DERIVED = "derived"
    """A deterministic transform of official values (median, gap, share...)."""

    MODELLED = "modelled"
    """Output of a fitted model. Must be labelled as such wherever it appears."""

    SCENARIO = "scenario"
    """A re-computation under stated analytical assumptions - not a prediction."""

    CONTEXT = "context"
    """Published metadata: a period label, a source id, a coverage level."""


class EvidenceItem(BaseModel):
    """One attributable value.

    ``value`` is deliberately narrow. A string is only ever used for values that
    are genuinely textual (a period code, a source id, a district name), never as
    a smuggled numeric payload.
    """

    evidence_id: str
    kind: EvidenceKind
    metric: str
    value: float | int | str | None = None
    unit: str | None = None
    period_code: str | None = None
    geography_level: str | None = None
    district: str | None = None
    province: str | None = None
    crop: str | None = None
    source_id: str | None = None
    #: Required when ``kind`` is DERIVED, so a computed figure is auditable.
    method: str | None = None
    note: str | None = None


def _numbers_in(text: str) -> set[float]:
    found: set[float] = set()
    for match in _NUMBER_IN_TEXT.finditer(text):
        try:
            found.add(float(match.group()))
        except ValueError:  # pragma: no cover - regex cannot produce this
            continue
    return found


class EvidenceBundle(BaseModel):
    """Everything retrieved for one question, and nothing else."""

    query_id: str
    intent: str
    requested: dict = Field(default_factory=dict)
    items: list[EvidenceItem] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)

    @property
    def grounded(self) -> bool:
        """A bundle with no evidence item cannot ground an answer."""
        return bool(self.items)

    def evidence_ids(self) -> set[str]:
        return {item.evidence_id for item in self.items}

    def numeric_allowlist(self) -> set[float]:
        """Every number the bundle can justify.

        The definition is intentionally blunt: a number is attributable when it
        appears somewhere in the evidence. That includes published values, counts
        the platform computed, and numbers that are part of a period code or a
        source identifier - all of which are grounded facts rather than
        model-generated quantities.
        """
        allowed: set[float] = set()
        for item in self.items:
            if isinstance(item.value, int | float) and not isinstance(item.value, bool):
                allowed.add(float(item.value))
            for text in (item.period_code, item.source_id, item.district, item.note, item.unit):
                if text:
                    allowed |= _numbers_in(str(text))
        for text in self.limitations + self.missing_data + self.sources:
            allowed |= _numbers_in(text)
        # Deterministic counts the platform itself produces.
        allowed.add(float(len(self.items)))
        allowed.add(float(len(self.sources)))
        allowed.add(float(len(self.tools_used)))
        return allowed

    def serialisable(self) -> dict:
        return self.model_dump(mode="json")
