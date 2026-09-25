"""Transparent, configurable Intervention Priority engine.

    score = wg*gap + wv*vulnerability + wf*affected_scale + wr*readiness
            - wc*cost_constraint

Every input is normalized to [0, 1] before weighting. Weights and all component
values are returned so the ranking is fully auditable. This is decision support,
not a binding decision. See docs/11_INTERVENTION_ENGINE.md.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

DEFAULT_WEIGHTS = {
    "wg": 0.30,  # productivity gap
    "wv": 0.20,  # vulnerability / exposure
    "wf": 0.20,  # affected scale (farmers/area)
    "wr": 0.20,  # readiness
    "wc": 0.10,  # cost constraint (subtracted)
}


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
    """Min-max normalize a mapping to [0, 1]; constant series map to 0.5."""
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


def rank(candidates: list[dict], weights: dict | None = None) -> list[dict]:
    """Rank candidate dicts.

    Each candidate must provide ``gap``, ``vulnerability``, ``affected_scale``,
    ``readiness`` and ``cost_constraint`` (raw units). They are min-max
    normalized across the candidate set before scoring.
    """
    fields = ["gap", "vulnerability", "affected_scale", "readiness", "cost_constraint"]
    normalized = {f: normalize({c["id"]: c.get(f, 0.0) for c in candidates}) for f in fields}

    results = []
    for c in candidates:
        cid = c["id"]
        r = priority_score(
            gap=normalized["gap"].get(cid, 0.0),
            vulnerability=normalized["vulnerability"].get(cid, 0.0),
            affected_scale=normalized["affected_scale"].get(cid, 0.0),
            readiness=normalized["readiness"].get(cid, 0.0),
            cost_constraint=normalized["cost_constraint"].get(cid, 0.0),
            weights=weights,
        )
        results.append({**c, **(r.as_dict())})
    return sorted(results, key=lambda x: x["score"], reverse=True)
