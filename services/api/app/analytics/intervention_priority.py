"""Transparent, configurable Intervention Priority engine.

    score = wg*gap + wv*vulnerability + wf*affected_scale + wr*readiness
            - wc*cost_constraint

Every input is normalized to [0, 1] before weighting. Weights and all component
values are returned so the ranking is fully auditable. This is decision support,
not a binding decision. See docs/DATA_AND_METHODS.md.

Methodology 2.0.0 — what changed and why
----------------------------------------

The engine used to rank every published district x crop candidate by the same
weighted sum, with ``gap`` min-max normalized across the whole population. Two
consequences were wrong in a way a planner could not see:

* **A candidate above its benchmark could rank HIGH.** ``gap_index`` is negative
  above the benchmark, but min-max normalization maps the *lowest* value to 0 and
  everything above it upwards, so a district with no shortfall at all still
  received a positive gap component. With a large harvested area it could reach
  the HIGH band and be presented as a productivity-support priority.
* **A constant component manufactured evidence.** Normalizing a series that does
  not vary returned a neutral ``0.5`` for every candidate, so a perishability
  value that was identical across a crop contributed a "vulnerability" component
  as though it distinguished districts.

Methodology 2.0.0 therefore makes three things explicit:

1. **A planning purpose.** ``productivity_support`` candidates must have a
   published, positive yield shortfall. ``harvest_coordination`` answers a
   different question (operational scale and perishability) and is named
   differently everywhere it appears. A shortfall ranking is never presented as a
   scale ranking, or the reverse.
2. **Eligibility rather than a fabricated score.** A candidate above its
   benchmark is **ineligible**, not LOW. It is reported with a reason and no
   score, because "not a shortfall" and "a small shortfall" are different facts.
3. **A stable, stated reference population.** Scores are normalized over one
   declared population (the same crop/period/benchmark scope), computed once. The
   display narrowing a planner applies — inspecting a single district — does not
   redefine that population, so inspecting a district cannot change its
   benchmark, its components or its score.

Normalization detail: the gap component is built from the **non-negative
shortfall** ``max(gap_index, 0)``, never the signed gap, so a large surplus can
never contribute positively to a shortfall score.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

# --- planning purposes ------------------------------------------------------

#: Support productivity where a verified shortfall exists.
PURPOSE_PRODUCTIVITY_SUPPORT = "productivity_support"
#: Coordinate a harvest: operational scale and perishability, not shortfall.
PURPOSE_HARVEST_COORDINATION = "harvest_coordination"

PURPOSES: tuple[str, ...] = (PURPOSE_PRODUCTIVITY_SUPPORT, PURPOSE_HARVEST_COORDINATION)
DEFAULT_PURPOSE = PURPOSE_PRODUCTIVITY_SUPPORT

PURPOSE_LABELS: dict[str, str] = {
    PURPOSE_PRODUCTIVITY_SUPPORT: "Productivity support",
    PURPOSE_HARVEST_COORDINATION: "Harvest coordination",
}

PURPOSE_NOTES: dict[str, str] = {
    PURPOSE_PRODUCTIVITY_SUPPORT: (
        "Candidates must have a published yield below the selected benchmark. A "
        "candidate at or above its benchmark is ineligible and is reported as "
        "ineligible - never as a low-scoring or high-scoring priority."
    ),
    PURPOSE_HARVEST_COORDINATION: (
        "Ranks operational importance by published production/harvested-area scale "
        "and crop perishability. This is not a productivity-shortfall ranking and "
        "does not require a shortfall."
    ),
}

#: The methodology version. Bumped whenever the *meaning* of a score changes, so a
#: published ranking can be reproduced or recognised as superseded.
METHODOLOGY_VERSION = "2.0.1"

#: A candidate must be at least this far below its benchmark to count as a
#: shortfall. Zero means "any published shortfall"; it is explicit and adjustable
#: rather than implied.
DEFAULT_SHORTFALL_THRESHOLD_PCT = 0.0

#: Component ids, in the engine's own order.
COMPONENTS: tuple[str, ...] = (
    "gap_index",
    "vulnerability",
    "affected_scale",
    "readiness",
    "cost_constraint",
)

#: The raw candidate field each component is read from.
COMPONENT_FIELDS: dict[str, str] = {
    "gap_index": "gap",
    "vulnerability": "vulnerability",
    "affected_scale": "affected_scale",
    "readiness": "readiness",
    "cost_constraint": "cost_constraint",
}

COMPONENT_LABELS: dict[str, str] = {
    "gap_index": "Productivity gap",
    "vulnerability": "Vulnerability / exposure",
    # Harvested area is exposure, not a count of people. The label must not imply
    # a measured beneficiary count the source does not publish.
    "affected_scale": "Exposure (harvested area)",
    "readiness": "Readiness",
    "cost_constraint": "Cost constraint",
}

DEFAULT_WEIGHTS = {
    "wg": 0.30,  # productivity gap
    "wv": 0.20,  # vulnerability / exposure
    "wf": 0.20,  # affected scale (farmers/area)
    "wr": 0.20,  # readiness
    "wc": 0.10,  # cost constraint (subtracted)
}

#: Starting weighting per purpose. Harvest coordination emphasizes scale and
#: perishability, and puts no weight on a shortfall it does not require.
PURPOSE_WEIGHTS: dict[str, dict[str, float]] = {
    PURPOSE_PRODUCTIVITY_SUPPORT: dict(DEFAULT_WEIGHTS),
    PURPOSE_HARVEST_COORDINATION: {"wg": 0.0, "wv": 0.35, "wf": 0.55, "wr": 0.10, "wc": 0.0},
}


class UnscorableWeights(ValueError):
    """No positively weighted component can distinguish the candidates."""


@dataclass(frozen=True)
class PriorityResult:
    score: float
    band: str
    gap_component: float
    vulnerability_component: float
    affected_scale_component: float
    readiness_component: float
    cost_component: float
    weights: dict

    def as_dict(self) -> dict:
        return asdict(self)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def normalize(values: dict[str, float]) -> dict[str, float]:
    """Min-max normalize a mapping to [0, 1].

    A constant series returns 0.5 for every key. Callers that must not read a
    constant as a measurement (the priority engine) use
    :func:`build_population`, which excludes a constant component instead.
    """
    if not values:
        return {}
    lo, hi = min(values.values()), max(values.values())
    if hi == lo:
        return {k: 0.5 for k in values}
    return {k: (v - lo) / (hi - lo) for k, v in values.items()}


def band_for(score: float) -> str:
    if score >= 0.75:
        return "CRITICAL"
    if score >= 0.5:
        return "HIGH"
    if score >= 0.25:
        return "MEDIUM"
    return "LOW"


def priority_score(
    gap: float,
    vulnerability: float,
    affected_scale: float,
    readiness: float,
    cost_constraint: float,
    weights: dict | None = None,
) -> PriorityResult:
    """Compute a priority score from already-normalized [0, 1] inputs."""
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    gap_c = _clamp01(gap)
    vuln_c = _clamp01(vulnerability)
    scale_c = _clamp01(affected_scale)
    ready_c = _clamp01(readiness)
    cost_c = _clamp01(cost_constraint)

    score = (
        w["wg"] * gap_c
        + w["wv"] * vuln_c
        + w["wf"] * scale_c
        + w["wr"] * ready_c
        - w["wc"] * cost_c
    )
    score = _clamp01(score)
    return PriorityResult(
        score=round(score, 4),
        band=band_for(score),
        gap_component=gap_c,
        vulnerability_component=vuln_c,
        affected_scale_component=scale_c,
        readiness_component=ready_c,
        cost_component=cost_c,
        weights=w,
    )


# --- eligibility ------------------------------------------------------------


def shortfall_pct(gap_pct: float | None) -> float | None:
    """The **non-negative** shortfall implied by a signed gap.

    ``gap_index = 100 * (1 - yield / benchmark)`` is positive when the observed
    yield is below the benchmark and negative when it is above. Only the positive
    part is a shortfall; the surplus is discarded rather than clamped into a
    positive component.
    """
    if gap_pct is None:
        return None
    try:
        value = float(gap_pct)
    except (TypeError, ValueError):
        return None
    if value != value:  # NaN
        return None
    return max(0.0, value)


def eligibility(
    *,
    gap_pct: float | None,
    purpose: str = DEFAULT_PURPOSE,
    threshold_pct: float = DEFAULT_SHORTFALL_THRESHOLD_PCT,
    harvested_area_ha: float | None = None,
) -> tuple[bool, str | None]:
    """Is this candidate a legitimate target for the planning purpose?

    Returns ``(eligible, reason)``. The reason is present exactly when the
    candidate is ineligible, and states the *fact* that makes it ineligible so a
    reader can check it against the published data.
    """
    if purpose not in PURPOSES:
        raise ValueError(f"unknown planning purpose {purpose!r}; expected one of {PURPOSES}")

    if purpose == PURPOSE_PRODUCTIVITY_SUPPORT:
        if gap_pct is None:
            return False, (
                "no published benchmark comparison for this candidate, so no "
                "shortfall can be established"
            )
        gap = float(gap_pct)
        if gap <= threshold_pct:
            relation = "above" if gap < 0 else "below" if gap > 0 else "at"
            return False, (
                f"yield is {abs(gap):.1f}% {relation} the selected benchmark and does not "
                f"meet the support threshold (threshold: more than "
                f"{threshold_pct:.1f}% below)"
            )
        return True, None

    # harvest_coordination: an operational ranking over what was actually
    # produced, so the requirement is a measured quantity rather than a shortfall.
    if harvested_area_ha is None:
        return False, (
            "no published harvested area for this candidate, so its operational scale "
            "cannot be established"
        )
    if float(harvested_area_ha) <= 0:
        return False, (
            f"published harvested area is {float(harvested_area_ha):.1f} ha, which is not a "
            "coordination requirement"
        )
    return True, None


# --- population -------------------------------------------------------------


@dataclass(frozen=True)
class Population:
    """One stated reference population, normalized once.

    ``normalized`` holds, per component, the [0, 1] value for each eligible
    candidate. ``excluded`` names the components that carry no discriminating
    information *for this population* - either absent from the release or
    constant across it - and whose weight is therefore redistributed.
    """

    purpose: str
    threshold_pct: float
    eligible_ids: tuple[str, ...] = ()
    ineligible: dict[str, str] = field(default_factory=dict)
    normalized: dict[str, dict[str, float]] = field(default_factory=dict)
    unavailable: tuple[str, ...] = ()
    constant: tuple[str, ...] = ()
    reference_note: str = ""

    @property
    def n_reference(self) -> int:
        return len(self.eligible_ids)

    def as_dict(self) -> dict:
        return {
            "purpose": self.purpose,
            "n_reference": self.n_reference,
            "n_ineligible": len(self.ineligible),
            "components_unavailable": list(self.unavailable),
            "components_constant": list(self.constant),
            "reference_note": self.reference_note,
        }


def effective_weights(
    weights: dict | None, excluded: tuple[str, ...], *, purpose: str = DEFAULT_PURPOSE
) -> dict:
    """Redistribute the weight of excluded components over the rest.

    Redistribution preserves the *relative* shape of the remaining weighting, so
    a planner who put most weight on the gap keeps that emphasis. It is applied
    only to components that carry no discriminating information for the
    population; a component that is merely small is not dropped.
    """
    engine_keys = {"gap_index": "wg", "vulnerability": "wv", "affected_scale": "wf",
                   "readiness": "wr", "cost_constraint": "wc"}
    merged = {**PURPOSE_WEIGHTS[purpose], **(weights or {})}
    dropped = {engine_keys[c] for c in excluded if c in engine_keys}
    kept_total = sum(v for k, v in merged.items() if k not in dropped and v > 0)
    if kept_total <= 0:
        raise UnscorableWeights(
            "The selected weights have no usable varying component for this population. "
            "Choose a weight on an available component or broaden the selection."
        )
    if not dropped:
        return {key: float(value) for key, value in merged.items()}
    out = {}
    for key, value in merged.items():
        if key in dropped:
            out[key] = 0.0
        else:
            out[key] = float(value) / kept_total
    return out


def build_population(
    candidates: list[dict],
    *,
    purpose: str = DEFAULT_PURPOSE,
    threshold_pct: float = DEFAULT_SHORTFALL_THRESHOLD_PCT,
    unavailable: tuple[str, ...] = (),
    reference_note: str = "",
) -> Population:
    """Split candidates by eligibility and normalize the eligible ones.

    Called once per stated reference population. Every consumer - the ranking
    endpoint, the map, the scenario comparison, the sensitivity sweep and the
    assistant tools - reads its components from here, so they cannot disagree
    about who is a priority.
    """
    if purpose not in PURPOSES:
        raise ValueError(f"unknown planning purpose {purpose!r}; expected one of {PURPOSES}")

    if purpose == PURPOSE_HARVEST_COORDINATION:
        unavailable = tuple(dict.fromkeys((*unavailable, "gap_index")))

    eligible: list[dict] = []
    ineligible: dict[str, str] = {}
    for candidate in candidates:
        ok, reason = eligibility(
            gap_pct=candidate.get("gap"),
            purpose=purpose,
            threshold_pct=threshold_pct,
            harvested_area_ha=candidate.get("harvested_area_ha"),
        )
        if ok:
            eligible.append(candidate)
        else:
            ineligible[str(candidate.get("id"))] = reason or "ineligible"

    if not eligible:
        return Population(
            purpose=purpose,
            threshold_pct=threshold_pct,
            ineligible=ineligible,
            unavailable=tuple(unavailable),
            reference_note=reference_note,
        )

    normalized: dict[str, dict[str, float]] = {}
    constant: list[str] = []
    excluded: list[str] = list(unavailable)

    for component in COMPONENTS:
        field_name = COMPONENT_FIELDS[component]
        raw: dict[str, float] = {}
        for candidate in eligible:
            value = candidate.get(field_name)
            if value is None:
                continue
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            if number != number:
                continue
            # The gap component is the non-negative shortfall, never the signed
            # gap: a surplus must not contribute to a shortfall score.
            raw[str(candidate["id"])] = max(0.0, number) if component == "gap_index" else number

        if component in unavailable or len(raw) < 2:
            # Either the release does not carry the component, or there is nothing
            # to compare. Both mean "no discriminating information": exclude it
            # rather than assign every candidate a neutral 0.5.
            if component not in excluded:
                excluded.append(component)
            if component not in unavailable and len(raw) < 2:
                constant.append(component)
            continue

        if max(raw.values()) == min(raw.values()):
            # A constant series over this population. Ranking on it would
            # manufacture a difference between districts that the data do not
            # contain, so its weight is redistributed instead.
            excluded.append(component)
            constant.append(component)
            continue

        normalized[component] = normalize(raw)

    return Population(
        purpose=purpose,
        threshold_pct=threshold_pct,
        eligible_ids=tuple(str(c["id"]) for c in eligible),
        ineligible=ineligible,
        normalized=normalized,
        unavailable=tuple(excluded),
        constant=tuple(constant),
        reference_note=reference_note,
    )


def score_candidate(candidate: dict, population: Population, weights: dict | None = None) -> PriorityResult:
    """Score one eligible candidate against a population's normalization."""
    components = population.normalized
    cid = str(candidate["id"])
    return priority_score(
        gap=components.get("gap_index", {}).get(cid, 0.0),
        vulnerability=components.get("vulnerability", {}).get(cid, 0.0),
        affected_scale=components.get("affected_scale", {}).get(cid, 0.0),
        readiness=components.get("readiness", {}).get(cid, 0.0),
        cost_constraint=components.get("cost_constraint", {}).get(cid, 0.0),
        weights=weights,
    )


def rank(
    candidates: list[dict],
    weights: dict | None = None,
    *,
    purpose: str = DEFAULT_PURPOSE,
    threshold_pct: float = DEFAULT_SHORTFALL_THRESHOLD_PCT,
    unavailable: tuple[str, ...] = (),
) -> list[dict]:
    """Score and order the **eligible** candidates under one weighting.

    Ineligible candidates are not returned: an above-benchmark district must not
    appear in a productivity-support ranking at all, and reporting it as LOW would
    still present it as a priority of some degree. Callers get the eligibility
    reasons from :func:`build_population`.

    Each candidate must provide ``gap``, ``vulnerability``, ``affected_scale``,
    ``readiness`` and ``cost_constraint`` (raw units).
    """
    population = build_population(
        candidates, purpose=purpose, threshold_pct=threshold_pct, unavailable=unavailable
    )
    if not population.eligible_ids:
        return []

    by_id = {str(c["id"]): c for c in candidates}
    effective = effective_weights(weights, population.unavailable, purpose=purpose)
    results = []
    for cid in population.eligible_ids:
        candidate = by_id[cid]
        scored = score_candidate(candidate, population, weights=effective)
        results.append(
            {
                **candidate,
                **scored.as_dict(),
                "eligible": True,
                "eligibility_reason": None,
                "shortfall_pct": shortfall_pct(candidate.get("gap")),
                "priority_purpose": purpose,
                "reference_n": population.n_reference,
            }
        )
    return sorted(results, key=lambda row: row["score"], reverse=True)


def reference_population_note(*, purpose: str, scope: str) -> str:
    """One sentence naming the population a score is relative to."""
    base = (
        f"Scores are relative to the {scope} reference population: every eligible "
        "district x crop candidate in the same crop, period and benchmark scope."
    )
    if purpose == PURPOSE_PRODUCTIVITY_SUPPORT:
        return base + " Inspecting a single district does not change that population or its score."
    return base
