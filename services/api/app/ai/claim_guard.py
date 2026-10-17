"""Claim-level validation: a figure must be attributable *in its own scope*.

``numeric_guard`` answers one question - do these digits exist somewhere in the
evidence. That is necessary and not sufficient. ``26.1`` exists in a bundle that
carries a gap index, and the same bundle may also carry a fertiliser share of
26.1 percent, so a sentence that moves a number from one metric, crop, district or
period to another survives the digit check while stating something the evidence
does not support. Three failure modes follow from that, and each has been observed
in generated prose:

* **wrong unit** - "production was 1,159 metric tonnes" when 1,159 is a yield in
  kg/ha, and the bundle's production for that district is a different figure;
* **wrong scope** - a district's value stated as national, one district's value
  attributed to another, or a 2025 Season B release presented as the selected
  period;
* **wrong direction, or the wrong kind of claim** - "higher than" when the
  published values are the other way round, an association restated as an effect,
  or an unknown value asserted as zero.

This module checks a provider's prose sentence by sentence, pairing every number
that carries a unit with the evidence items that actually carry that value *in
that unit*, and then testing the sentence's crop, district and period against
those items. It also checks the qualitative claims the brief calls out: comparison
direction, percentage-change direction, causal wording over observational
evidence, and a value asserted where the platform's rule is that missing data
stay missing.

It is deliberately conservative. A rejection costs nothing - the deterministic
grounded answer is returned instead, and that answer is correct by construction.
Accepting a claim the evidence does not support is what the platform cannot
afford, so an ambiguous case rejects.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.ai.evidence import EvidenceBundle, EvidenceItem, EvidenceKind

# --- units -----------------------------------------------------------------

#: Answer-side unit spellings mapped to the canonical unit the evidence uses.
#: Ordered: a regex alternation takes the first branch that matches, so ``kg/ha``
#: must be tried before ``kg`` and ``t/ha`` before a bare ``t``.
_UNIT_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"kg\s*/\s*ha", "kg/ha"),
    (r"kg\s+per\s+hectare", "kg/ha"),
    (r"kilo(?:gram)?s?\s+per\s+hectare", "kg/ha"),
    (r"t\s*/\s*ha", "t/ha"),
    (r"(?:metric\s+)?tonnes?\s+per\s+hectare", "t/ha"),
    (r"(?:metric\s+)?tons?\s+per\s+hectare", "t/ha"),
    (r"tonnes?\s+per\s+hectare", "t/ha"),
    (r"metric\s+tonnes?", "metric tonnes"),
    (r"metric\s+tons?", "metric tonnes"),
    (r"tonnes?", "metric tonnes"),
    (r"tons?", "metric tonnes"),
    (r"kilo(?:gram)?s?", "kg"),
    (r"kg", "kg"),
    (r"hectares?", "ha"),
    (r"ha", "ha"),
    (r"t", "metric tonnes"),
    (r"percent|per\s+cent", "%"),
    (r"%", "%"),
    (r"index", "index"),
    (r"rank", "rank"),
    (r"crops?", "crops"),
    (r"districts?", "districts"),
    (r"observations?", "observations"),
)

_UNIT_ALTERNATION = "|".join(f"(?:{pattern})" for pattern, _ in _UNIT_PATTERNS)

#: A number immediately followed by a known unit. Two things are deliberate: the
#: unit must be a real unit word (a bare number is left to ``numeric_guard``), and
#: a trailing letter vetoes the match, so ``kg`` never matches inside ``kgs``.
_CLAIM = re.compile(
    rf"(?<![0-9a-z])(?P<sign>[-+])?(?P<number>\d[\d,]*(?:\.\d+)?)\s*"
    rf"(?P<unit>{_UNIT_ALTERNATION})(?![a-z])",
    re.IGNORECASE,
)

#: Sentence boundary: terminal punctuation *followed by whitespace*, or a newline.
#: Splitting on any period would cut "12.3%" in half and validate "3%" as a claim.
_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")

#: Within a sentence, the word a figure is actually attached to. "12.3% sold,
#: 45.6% kept and 3.4% post-harvest loss" is three claims about three metrics; a
#: sentence-wide keyword scan would read "loss" as the label for all of them.
_CLAUSE_BREAK = re.compile(r"[,;]|\band\b|\bwhile\b|\bbut\b|\balso\b", re.IGNORECASE)

#: A period written either as a code (``2026B``) or as prose (``2026 Season B``).
_PERIOD_MENTION = re.compile(r"\b(20\d{2})\s*(?:season\s*)?([abc])?\b", re.IGNORECASE)

#: Wording that asserts one thing is above another.
_GREATER = re.compile(
    r"\b(?:higher|greater|larger|bigger|more|above|exceed(?:s|ed)?|outperform(?:s|ed)?)\b",
    re.IGNORECASE,
)
#: Wording that asserts one thing is below another.
_LESSER = re.compile(
    r"\b(?:lower|smaller|less|fewer|below|under|behind|lag(?:s|ged)?)\b", re.IGNORECASE
)

#: Comparatives only count when the sentence actually contrasts two things.
_CONTRAST = re.compile(r"\b(?:than|versus|vs\.?|compared\s+(?:with|to))\b", re.IGNORECASE)

#: A clause that denies what it mentions. "it is not proof that X would cause Y"
#: states the platform's rule; reading its causal verb as a causal claim would
#: reject the most careful sentence in the answer.
_NEGATION = re.compile(
    r"\b(?:not|never|cannot|can't|no|without|rather\s+than|nor)\b", re.IGNORECASE
)

#: Effect-asserting verbs. Over observational evidence these are not available to
#: the assistant: a shortfall is an association, and nothing in the data licenses
#: "this will raise yield".
_CAUSAL = re.compile(
    r"\b(?:causes?|caused|causing|guarantees?|guaranteed|proves?|proven|"
    r"will\s+(?:increase|decrease|raise|lower|boost|improve|reduce|double)|"
    r"would\s+guarantee)\b",
    re.IGNORECASE,
)

#: A percentage change claimed in a direction. ``rose`` and ``fell`` are the two
#: halves of the same statement, and a sign that disagrees with the words is a
#: wrong claim whichever way round it is.
_RISE = re.compile(
    r"\b(?:rose|risen|rise|rising|increased?|increasing|grew|grown|up)\b", re.IGNORECASE
)
_FALL = re.compile(
    r"\b(?:fell|fallen|fall|falling|decreased?|decreasing|declined?|declining|dropped?|down)\b",
    re.IGNORECASE,
)

#: A metric family a sentence names. A figure in that sentence must belong to at
#: least one family the sentence mentions; without this, "production of
#: 1,159 kg/ha" passes because 1,159 exists somewhere in the bundle.
_METRIC_FAMILIES: tuple[tuple[re.Pattern[str], tuple[str, ...]], ...] = (
    (re.compile(r"\bgap\s+index|\bgaps?\b", re.IGNORECASE), ("gap_index",)),
    (re.compile(r"\byield", re.IGNORECASE), ("yield",)),
    (re.compile(r"\bproduction\b", re.IGNORECASE), ("production",)),
    (re.compile(r"\b(?:harvested\s+)?area\b", re.IGNORECASE), ("harvested_area",)),
    (re.compile(r"\b(?:post[- ]harvest\s+)?loss(?:es)?\b", re.IGNORECASE), ("loss",)),
    (re.compile(r"\badoption\b", re.IGNORECASE), ("farmers_pct", "adoption")),
    (re.compile(r"\brank(?:ed|ing)?\b", re.IGNORECASE), ("rank",)),
)

#: Metrics that describe a storage capacity. The platform's rule is that an
#: unknown capacity stays unknown; nothing here is ever zero by default.
_CAPACITY_METRICS = ("capacity", "storage")

#: A capacity asserted as zero, or as available, without a capacity observation.
_ZERO_CAPACITY = re.compile(
    r"\b(?:storage\s+|cold\s+|warehouse\s+)?capacity\b[^.;]{0,48}?"
    r"\b(?:is|are|was|were|of|at|=|:)\s*(?:0|zero|none|nil)\b",
    re.IGNORECASE,
)
_AVAILABLE_CAPACITY = re.compile(
    r"\b(?:available|sufficient|adequate|enough)\s+(?:storage\s+)?capacity\b",
    re.IGNORECASE,
)


def canonical_unit(text: str | None) -> str | None:
    """Map any unit spelling the answer or the evidence may use to one key.

    ``None`` means "no unit" - a count with no unit, never a unit that could not be
    read. An unreadable unit keeps its own spelling, so the claim is then compared
    against evidence carrying exactly that string rather than skipped.
    """
    if not text:
        return None
    cleaned = " ".join(str(text).split()).strip().lower()
    if not cleaned:
        return None
    for pattern, canonical in _UNIT_PATTERNS:
        if re.fullmatch(pattern, cleaned, re.IGNORECASE):
            return canonical
    # Compound shares such as "% of production" or "% of farmers" are percentages.
    if cleaned.startswith("%"):
        return "%"
    return cleaned


@dataclass(frozen=True)
class ClaimViolation:
    """One claim the evidence does not support, with the reason it does not."""

    kind: str
    detail: str
    claim: str


@dataclass
class ClaimResult:
    ok: bool
    claims_checked: int = 0
    scoped_checked: int = 0
    violations: list[ClaimViolation] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "claims_checked": self.claims_checked,
            "scoped_claims_checked": self.scoped_checked,
            "violations": [
                {"kind": v.kind, "detail": v.detail, "claim": v.claim}
                for v in self.violations[:20]
            ],
        }


def _sentences(answer: str) -> list[str]:
    return [s.strip() for s in _SENTENCE.split(answer or "") if s.strip()]


def _clause_head(sentence: str, start: int) -> str:
    """The words a figure is attached to, from the start of its clause to it.

    Only the text *before* the number counts as its label. "...median of 1,159
    kg/ha (productivity gap index 10.8)" is a yield figure that a later
    parenthetical mentions a gap index next to; reading the whole clause would
    label it as a gap index and reject a correct sentence.
    """
    left = 0
    for match in _CLAUSE_BREAK.finditer(sentence):
        if match.end() <= start:
            left = match.end()
        else:
            break
    return sentence[left:start].strip()


def _has_negation(clause: str) -> bool:
    """Whether a clause denies what it also mentions."""
    return bool(_NEGATION.search(clause or ""))


def _text_claims(bundle: EvidenceBundle) -> list[tuple[float, str]]:
    """Figures the evidence states in its own *text*, with the unit next to them.

    Some evidence is prose: a limitation, a method note, a backtest's withholding
    reasons, a source registry entry. ``numeric_guard`` already treats the digits
    in those fields as attributable, and the same must hold here - an answer that
    quotes the platform's own reason for withholding a forecast ("skill -146.4%
    < +0.0%") is quoting a published statement, not misplacing a figure.
    """
    pairs: list[tuple[float, str]] = []
    texts: list[str] = []
    for item in bundle.items:
        texts.extend(
            str(text)
            for text in (
                item.note,
                item.method,
                item.unit,
                item.district,
                item.province,
                item.crop,
                item.period_code,
                item.source_id,
                item.value if isinstance(item.value, str) else None,
            )
            if text
        )
    texts.extend(str(text) for text in bundle.limitations + bundle.missing_data + bundle.sources)

    for text in texts:
        for match in _CLAIM.finditer(text):
            try:
                value = float(match.group("number").replace(",", ""))
            except ValueError:  # pragma: no cover - the regex cannot produce this
                continue
            # Stored unsigned for the same reason the numeric allow-list is: the
            # sign is a separate claim, checked by the direction rules above.
            pairs.append((abs(value), canonical_unit(match.group("unit")) or ""))
    return pairs


def _period_key(code: str | None) -> tuple[str, str] | None:
    """``2025B`` -> ``("2025", "B")``; a bare year keeps an empty season."""
    if not code:
        return None
    match = re.fullmatch(r"\s*(20\d{2})\s*([A-Ca-c])?\s*", str(code))
    if not match:
        return None
    return (match.group(1), (match.group(2) or "").upper())


def _periods_in(sentence: str) -> list[tuple[str, str]]:
    return [
        (match.group(1), (match.group(2) or "").upper())
        for match in _PERIOD_MENTION.finditer(sentence or "")
    ]


def _period_covers(mention: tuple[str, str], code: str | None) -> bool:
    """Whether a period *mention* is the period an evidence item describes.

    A bare year in prose (``2025``) covers any season of that year; a mention that
    names the season must match it exactly.
    """
    key = _period_key(code)
    if key is None:
        return False
    year, season = mention
    if key[0] != year:
        return False
    return not season or key[1] == season


def _mentions(text: str, vocabulary: set[str]) -> list[str]:
    """Vocabulary terms appearing in ``text``, in order of appearance."""
    found: list[tuple[int, str]] = []
    lowered = (text or "").lower()
    for term in vocabulary:
        if not term:
            continue
        match = re.search(rf"(?<![a-z]){re.escape(term.lower())}(?![a-z])", lowered)
        if match:
            found.append((match.start(), term))
    return [term for _, term in sorted(found)]


def _values_by_scope(
    items: list[EvidenceItem], entity: str
) -> dict[tuple[str, str, str | None], float]:
    """``(metric, unit, crop) -> value`` for items attached to ``entity``.

    ``entity`` is matched against the item's district, province or crop, so one
    helper serves district, province and crop comparisons alike.
    """
    out: dict[tuple[str, str, str | None], float] = {}
    for item in items:
        if not isinstance(item.value, int | float) or isinstance(item.value, bool):
            continue
        names = {n.lower() for n in (item.district, item.province, item.crop) if n}
        if entity.lower() not in names:
            continue
        out[(item.metric, canonical_unit(item.unit) or "", item.crop)] = float(item.value)
    return out


def _compare_entities(
    mentions_left: list[str],
    mentions_right: list[str],
    items: list[EvidenceItem],
    greater: bool,
) -> str | None:
    """Check a stated comparison against the published values behind it.

    Returns a detail string when the evidence contradicts the claim, ``None`` when
    it agrees *or* when the pair cannot be compared (different metrics, different
    crops, or one side missing) - an unverifiable comparison is not a violation.
    """
    for left in mentions_left:
        for right in mentions_right:
            if left == right:
                continue
            left_values = _values_by_scope(items, left)
            right_values = _values_by_scope(items, right)
            for (metric, unit, _crop), left_value in left_values.items():
                if metric.startswith("district_rank") or unit == "rank":
                    # A rank is ordered ascending, so a higher rank is worse.
                    continue
                right_value = right_values.get((metric, unit, _crop))
                if right_value is None or abs(left_value - right_value) < 1e-9:
                    continue
                if greater and left_value < right_value:
                    return (
                        f"the answer states {left} is higher than {right} on {metric} "
                        f"({unit}), but the published values are {left_value} and {right_value}"
                    )
                if not greater and left_value > right_value:
                    return (
                        f"the answer states {left} is lower than {right} on {metric} "
                        f"({unit}), but the published values are {left_value} and {right_value}"
                    )
    return None


def _compare_periods(
    left: tuple[str, str],
    right: tuple[str, str],
    items: list[EvidenceItem],
    greater: bool,
) -> str | None:
    """Check a stated period comparison against the published values behind it."""
    left_values: dict[str, float] = {}
    right_values: dict[str, float] = {}
    for item in items:
        if not isinstance(item.value, int | float) or isinstance(item.value, bool):
            continue
        if _period_covers(left, item.period_code):
            left_values[item.metric] = float(item.value)
        if _period_covers(right, item.period_code):
            right_values[item.metric] = float(item.value)
    for metric, left_value in left_values.items():
        right_value = right_values.get(metric)
        if right_value is None or abs(left_value - right_value) < 1e-9:
            continue
        if greater and left_value < right_value:
            return (
                f"the answer states {left[0]}{left[1]} is higher than "
                f"{right[0]}{right[1]} on {metric}, but the published values are "
                f"{left_value} and {right_value}"
            )
        if not greater and left_value > right_value:
            return (
                f"the answer states {left[0]}{left[1]} is lower than "
                f"{right[0]}{right[1]} on {metric}, but the published values are "
                f"{left_value} and {right_value}"
            )
    return None


def check(answer: str, bundle: EvidenceBundle) -> ClaimResult:
    """Validate every scoped figure and qualitative claim in ``answer``."""
    items = list(bundle.items or [])
    result = ClaimResult(ok=True)

    districts = {i.district for i in items if i.district} | {
        bundle.requested.get("district") or ""
    }
    provinces = {i.province for i in items if i.province} | {
        bundle.requested.get("province") or ""
    }
    crops = {i.crop for i in items if i.crop} | {bundle.requested.get("crop") or ""}
    districts = {d for d in districts if d}
    provinces = {p for p in provinces if p}
    crops = {c for c in crops if c}

    has_capacity = any(
        any(token in item.metric for token in _CAPACITY_METRICS) for item in items
    )
    has_scenario = any(item.kind == EvidenceKind.SCENARIO for item in items)
    text_claims = _text_claims(bundle)

    for sentence in _sentences(answer):
        claims = list(_CLAIM.finditer(sentence))
        sentence_districts = _mentions(sentence, districts)
        sentence_provinces = _mentions(sentence, provinces)
        sentence_crops = _mentions(sentence, crops)
        sentence_periods = _periods_in(sentence)

        # --- qualitative: an effect asserted where only association exists ----
        if not has_scenario:
            for causal in _CAUSAL.finditer(sentence):
                if _has_negation(_clause_head(sentence, causal.end())):
                    continue
                result.ok = False
                result.violations.append(
                    ClaimViolation(
                        kind="causal_wording",
                        detail=(
                            "the answer asserts an effect, but the evidence for this "
                            "question is observational association only"
                        ),
                        claim=sentence[:280],
                    )
                )
                break

        # --- qualitative: an unknown capacity asserted as zero or available ---
        if not has_capacity and (
            _ZERO_CAPACITY.search(sentence) or _AVAILABLE_CAPACITY.search(sentence)
        ):
            result.ok = False
            result.violations.append(
                ClaimViolation(
                    kind="missing_value",
                    detail=(
                        "the answer states a storage capacity that no retrieved "
                        "observation supplies; an unknown capacity is not zero"
                    ),
                    claim=sentence[:280],
                )
            )

        # --- qualitative: comparison direction ---------------------------------
        contrast = _CONTRAST.search(sentence)
        if contrast:
            contrast_at = contrast.start()
            for pattern, greater in ((_GREATER, True), (_LESSER, False)):
                direction = pattern.search(sentence)
                if direction is None:
                    continue
                before = [d for d in sentence_districts if sentence.find(d) < contrast_at]
                after = [d for d in sentence_districts if sentence.find(d) > contrast_at]
                # A direction word sits either side of the contrast, so both
                # pairings a sentence can support are tried and either may reject.
                pairs = [(before, after)]
                if direction.start() > contrast_at:
                    pairs.append((after, before))
                detail = next(
                    (
                        found
                        for left, right in pairs
                        if left and right
                        for found in [_compare_entities(left, right, items, greater)]
                        if found
                    ),
                    None,
                )
                if detail:
                    result.ok = False
                    result.violations.append(
                        ClaimViolation(
                            kind="comparison_direction",
                            detail=detail,
                            claim=sentence[:280],
                        )
                    )
                left_periods = [p for p in sentence_periods if sentence.find(p[0]) < contrast_at]
                right_periods = [p for p in sentence_periods if sentence.find(p[0]) > contrast_at]
                if len(left_periods) == 1 and len(right_periods) == 1:
                    period_detail = _compare_periods(
                        left_periods[0], right_periods[0], items, greater
                    )
                    if period_detail:
                        result.ok = False
                        result.violations.append(
                            ClaimViolation(
                                kind="comparison_direction",
                                detail=period_detail,
                                claim=sentence[:280],
                            )
                        )

        # --- every scoped figure ---------------------------------------------
        for claim in claims:
            result.claims_checked += 1
            raw_number = claim.group("number")
            unit = canonical_unit(claim.group("unit"))
            try:
                value = float(raw_number.replace(",", ""))
            except ValueError:  # pragma: no cover - the regex cannot produce this
                continue
            if claim.group("sign") == "-":
                value = -value
            decimals = len(raw_number.split(".")[1]) if "." in raw_number else 0
            tolerance = 0.5 * (10 ** -decimals) + 1e-9

            numeric_items = [
                item
                for item in items
                if isinstance(item.value, int | float) and not isinstance(item.value, bool)
            ]
            matched = [
                item
                for item in numeric_items
                if (canonical_unit(item.unit) or "") == (unit or "")
                and abs(float(item.value) - value) <= tolerance
            ]

            if not matched:
                # The evidence's own prose may state the figure. A quoted reason, a
                # method note or a registry entry carries its numbers with its
                # units, and quoting it back is not a claim the evidence fails to
                # support.
                if any(
                    text_unit == (unit or "") and abs(text_value - abs(value)) <= tolerance
                    for text_value, text_unit in text_claims
                ):
                    continue

                # Otherwise: either the value is not in the evidence at all (which
                # the numeric guard also rejects; recorded here so one audit trail
                # carries the whole verdict), or it exists under a different unit -
                # a claim restated in the wrong unit, invisible to a digit check.
                elsewhere = [
                    item
                    for item in numeric_items
                    if abs(float(item.value) - value) <= tolerance
                ]
                # A published percentage change of the opposite sign is the same
                # mistake in a different costume: a fall written up as a rise. It
                # is reported as a direction error, which is what it is.
                inverted = [
                    item
                    for item in numeric_items
                    if (item.metric or "").endswith("_change_pct")
                    and float(item.value) != 0
                    and abs(float(item.value) + value) <= tolerance
                ]
                if inverted:
                    result.ok = False
                    result.violations.append(
                        ClaimViolation(
                            kind="change_direction",
                            detail=(
                                f"the answer states {raw_number}{unit} where the published "
                                f"change is {inverted[0].value}{unit} "
                                f"({inverted[0].metric})"
                            ),
                            claim=sentence[:280],
                        )
                    )
                    continue
                result.ok = False
                result.violations.append(
                    ClaimViolation(
                        kind="unit_mismatch" if elsewhere else "unsupported_value",
                        detail=(
                            f"{raw_number} {unit} is not a value the evidence carries in "
                            "that unit"
                            + (
                                "; it appears under "
                                + ", ".join(
                                    sorted(
                                        canonical_unit(i.unit) or "no unit" for i in elsewhere
                                    )
                                )
                                + " instead"
                                if elsewhere
                                else ""
                            )
                        ),
                        claim=sentence[:280],
                    )
                )
                continue

            result.scoped_checked += 1

            # --- metric family --------------------------------------------------
            # Read from the words the figure is attached to, not the sentence: a
            # figure is validated against the metric word it is written next to.
            clause = _clause_head(sentence, claim.start())
            family_names = tuple(
                name
                for pattern, names in _METRIC_FAMILIES
                if pattern.search(clause)
                for name in names
            )
            if family_names and not any(
                any(name in (item.metric or "") for name in family_names) for item in matched
            ):
                result.ok = False
                result.violations.append(
                    ClaimViolation(
                        kind="metric_mismatch",
                        detail=(
                            f"{raw_number} {unit} is attributed to "
                            f"{'/'.join(sorted(set(family_names)))} in the sentence, but the "
                            "matching evidence is "
                            + ", ".join(sorted({item.metric for item in matched}))
                        ),
                        claim=sentence[:280],
                    )
                )
                continue

            # --- crop / district / province / period scope -----------------------
            # Each dimension fires only when the *matched evidence itself* carries
            # that dimension. A national average mentioned alongside district names
            # is not a scope error, and a value with no crop attached (a national
            # total) never contradicts a sentence that names a crop. What this
            # catches is the value that is attached - to the wrong crop, the wrong
            # district, the wrong province or the wrong period.
            scoped_crops = [item.crop for item in matched if item.crop]
            scoped_districts = [item.district for item in matched if item.district]
            scoped_provinces = [item.province for item in matched if item.province]
            scoped_periods = [item.period_code for item in matched if item.period_code]

            scope_mismatch: str | None = None
            if (
                sentence_crops
                and scoped_crops
                and not any(crop in sentence_crops for crop in scoped_crops)
            ):
                scope_mismatch = (
                    f"the sentence names {', '.join(sentence_crops)} but {raw_number} {unit} "
                    f"is published for {', '.join(sorted(set(scoped_crops)))} only"
                )
            elif (
                sentence_districts
                and scoped_districts
                and not any(district in sentence_districts for district in scoped_districts)
            ):
                scope_mismatch = (
                    f"the sentence names {', '.join(sentence_districts)} but {raw_number} "
                    f"{unit} is published for {', '.join(sorted(set(scoped_districts)))} only"
                )
            elif (
                not sentence_districts
                and sentence_provinces
                and scoped_provinces
                and not any(province in sentence_provinces for province in scoped_provinces)
            ):
                scope_mismatch = (
                    f"the sentence names {', '.join(sentence_provinces)} but {raw_number} "
                    f"{unit} is published for {', '.join(sorted(set(scoped_provinces)))} only"
                )
            elif (
                sentence_periods
                and scoped_periods
                and not any(
                    _period_covers(mention, code)
                    for mention in sentence_periods
                    for code in scoped_periods
                )
            ):
                scope_mismatch = (
                    f"the sentence places {raw_number} {unit} in "
                    + ", ".join(f"{year}{season}" for year, season in sentence_periods)
                    + " but the matching evidence describes "
                    + ", ".join(sorted(set(scoped_periods)))
                )

            if scope_mismatch:
                result.ok = False
                result.violations.append(
                    ClaimViolation(
                        kind="scope_mismatch",
                        detail=scope_mismatch,
                        claim=sentence[:280],
                    )
                )
                continue

            # --- percentage-change direction -------------------------------------
            pct_items = [
                item for item in matched if (item.metric or "").endswith("_change_pct")
            ]
            if pct_items:
                published = float(pct_items[0].value)
                if published < 0 and _RISE.search(sentence) and not _FALL.search(sentence):
                    result.ok = False
                    result.violations.append(
                        ClaimViolation(
                            kind="change_direction",
                            detail=(
                                f"the answer describes a rise, but the published change is "
                                f"{published}% ({pct_items[0].metric})"
                            ),
                            claim=sentence[:280],
                        )
                    )
                elif published > 0 and _FALL.search(sentence) and not _RISE.search(sentence):
                    result.ok = False
                    result.violations.append(
                        ClaimViolation(
                            kind="change_direction",
                            detail=(
                                f"the answer describes a fall, but the published change is "
                                f"{published}% ({pct_items[0].metric})"
                            ),
                            claim=sentence[:280],
                        )
                    )

    return result
