"""Transparent, configurable Intervention Priority scoring.

    score = wg*gap + wv*vulnerability + wf*affected_scale + wr*readiness
            - wc*cost_constraint

All inputs are normalized to [0, 1] before weighting. Weights and components are
returned with every result. Decision support only. See docs/11_INTERVENTION_ENGINE.md.
"""

from __future__ import annotations

from collections.abc import Sequence

DEFAULT_WEIGHTS = {"wg": 0.30, "wv": 0.20, "wf": 0.20, "wr": 0.20, "wc": 0.10}


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
    """Min-max normalize to [0, 1]; constant series map to 0.5."""
    if not values:
        return {}
    lo, hi = min(values.values()), max(values.values())
    if hi == lo:
        return {k: 0.5 for k in values}
    return {k: (v - lo) / (hi - lo) for k, v in values.items()}


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


def rank(candidates: Sequence[dict], weights: dict | None = None) -> list[dict]:
    """Rank candidates after normalizing their raw component values."""
    fields = ["gap", "vulnerability", "affected_scale", "readiness", "cost_constraint"]
    normalized = {f: normalize({c["id"]: c.get(f, 0.0) for c in candidates}) for f in fields}
    results = []
    for c in candidates:
        cid = c["id"]
        scored = priority_score(
            gap=normalized["gap"].get(cid, 0.0),
            vulnerability=normalized["vulnerability"].get(cid, 0.0),
            affected_scale=normalized["affected_scale"].get(cid, 0.0),
            readiness=normalized["readiness"].get(cid, 0.0),
            cost_constraint=normalized["cost_constraint"].get(cid, 0.0),
            weights=weights,
        )
        results.append({**c, **scored})
    return sorted(results, key=lambda r: r["score"], reverse=True)
