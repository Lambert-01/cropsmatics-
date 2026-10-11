"""Language detection for agricultural questions.

Cropmatics is a bilingual product: users ask in English, in Kinyarwanda, or in a
mixture of the two inside a single sentence ("Kuki umusaruro w'ibigori hani hasi?
Compare with last Season B"). The assistant must understand all three rather than
treating a code-switched question as malformed.

Detection is deliberately conservative and explainable:

* strong Kinyarwanda function words ("kuki", "muri", "cyane", "nka", "kandi",
  "ariko", "bihingwa") are evidence of Kinyarwanda;
* if those and English function words both appear, the question is ``mixed``;
* otherwise it is ``en``.

This is a routing hint, not a translation service. Nothing here rewrites the
user's question; it only tells the planner which lexicon to consult first.
"""

from __future__ import annotations

import re

Language = str  # "en" | "rw" | "mixed"

#: Tokens that are characteristic of Kinyarwanda and are unlikely to appear by
#: accident inside an English question. Matched as whole words (case-insensitive).
KINYARWANDA_MARKERS: tuple[str, ...] = (
    "kuki",
    "muri",
    "ku",
    "mu",
    "kuri",
    "cyane",
    "nka",
    "kandi",
    "ariko",
    "bihingwa",
    "ishingwa",
    "umusaruro",
    "ubuhinzi",
    "umuhinzi",
    "abahinzi",
    "uturima",
    "igihingwa",
    "ibihingwa",
    "ingo",
    "aho",
    "hano",
    "hari",
    "ni",
    "cyane",
    "gute",
    "bitewe",
    "hejuru",
    "munsi",
    "gereranya",
    "ubwiyongere",
    "imvura",
    "ifumbire",
    "imbuto",
    "amazi",
    "ubutaka",
    "ko",
    "kubera",
    "ese",
    "iki",
    "ibyo",
    "zose",
    "byose",
    "ashobora",
    "tugomba",
    "kugira",
    "uburyo",
    "ubwoko",
)

#: Common English function words, used only to detect *mixing*.
ENGLISH_MARKERS: tuple[str, ...] = (
    "the",
    "is",
    "are",
    "was",
    "were",
    "what",
    "which",
    "how",
    "why",
    "compare",
    "with",
    "and",
    "for",
    "show",
    "explain",
    "between",
    "than",
    "yield",
    "production",
    "district",
    "maize",
    "beans",
)


def _mentions(text: str, vocabulary: tuple[str, ...]) -> bool:
    for token in vocabulary:
        pattern = r"(?<![a-z0-9])" + re.escape(token) + r"(?![a-z0-9])"
        if re.search(pattern, text):
            return True
    return False


def detect(text: str) -> Language:
    """Return ``"en"``, ``"rw"`` or ``"mixed"`` for a question.

    A question that mentions crop or place names is not thereby Kinyarwanda:
    "ibigori muri Gisagara" is Kinyarwanda because of "muri", not because of
    "ibigori". Detection keys on function words for that reason.
    """
    lowered = (text or "").lower()
    has_rw = _mentions(lowered, KINYARWANDA_MARKERS)
    has_en = _mentions(lowered, ENGLISH_MARKERS)
    if has_rw and has_en:
        return "mixed"
    if has_rw:
        return "rw"
    return "en"


def normalize(value: str | None) -> str:
    """Normalise a client-supplied language code to ``en``/``rw``.

    Detection produces a third value, ``mixed``, which the *engine* understands
    internally; the wire contract only advertises ``en`` and ``rw``, so a mixed
    question is answered in the language of its first clear marker.
    """
    raw = (value or "").strip().lower()
    if raw in ("rw", "rw-rw", "kin", "kinyarwanda"):
        return "rw"
    return "en"
