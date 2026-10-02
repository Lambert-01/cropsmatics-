"""Language rendering for grounded assistant answers.

The assistant never duplicates retrieval or calculation logic per language. The
flow is always::

    question
        -> entity/intent resolution
        -> structured verified evidence   (language-independent)
        -> language rendering
        -> answer

The evidence, the source, the period, the coverage and every number are computed
**once** and are byte-for-byte identical across languages. Only the prose
template is swapped.

Kinyarwanda status
------------------

Kinyarwanda sentences are only emitted when they have been human-reviewed. A
phrase that has not been reviewed falls back to the English sentence and the
answer is marked ``TEMPORARY_ENGLISH_FALLBACK`` rather than presenting machine
output as reviewed translation. See ``docs/KINYARWANDA_REVIEW.md``.
"""

from __future__ import annotations

from typing import Literal

Language = Literal["en", "rw"]

# Phrases that a native speaker has reviewed and approved.
REVIEWED_RW: dict[str, str] = {
    "refusal": (
        "Cropmatics nta makuru yemejwe ifite kugira ngo isubize iki kibazo."
    ),
    "evidence_intro": "Dore ibisubizo bishingiye ku makuru yemejwe:",
}

# ``None`` means "not yet reviewed" -> documented English fallback.
rw_template_status: dict[str, str] = {
    "refusal": "TRANSLATED",
    "evidence_intro": "TRANSLATED",
}


def normalize_language(value: str | None) -> Language:
    """Map any client value to a supported language, defaulting to English."""
    if value and value.strip().lower() in ("rw", "rw-rw", "kin", "kinyarwanda"):
        return "rw"
    return "en"


def render(
    *,
    answer_en: str,
    grounded: bool,
    language: str | None,
) -> tuple[str, str | None]:
    """Return ``(answer, translation_status)`` for the requested language.

    English passes through unchanged. For Kinyarwanda only reviewed scaffolding
    is emitted; the substantive sentence is the English one and the status makes
    that explicit, so no unreviewed translation is presented as final.
    """
    lang = normalize_language(language)
    if lang == "en":
        return answer_en, None

    if not grounded:
        # The refusal is a short, reviewed phrase.
        return REVIEWED_RW["refusal"], rw_template_status["refusal"]

    intro = REVIEWED_RW["evidence_intro"]
    return f"{intro} {answer_en}", "TEMPORARY_ENGLISH_FALLBACK"
