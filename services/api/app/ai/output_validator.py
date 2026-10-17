"""Validate a provider's prose before it is shown.

Order matters here. The deterministic grounded answer is computed first and is
correct by construction, so it is always available as the fallback. A provider's
answer is then checked against the evidence bundle twice over: every figure must
be attributable (``numeric_guard``), and every figure must be attributable *in the
unit, metric, crop, district and period the sentence places it in*, with
directional, causal and missing-value wording checked too (``claim_guard``). One
failure of either kind and the deterministic answer is returned instead.

That is what makes "the LLM may not state a figure" an enforcement rather than a
policy: an unsupported number cannot reach a client, because there is no code path
that skips this function.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.ai import citation_guard, claim_guard, numeric_guard
from app.ai.evidence import EvidenceBundle
from app.ai.grounded import GroundedAnswer
from app.ai.schemas import ProviderOutcome


@dataclass
class ValidatedAnswer:
    answer: str
    grounded: bool
    intent: str
    #: ``deterministic`` or ``llm`` - whichever text is actually being returned.
    mode: str
    citations: list[str] = field(default_factory=list)
    validation: dict = field(default_factory=dict)


def _fallback(
    reference: GroundedAnswer, reason: str, validation: dict
) -> ValidatedAnswer:
    """Return the deterministic answer, keeping the guard results on the record.

    The guard outcome is carried through even when it is not the reason for the
    fallback, so ``validation`` always has the same shape and a client can always
    see whether the figures were checked.
    """
    return ValidatedAnswer(
        answer=reference.answer,
        grounded=reference.grounded,
        intent=reference.intent,
        mode="deterministic",
        citations=[],
        validation={**validation, "used_fallback": True, "fallback_reason": reason},
    )


def validate(
    outcome: ProviderOutcome,
    bundle: EvidenceBundle,
    reference: GroundedAnswer,
) -> ValidatedAnswer:
    """Return the provider's answer only if the evidence supports every figure."""
    numeric = numeric_guard.check(outcome.answer, bundle)
    claims = claim_guard.check(outcome.answer, bundle)
    citations = citation_guard.check(outcome.citations, bundle)

    validation = {
        "used_fallback": False,
        "numeric": numeric.as_dict(),
        "claims": claims.as_dict(),
        "citations": citations.as_dict(),
        "mode": outcome.mode,
    }

    if not numeric.ok:
        return _fallback(
            reference,
            "the generated answer contained a figure that the evidence does not "
            "support; it was rejected and the deterministic explanation returned",
            validation,
        )

    if not claims.ok:
        # The digits exist in the evidence, but the sentence moved them to another
        # unit, metric, place or period - or claimed a direction, an effect or a
        # zero the evidence does not support. Named explicitly so the audit trail
        # says which claim failed rather than only that one did.
        first = claims.violations[0]
        return _fallback(
            reference,
            f"a claim could not be verified against the evidence ({first.kind}): "
            f"{first.detail}; the deterministic explanation was returned",
            validation,
        )

    if not outcome.grounded:
        # Either nothing was retrieved, or the provider declined to ground its
        # answer. In both cases the deterministic result is correct by
        # construction and strictly better than an ungrounded paragraph.
        return _fallback(
            reference,
            (
                "no evidence was retrieved for this question"
                if not bundle.grounded
                else "the provider did not produce a grounded answer"
            ),
            validation,
        )

    return ValidatedAnswer(
        answer=outcome.answer,
        grounded=outcome.grounded,
        intent=outcome.intent or reference.intent,
        mode=outcome.mode,
        # Only citations the bundle can back are returned.
        citations=citations.valid[:50],
        validation=validation,
    )
