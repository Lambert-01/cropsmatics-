"""The bilingual agricultural ontology the planner and entity resolver share.

Kinyarwanda is a first-class input language here, not a decorative translation.
This module is the vocabulary that lets a Kinyarwanda or code-switched question
reach the same canonical analytical operation as its English equivalent:

    "maize" / "ibigori"                -> the Maize crop (handled from the dict)
    "compare" / "gereranya"            -> the comparison operation
    "irrigation" / "kuhira"            -> the irrigation indicator family
    "last season B" / "igihe gishize"  -> the same-season one-year-earlier period

Review policy
-------------
Every Kinyarwanda term here is a **curated, reviewed** agricultural or functional
word. Machine-generated translations are not accepted into these tables: an
unreviewed term would silently route a question to the wrong operation, which is
worse than not recognising it at all. Where a concept has no confident term, the
entry is deliberately absent - the planner then asks for clarification instead of
guessing.

Nothing in this module invents data. It only maps *words* to *operations*; every
number still comes from the verified tool layer.
"""

from __future__ import annotations

import re

# --- operations ------------------------------------------------------------
# Keys are canonical operation names. The planner maps these onto the intent a
# client can branch on. ``rw`` terms are reviewed vocabulary; an empty tuple is
# honest - the operation is simply not triggered by that language yet.


def _words(*items: str) -> tuple[str, ...]:
    return tuple(item.lower() for item in items)


#: Operation -> (English triggers, Kinyarwanda triggers).
OPERATION_TERMS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "crop_comparison": (
        _words("compare", "comparison", "versus", "vs", "against"),
        _words("gereranya", "gereranya", "ugereranye", "bitandukanye"),
    ),
    "district_comparison": (
        _words("compare districts", "which districts", "district comparison"),
        _words("uturere", "akarere"),
    ),
    "period_comparison": (
        _words(
            "change",
            "changed",
            "compared with last",
            "compared to last",
            "versus last",
            "since last",
            "year on year",
            "yoy",
            "last season b",
            "previous season",
            "same season",
        ),
        _words("ubahinduka", "byahindutse", "kugereranya", "gishize"),
    ),
    "trend": (
        _words("trend", "trends", "over time", "history", "historical", "series"),
        _words("amateka", "igihe"),
    ),
    "yield_ranking": (
        _words(
            "highest yield",
            "highest yields",
            "best yield",
            "best yields",
            "best yielding",
            "yielding",
            "highest-yield",
            "top yield",
            "top yielding",
            "yielding districts",
            "yield per hectare",
        ),
        _words("umusaruro mwinshi", "umusaruro wa mbere"),
    ),
    "ranking": (
        _words(
            "rank",
            "ranking",
            "top",
            "best",
            "worst",
            "highest",
            "lowest",
            "largest",
            "biggest",
            "leading",
            "priority",
            "prioritize",
        ),
        _words("kurusha", "benshi", "bike", "ibanze"),
    ),
    "practice_associations": (
        _words(
            "practice",
            "practices",
            "factor",
            "factors",
            "association",
            "associated",
            "correlat",
            "affect",
            "driver",
            "improved seed",
            "fertilizer",
            "fertiliser",
            "pesticide",
            "mechanization",
            "agroforestry",
        ),
        _words("ifumbire", "imbuto", "ubuhinzi"),
    ),
    "irrigation": (
        _words("irrigation", "irrigat", "water"),
        _words("kuhira", "amazi"),
    ),
    "erosion": (
        _words("erosion", "terrace", "terraces", "soil protection"),
        _words("isuri", "ku rukuta"),
    ),
    "postharvest": (
        _words(
            "post-harvest",
            "post harvest",
            "storage",
            "stored",
            "loss",
            "losses",
            "sold",
            "consumption",
            "after harvest",
        ),
        _words("ububiko", "igihombo", "nyuma y'isarura"),
    ),
    "priority": (
        _words("priority", "intervention", "invest", "where should", "focus"),
        _words("ibanze", "gutera inkunga"),
    ),
    "data_coverage": (
        _words("coverage", "which periods", "data available", "periods covered", "how much data"),
        _words("amakuru aboneka", "ibihe"),
    ),
    "source_provenance": (
        _words("source", "sources", "provenance", "where did", "come from", "citation"),
        _words("inkomoko", "inkomoko y'amakuru"),
    ),
    "methodology": (
        _words(
            "methodology",
            "methodological",
            "how is it computed",
            "how do you compute",
            "how is it calculated",
            "how do you calculate",
            "how is it defined",
            "defined as",
            "definition of",
        ),
        _words("uburyo bibarwa", "bibarwa gute"),
    ),
    "model_info": (
        _words("model", "machine learning", "prediction", "forecast model", "ml"),
        _words("icyitegererezo"),
    ),
}

# Natural questions often place the crop and a qualifier between the ranking
# word and ``yield`` (for example, "highest observed maize yield"). Keep this
# separate from the generic ranking vocabulary so those questions do not fall
# through to the productivity-gap ranking.
_YIELD_RANKING_RE = re.compile(
    r"\b(?:highest|top|best|lowest|worst|largest|maximum|minimum)\b"
    r"(?:\s+[a-z0-9'-]+){0,5}\s+yield(?:s|ing)?\b"
    r"(?!\s*(?:gap|gaps|shortfall|deficit)\b)",
    re.IGNORECASE,
)

#: Comparison savings: words that signal two things are being set against each
#: other even without the word "compare".
COMPARISON_CONNECTORS: tuple[str, ...] = _words(
    "versus", "vs", "compared with", "compared to", "against", "and", "with"
)
RW_COMPARISON_CONNECTORS: tuple[str, ...] = _words("na", "kuri", "muri")

#: Relative period phrases -> a resolved period is computed by the planner from
#: the published catalogue; these only *classify* the user's intent.
RELATIVE_PERIOD_TERMS: dict[str, tuple[str, ...]] = {
    "previous_same_season": _words(
        "last season b",
        "previous season b",
        "same season last year",
        "last year",
        "previous year",
        "year on year",
        "yoy",
        "igisekuru gishize",
        "umwaka ushize",
    ),
    "current": _words("current", "latest", "most recent", "this season", "now"),
}


def _mentions(text: str, vocabulary: tuple[str, ...]) -> bool:
    for token in vocabulary:
        pattern = r"(?<![a-z0-9])" + re.escape(token) + r"(?![a-z0-9])"
        if re.search(pattern, text):
            return True
    return False


def contains_any(text: str, vocabulary: tuple[str, ...]) -> bool:
    """Whole-word match for any token, case-insensitive."""
    return _mentions((text or "").lower(), vocabulary)


def detect_operations(text: str) -> list[str]:
    """Every operation the text plausibly names, most specific first.

    Ordering matters: a crop comparison is also a "compare", so the planner
    consults this list in order and stops at the first operation it can actually
    ground. The order is the declaration order above, refined so that explicit
    comparison wins over a bare trend or ranking trigger.
    """
    lowered = (text or "").lower()
    found: list[str] = []
    # Explicit comparison wording is the strongest signal.
    en, rw = OPERATION_TERMS["crop_comparison"]
    if _mentions(lowered, en) or _mentions(lowered, rw):
        found.append("crop_comparison")

    for operation, (english, kinyarwanda) in OPERATION_TERMS.items():
        if operation == "crop_comparison":
            continue
        if operation == "yield_ranking" and _YIELD_RANKING_RE.search(lowered):
            found.append(operation)
            continue
        if _mentions(lowered, english) or _mentions(lowered, kinyarwanda):
            found.append(operation)
    return found


def has_comparison(text: str) -> bool:
    """Whether the text frames a comparison at all."""
    lowered = (text or "").lower()
    return _mentions(lowered, COMPARISON_CONNECTORS) or _mentions(
        lowered, RW_COMPARISON_CONNECTORS
    ) or _mentions(lowered, OPERATION_TERMS["crop_comparison"][0])


def relative_period(text: str) -> str | None:
    """Classify a relative period phrase, or ``None`` when the text is absolute."""
    lowered = (text or "").lower()
    for kind, vocabulary in RELATIVE_PERIOD_TERMS.items():
        if _mentions(lowered, vocabulary):
            return kind
    return None


# --- indicator families ----------------------------------------------------
# A small alias map so a Kinyarwanda or colloquial word reaches the same curated
# indicator keyword list ``entity_resolver`` already uses. Keys are the canonical
# indicator id; values are extra whole-word triggers.

INDICATOR_ALIASES: dict[str, tuple[str, ...]] = {
    "inorganic_fertilizer": _words("ifumbire", "ifumbire y'ubukorikori"),
    "organic_fertilizer": _words("ifumbire kama", "ifumbire y'umwimerere", "compost"),
    "improved_seed": _words("imbuto", "imbuto nziza"),
    "irrigation_farmers": _words("kuhira", "amazi ku murima"),
    "erosion_severe": _words("isuri"),
    "pesticide": _words("imiti yica udukoko"),
    "mechanization": _words("imashini z'ubuhinzi", "traktor"),
    "postharvest_loss": _words("igihombo", "igihombo nyuma y'isarura"),
    "postharvest_stored": _words("ububiko", "babitswe"),
}

#: Canonical season words in both languages. Used to parse "Season B" / "Igihe B".
SEASON_WORDS: dict[str, str] = {
    "season a": "A",
    "season b": "B",
    "season c": "C",
    "igihe a": "A",
    "igihe b": "B",
    "igihe c": "C",
}
