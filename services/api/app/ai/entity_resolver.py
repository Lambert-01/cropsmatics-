"""Entity resolution: turn free text into published entities.

Moved out of ``assistant.py`` unchanged. The matching rules matter and are worth
stating once:

* whole-word matching, because a substring test resolves "rice" inside "price"
  and answers a different question;
* longest match wins, so "Paddy rice" beats "rice" when both appear;
* a trailing word is only accepted as an alias when it is **unambiguous** -
  "potato" fits both Irish and sweet potato, so it is refused rather than
  guessed at.
"""

from __future__ import annotations

import re

from app.ai import ontology
from app.repositories import dataset_repository as repo

# Topics Cropmatics genuinely cannot answer from the published agricultural
# statistics: market prices, weather, input cost and credit are simply not in the
# dataset. Answering one of those with a neighbouring production fact would be
# misleading, so they are refused explicitly rather than "helpfully".
UNSUPPORTED_HINTS = (
    "price",
    "prices",
    "pricing",
    "market",
    "markets",
    "cost",
    "costs",
    "profit",
    "revenue",
    "income",
    "weather",
    "forecast",
    "rain",
    "rainfall",
    "drought",
    "tomorrow",
    "tonight",
    "disease",
    "diseases",
    "pest",
    "pests",
    "subsidy",
    "subsidies",
    "loan",
    "loans",
    "credit",
    "insurance",
    "buyer",
    "buyers",
    "export",
    "exports",
    "import",
    "imports",
    "inflation",
)


def mentions(text: str, hints: tuple[str, ...]) -> str | None:
    """Return the first hint that appears as a whole word, else ``None``."""
    for hint in hints:
        pattern = r"(?<![a-z0-9])" + re.escape(hint) + r"(?![a-z0-9])"
        if re.search(pattern, text):
            return hint
    return None


def _find_entity(question: str, vocabulary: list[str]) -> str | None:
    """Longest whole-word case-insensitive match against a known vocabulary."""
    best: str | None = None
    for value in vocabulary:
        if not value:
            continue
        pattern = r"(?<![a-z0-9])" + re.escape(str(value).lower()) + r"(?![a-z0-9])"
        if re.search(pattern, question) and (best is None or len(str(value)) > len(best)):
            best = str(value)
    return best


def crop_vocabulary() -> dict[str, str]:
    """Map every accepted crop phrase (lower-cased) to its canonical crop name.

    Built from the crop dictionary, so it can never drift from the data:

    * the published crop name itself ("paddy rice");
    * its Kinyarwanda name ("umuceri");
    * a trailing word, but **only when it is unambiguous**.
    """
    frame = repo.crops()
    names = [str(v) for v in frame["crop_name"].dropna()]
    canonical = {name.lower() for name in names}

    vocabulary: dict[str, str] = {name.lower(): name for name in names}

    if "kinyarwanda_name" in frame.columns:
        for _, row in frame.iterrows():
            local = row.get("kinyarwanda_name")
            if local:
                vocabulary.setdefault(str(local).lower(), str(row["crop_name"]))

    trailing: dict[str, set[str]] = {}
    for name in names:
        tokens = re.split(r"[^a-z]+", name.lower())
        last = tokens[-1] if tokens else ""
        if last and last not in canonical:
            trailing.setdefault(last, set()).add(name)
    for alias, owners in trailing.items():
        if len(owners) == 1:
            vocabulary.setdefault(alias, next(iter(owners)))

    return vocabulary


def extract(question: str) -> tuple[str | None, str | None]:
    """Resolve a district and a crop from a free-text question."""
    districts, crops = extract_multi(question)
    return (districts[0] if districts else None, crops[0] if crops else None)


def _spans(question: str, vocabulary: dict[str, str]) -> list[tuple[int, int, str]]:
    """Non-overlapping ``(start, end, canonical)`` matches, longest first.

    A longer phrase wins over a shorter one that it contains, so "Paddy rice"
    is chosen over "rice" and "Irish potato" over a bare "potato". Matching is
    whole-word, so "rice" is never found inside "price".
    """
    candidates: list[tuple[int, int, str]] = []
    for phrase, canonical in vocabulary.items():
        if not phrase:
            continue
        pattern = r"(?<![a-z0-9])" + re.escape(phrase.lower()) + r"(?![a-z0-9])"
        for match in re.finditer(pattern, question):
            candidates.append((match.start(), match.end(), canonical))

    # Longest phrase first, then earliest, so a specific alias always beats a
    # generic one that overlaps it.
    candidates.sort(key=lambda item: (-(item[1] - item[0]), item[0]))
    accepted: list[tuple[int, int, str]] = []
    for start, end, canonical in candidates:
        if any(start < a_end and end > a_start for a_start, a_end, _ in accepted):
            continue
        accepted.append((start, end, canonical))

    accepted.sort(key=lambda item: item[0])
    return accepted


def extract_multi(question: str) -> tuple[list[str], list[str]]:
    """Resolve *every* district and crop mentioned, in the order they appear.

    Multi-entity resolution is what makes "Compare maize and beans in Ngoma and
    Gatsibo" a single grounded comparison instead of four disconnected lookups.
    """
    q = (question or "").lower()
    try:
        districts = [str(v) for v in repo.districts()["district"].dropna()]
        crop_map = crop_vocabulary()
    except Exception:
        return [], []

    district_map = {name.lower(): name for name in districts}

    district_values: list[str] = []
    for _, _, canonical in _spans(q, district_map):
        if canonical not in district_values:
            district_values.append(canonical)

    crop_values: list[str] = []
    for _, _, canonical in _spans(q, crop_map):
        if canonical not in crop_values:
            crop_values.append(canonical)

    return district_values, crop_values


# Curated indicator vocabulary for entity-free national questions. Keeping it
# explicit (rather than deriving keywords from labels) avoids accidental matches
# on generic words such as "share" or "use".
INDICATOR_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("yield", ("yield",)),
    ("production", ("production", "output")),
    ("harvested_area", ("harvested area", "cropped area")),
    ("improved_seed", ("improved seed", "improved seeds", "seed", "seeds")),
    (
        "inorganic_fertilizer",
        ("inorganic fertilizer", "inorganic fertiliser", "fertilizer", "fertiliser", "npk"),
    ),
    ("organic_fertilizer", ("organic fertilizer", "organic fertiliser", "compost")),
    ("pesticide", ("pesticide", "pesticides")),
    ("mechanization", ("mechanization", "mechanisation", "tractor", "tractors")),
    ("agroforestry", ("agroforestry", "agro forestry")),
    ("irrigation_farmers", ("irrigation", "irrigate", "irrigated", "irrigating")),
    ("irrigation_drip", ("drip irrigation", "drip irrigated")),
    ("irrigation_surface", ("surface irrigation", "flood irrigation")),
    ("water_source_rainwater", ("rainwater", "water source", "water sources")),
    ("erosion_bench_terraces", ("bench terrace", "bench terraces")),
    ("erosion_progressive_terraces", ("progressive terrace", "progressive terraces")),
    ("erosion_severe", ("severe erosion", "erosion")),
    ("postharvest_stored", ("stored", "storage")),
    ("postharvest_own_consumption", ("own consumption", "household consumption")),
    (
        "postharvest_loss",
        ("post harvest loss", "post-harvest loss", "post harvest losses", "loss", "losses", "lost"),
    ),
    ("cold_chain_program", ("cold chain", "packhouse", "packhouses")),
)


def matched_indicators(question: str) -> list[str]:
    """Indicator ids whose curated keywords appear in the question.

    Both the English keywords and the curated Kinyarwanda aliases are consulted,
    so "ifumbire" and "fertilizer" reach the same indicator.
    """
    lowered = (question or "").lower()
    found: list[str] = []
    for indicator_id, keywords in INDICATOR_KEYWORDS:
        if indicator_id in found:
            continue
        if any(mentions(lowered, (keyword,)) for keyword in keywords):
            found.append(indicator_id)
    for indicator_id, aliases in ontology.INDICATOR_ALIASES.items():
        if indicator_id in found:
            continue
        if any(mentions(lowered, (alias,)) for alias in aliases):
            found.append(indicator_id)
    return found
