"""The numeric guard: no number reaches a client unless the evidence carries it.

This is the mechanism behind the platform's non-negotiable rule. It is
deliberately blunt and slightly conservative: a number in an answer must be a
correct rounding of some value in the evidence bundle, or the answer is rejected.

A false rejection is cheap - the deterministic answer is returned instead, which
is correct by construction. A false acceptance is not, so the guard errs toward
rejecting.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.ai.evidence import EvidenceBundle

#: Digits with optional thousands separators and a decimal part. Matches the
#: "2026" inside "2026B" and the "1,159" inside "1,159 kg/ha".
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")

#: A token longer than this is not a plausible agricultural figure and is treated
#: as an identifier rather than a claim.
_MAX_PLAUSIBLE_FIGURE = 1e12


@dataclass(frozen=True)
class Violation:
    number: str
    reason: str


@dataclass
class GuardResult:
    ok: bool
    checked: int = 0
    violations: list[Violation] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "numbers_checked": self.checked,
            "violations": [v.number for v in self.violations],
        }


def extract_numbers(text: str) -> list[tuple[str, float, int]]:
    """``(as_written, value, decimal_places)`` for every numeric token."""
    found: list[tuple[str, float, int]] = []
    for match in _NUMBER.finditer(text or ""):
        raw = match.group()
        try:
            value = float(raw.replace(",", ""))
        except ValueError:  # pragma: no cover - the regex cannot produce this
            continue
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        found.append((raw, value, decimals))
    return found


def is_attributable(value: float, decimals: int, allowed: set[float]) -> bool:
    """Whether ``value`` is a correct rounding of something in ``allowed``.

    Comparing at the *displayed* precision is what makes this usable: a published
    yield of 1159.0574 is legitimately written "1,159", and a gap index of 26.1345
    is legitimately written "26.1".
    """
    tolerance = 0.5 * (10 ** -decimals) + 1e-9
    return any(abs(candidate - value) <= tolerance for candidate in allowed)


def check(answer: str, bundle: EvidenceBundle) -> GuardResult:
    """Verify every number in ``answer`` is justified by ``bundle``."""
    allowed = bundle.numeric_allowlist()
    result = GuardResult(ok=True)

    for raw, value, decimals in extract_numbers(answer):
        result.checked += 1
        if abs(value) > _MAX_PLAUSIBLE_FIGURE:
            # A very long digit string is not a statistic; treat it as an
            # identifier and leave it alone rather than flagging noise.
            continue
        if is_attributable(value, decimals, allowed):
            continue
        result.ok = False
        result.violations.append(
            Violation(
                number=raw,
                reason=(
                    "not attributable to any value in the evidence bundle; "
                    "the answer was rejected rather than shown"
                ),
            )
        )
    return result
