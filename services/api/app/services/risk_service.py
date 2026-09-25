"""Transparent post-harvest risk scoring.

MVP uses a documented additive rule model (not a black box). Each contribution is
returned so the UI can explain *why*. A calibrated classifier can replace this
later behind the same interface. See docs/12_POST_HARVEST_MODEL.md.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

_PERISHABILITY_RISK = {"high": 0.35, "medium": 0.2, "low": 0.05}
_RAINFALL_RISK = {"high": 0.2, "moderate": 0.1, "low": 0.0}


@dataclass
class RiskResult:
    probability: float
    band: str
    contributing_factors: list[str] = field(default_factory=list)
    recommended_actions: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def _band(p: float) -> str:
    if p >= 0.66:
        return "HIGH"
    if p >= 0.33:
        return "MODERATE"
    return "LOW"


def _load_postharvest():
    """Load the processed post-harvest table, or None if not built yet."""
    from app.core.config import get_settings

    path = get_settings().processed_dir / "crop_postharvest_use.csv"
    if not path.exists():
        return None
    import pandas as pd

    return pd.read_csv(path)


def _historical_loss_pct(crop: str) -> float | None:
    try:
        post = _load_postharvest()
    except Exception:
        post = None
    if post is None or "crop" not in post.columns:
        return None
    row = post[post["crop"] == crop]
    if row.empty:
        return None
    val = row.iloc[0].get("post_harvest_losses_pct")
    return None if val is None else float(val)


def score(
    crop: str,
    expected_quantity_kg: float | None,
    perishability: str | None = None,
    rainfall_risk: str | None = None,
    distance_km: float | None = None,
    capacity_available_kg: float | None = None,
) -> RiskResult:
    """Score post-harvest risk and explain the contributions."""
    score_val = 0.05  # baseline
    factors: list[str] = []
    actions: list[str] = []

    p = (perishability or "medium").lower()
    contrib = _PERISHABILITY_RISK.get(p, 0.2)
    score_val += contrib
    factors.append(f"crop perishability: {p} (+{contrib:.2f})")
    if p == "high":
        actions.append("Prioritise rapid cooling / same-day transport")

    rain = (rainfall_risk or "").lower()
    if rain in _RAINFALL_RISK:
        r = _RAINFALL_RISK[rain]
        score_val += r
        factors.append(f"rainfall risk: {rain} (+{r:.2f})")
        if r > 0:
            actions.append("Use covered storage and bring harvest forward if possible")

    if expected_quantity_kg:
        if expected_quantity_kg >= 1000:
            score_val += 0.1
            factors.append(f"large expected volume: {expected_quantity_kg:.0f} kg (+0.10)")
            actions.append("Split load across multiple facilities")
        elif expected_quantity_kg >= 300:
            score_val += 0.05
            factors.append(f"moderate expected volume: {expected_quantity_kg:.0f} kg (+0.05)")

    hist = _historical_loss_pct(crop)
    if hist is not None:
        add = min(0.2, hist / 100.0)
        score_val += add
        factors.append(f"historical post-harvest loss for {crop}: {hist:.2f}% (+{add:.2f})")

    if capacity_available_kg is None:
        factor_note = "capacity not verified — treated conservatively"
        score_val += 0.05
        factors.append(factor_note)
        actions.append("Confirm facility capacity before dispatch")
    elif expected_quantity_kg and capacity_available_kg < expected_quantity_kg:
        score_val += 0.15
        factors.append("available capacity below expected harvest (+0.15)")
        actions.append("Request additional storage or reduce volume per facility")

    if distance_km is not None and distance_km > 25:
        score_val += 0.1
        factors.append(f"long travel distance: {distance_km:.0f} km (+0.10)")
        actions.append("Minimise transport time; avoid peak heat hours")

    probability = round(max(0.0, min(1.0, score_val)), 3)
    if not actions:
        actions.append("Standard handling is sufficient; monitor as usual")
    return RiskResult(probability=probability, band=_band(probability),
                      contributing_factors=factors, recommended_actions=actions)
