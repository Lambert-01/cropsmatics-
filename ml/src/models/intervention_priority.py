"""Transparent, configurable Intervention Priority scoring (offline mirror).

    score = wg*gap + wv*vulnerability + wf*affected_scale + wr*readiness
            - wc*cost_constraint

All inputs are normalized to [0, 1] before weighting. Weights and components are
returned with every result. Decision support only. See docs/DATA_AND_METHODS.md.

Methodology 2.0.0 parity
------------------------

The served engine lives in ``services/api/app/analytics/intervention_priority.py``
and is the authority. This module must run standalone (the ML pipeline is
installed without the API package), so the rule is **stated here independently
rather than imported**, which means the two can only stay in step if both are
tested against the same behaviour:

* a candidate must have a published **positive shortfall** (``max(gap, 0) > threshold``)
  to be eligible for a productivity-support ranking;
* an ineligible candidate is **excluded**, never returned as a low-scoring row;
* a component that is constant across the population is **excluded** and its
  weight redistributed, so a value that is identical everywhere cannot be scored
  as though it distinguished districts;
* the gap component is built from the non-negative shortfall, never the signed gap.

``ml/tests/test_intervention_priority_parity.py`` pins the same cases the API
suite pins. If you change one implementation, change both and re-run both suites.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

DEFAULT_WEIGHTS = {"wg": 0.30, "wv": 0.20, "wf": 0.20, "wr": 0.20, "wc": 0.10}

PURPOSE_PRODUCTIVITY_SUPPORT = "productivity_support"
PURPOSE_HARVEST_COORDINATION = "harvest_coordination"
PURPOSES = (PURPOSE_PRODUCTIVITY_SUPPORT, PURPOSE_HARVEST_COORDINATION)
DEFAULT_PURPOSE = PURPOSE_PRODUCTIVITY_SUPPORT
DEFAULT_SHORTFALL_THRESHOLD_PCT = 0.0
METHODOLOGY_VERSION = "2.0.1"
PURPOSE_WEIGHTS = {
    PURPOSE_PRODUCTIVITY_SUPPORT: dict(DEFAULT_WEIGHTS),
    PURPOSE_HARVEST_COORDINATION: {"wg": 0.0, "wv": 0.35, "wf": 0.55, "wr": 0.10, "wc": 0.0},
}


class UnscorableWeights(ValueError):
    """No positively weighted component can distinguish the candidates."""

#: Component id -> the raw candidate field it is read from.
COMPONENT_FIELDS = {
    "gap_index": "gap",
    "vulnerability": "vulnerability",
    "affected_scale": "affected_scale",
    "readiness": "readiness",
    "cost_constraint": "cost_constraint",
}

#: Component id -> engine weight key.
COMPONENT_WEIGHT_KEYS = {
    "gap_index": "wg",
    "vulnerability": "wv",
    "affected_scale": "wf",
    "readiness": "wr",
    "cost_constraint": "wc",
}

FIELDS = list(COMPONENT_FIELDS.values())


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def band_for(score: float) -> str:
    if score >= 0.75:
        return "CRITICAL"
    if score >= 0.5:
        return "HIGH"
    if score >= 0.25:
        return "MEDIUM"
    return "LOW"


def normalize(values: dict) -> dict:
    """Min-max normalize to [0, 1]; constant series map to 0.5.

    Callers that must not read a constant as a measurement use
    :func:`build_population`, which excludes it instead.
    """
    if not values:
        return {}
    lo, hi = min(values.values()), max(values.values())
    if hi == lo:
        return {k: 0.5 for k in values}
    return {k: (v - lo) / (hi - lo) for k, v in values.items()}


def shortfall_pct(gap_pct) -> float | None:
    """The non-negative shortfall implied by a signed gap."""
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
    gap_pct,
    purpose: str = DEFAULT_PURPOSE,
    threshold_pct: float = DEFAULT_SHORTFALL_THRESHOLD_PCT,
    harvested_area_ha=None,
) -> tuple[bool, str | None]:
    """Is this candidate a legitimate target for the planning purpose?"""
    if purpose not in PURPOSES:
        raise ValueError(f"unknown planning purpose {purpose!r}; expected one of {PURPOSES}")

    if purpose == PURPOSE_PRODUCTIVITY_SUPPORT:
        if gap_pct is None:
            return False, (
                "no published benchmark comparison for this candidate, so no shortfall "
                "can be established"
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


@dataclass(frozen=True)
class Population:
    """One stated reference population, normalized once."""

    purpose: str = DEFAULT_PURPOSE
    threshold_pct: float = DEFAULT_SHORTFALL_THRESHOLD_PCT
    eligible_ids: tuple[str, ...] = ()
    ineligible: dict[str, str] = field(default_factory=dict)
    normalized: dict[str, dict[str, float]] = field(default_factory=dict)
    unavailable: tuple[str, ...] = ()
    constant: tuple[str, ...] = ()

    @property
    def n_reference(self) -> int:
        return len(self.eligible_ids)


def effective_weights(
    weights: dict | None, excluded: tuple[str, ...], *, purpose: str = DEFAULT_PURPOSE
) -> dict:
    """Redistribute the weight of excluded components over the remaining ones."""
    merged = {**PURPOSE_WEIGHTS[purpose], **(weights or {})}
    dropped = {COMPONENT_WEIGHT_KEYS[c] for c in excluded if c in COMPONENT_WEIGHT_KEYS}
    kept_total = sum(v for k, v in merged.items() if k not in dropped and v > 0)
    if kept_total <= 0:
        raise UnscorableWeights(
            "The selected weights have no usable varying component for this population. "
            "Choose a weight on an available component or broaden the selection."
        )
    if not dropped:
        return {key: float(value) for key, value in merged.items()}
    return {
        key: (0.0 if key in dropped else float(value) / kept_total)
        for key, value in merged.items()
    }


def build_population(
    candidates: Sequence[dict],
    *,
    purpose: str = DEFAULT_PURPOSE,
    threshold_pct: float = DEFAULT_SHORTFALL_THRESHOLD_PCT,
    unavailable: tuple[str, ...] = (),
) -> Population:
    """Split the candidates by eligibility and normalize the eligible ones."""
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
            normalized={},
            unavailable=tuple(unavailable),
        )

    normalized: dict[str, dict[str, float]] = {}
    constant: list[str] = []
    excluded: list[str] = list(unavailable)

    for component, field_name in COMPONENT_FIELDS.items():
        raw: dict[str, float] = {}
        for candidate in eligible:
            value = candidate.get(field_name)
            if value is None:
                continue
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            if number != number:  # NaN
                continue
            raw[str(candidate["id"])] = (
                max(0.0, number) if component == "gap_index" else number
            )

        if component in unavailable or len(raw) < 2:
            if component not in excluded:
                excluded.append(component)
            if component not in unavailable and len(raw) < 2:
                constant.append(component)
            continue

        if max(raw.values()) == min(raw.values()):
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
    )


def priority_score(
    gap: float,
    vulnerability: float,
    affected_scale: float,
    readiness: float,
    cost_constraint: float,
    weights: dict | None = None,
) -> dict:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    components = {
        "gap": _clamp01(gap),
        "vulnerability": _clamp01(vulnerability),
        "affected_scale": _clamp01(affected_scale),
        "readiness": _clamp01(readiness),
        "cost_constraint": _clamp01(cost_constraint),
    }
    score = (
        w["wg"] * components["gap"]
        + w["wv"] * components["vulnerability"]
        + w["wf"] * components["affected_scale"]
        + w["wr"] * components["readiness"]
        - w["wc"] * components["cost_constraint"]
    )
    score = _clamp01(score)
    return {"score": round(score, 4), "band": band_for(score), "weights": w, "components": components}


def rank(
    candidates: Sequence[dict],
    weights: dict | None = None,
    *,
    purpose: str = DEFAULT_PURPOSE,
    threshold_pct: float = DEFAULT_SHORTFALL_THRESHOLD_PCT,
    unavailable: tuple[str, ...] = (),
) -> list[dict]:
    """Score and order the **eligible** candidates under one weighting.

    Ineligible candidates are not returned. See the module docstring.
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
        components = population.normalized
        scored = priority_score(
            gap=components.get("gap_index", {}).get(cid, 0.0),
            vulnerability=components.get("vulnerability", {}).get(cid, 0.0),
            affected_scale=components.get("affected_scale", {}).get(cid, 0.0),
            readiness=components.get("readiness", {}).get(cid, 0.0),
            cost_constraint=components.get("cost_constraint", {}).get(cid, 0.0),
            weights=effective,
        )
        results.append(
            {
                **candidate,
                **scored,
                "eligible": True,
                "shortfall_pct": shortfall_pct(candidate.get("gap")),
                "priority_purpose": purpose,
                "reference_n": population.n_reference,
            }
        )
    return sorted(results, key=lambda r: r["score"], reverse=True)
