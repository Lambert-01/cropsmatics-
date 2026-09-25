"""Transparent post-harvest risk scoring.

The MVP uses a documented additive rule model (not a black box). Every
contribution is returned in two forms:

* ``factors`` / ``actions`` - structured, so the UI can show *factor, value,
  impact and reason* (and *action, reason, priority*) directly;
* ``contributing_factors`` / ``recommended_actions`` - the same information as
  human-readable strings, kept for backward compatibility with existing clients
  and the stored ``RiskScore`` rows.

The result is a **risk score produced by a documented rule model**, with the
model version attached. It is deliberately never labelled "AI confidence" or
"probability of loss": the weights are expert-set, not calibrated on local
outcomes. A calibrated classifier can replace this behind the same interface.
See docs/12_POST_HARVEST_MODEL.md.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

MODEL_VERSION = "rule-based-risk-0.1.0"

_PERISHABILITY_RISK = {"high": 0.35, "medium": 0.2, "low": 0.05}
_RAINFALL_RISK = {"high": 0.2, "moderate": 0.1, "low": 0.0}

# Priority of a recommended action, by how much it can reduce the score.
PRIORITY_HIGH = "HIGH"
PRIORITY_MEDIUM = "MEDIUM"
PRIORITY_LOW = "LOW"


@dataclass
class RiskFactor:
    """One contribution to the score, with its reason stated in plain language."""

    factor: str
    factor_value: str | None
    impact: float
    reason: str

    def as_dict(self) -> dict:
        return asdict(self)

    def as_line(self) -> str:
        value = f": {self.factor_value}" if self.factor_value else ""
        return f"{self.factor}{value} ({self.impact:+.2f})"


@dataclass
class RiskAction:
    """A recommended action, why it is recommended, and how urgent it is."""

    action: str
    reason: str
    priority: str = PRIORITY_MEDIUM

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class RiskResult:
    probability: float
    band: str
    factors: list[RiskFactor] = field(default_factory=list)
    actions: list[RiskAction] = field(default_factory=list)
    # Backward-compatible string views (single source of truth: the lists above).
    contributing_factors: list[str] = field(default_factory=list)
    recommended_actions: list[str] = field(default_factory=list)
    model_version: str = MODEL_VERSION
    # What the number actually is, so a client never renders it as a probability
    # of loss derived from a calibrated model.
    score_label: str = "Risk score"

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
    """Score post-harvest risk and explain every contribution."""
    score_val = 0.05  # baseline
    factors: list[RiskFactor] = []
    actions: list[RiskAction] = []

    def add_factor(name: str, value: str | None, impact: float, reason: str) -> None:
        nonlocal score_val
        score_val += impact
        factors.append(RiskFactor(name, value, round(impact, 3), reason))

    # --- crop perishability -------------------------------------------------
    p = (perishability or "medium").lower()
    contrib = _PERISHABILITY_RISK.get(p, 0.2)
    add_factor(
        "Crop perishability",
        p,
        contrib,
        {
            "high": "Highly perishable crops lose quality quickly without cooling",
            "medium": "Moderate shelf life; normal handling required",
            "low": "Durable crop; storage loss is limited by other factors",
        }.get(p, "Perishability not published for this crop; treated as moderate"),
    )
    if p == "high":
        actions.append(
            RiskAction(
                "Prioritise rapid cooling / same-day transport",
                "High perishability drives most of the score",
                PRIORITY_HIGH,
            )
        )

    # --- rainfall -----------------------------------------------------------
    rain = (rainfall_risk or "").lower()
    if rain in _RAINFALL_RISK:
        r = _RAINFALL_RISK[rain]
        add_factor("Rainfall risk", rain, r, f"Reported {rain} rainfall risk for this period")
        if r > 0:
            actions.append(
                RiskAction(
                    "Use covered storage and bring harvest forward if possible",
                    f"Reported {rain} rainfall risk during the harvest window",
                    PRIORITY_HIGH if rain == "high" else PRIORITY_MEDIUM,
                )
            )

    # --- volume -------------------------------------------------------------
    if expected_quantity_kg:
        if expected_quantity_kg >= 1000:
            add_factor(
                "Expected volume",
                f"{expected_quantity_kg:.0f} kg",
                0.1,
                "Large volumes exceed single-facility handling capacity",
            )
            actions.append(
                RiskAction(
                    "Split load across multiple facilities",
                    "Single-site handling is the bottleneck at this volume",
                    PRIORITY_MEDIUM,
                )
            )
        elif expected_quantity_kg >= 300:
            add_factor(
                "Expected volume",
                f"{expected_quantity_kg:.0f} kg",
                0.05,
                "Moderate volume needs planned handling, not improvised storage",
            )

    # --- historical loss ----------------------------------------------------
    hist = _historical_loss_pct(crop)
    if hist is not None:
        add_factor(
            f"Historical post-harvest loss for {crop}",
            f"{hist:.2f}%",
            min(0.2, hist / 100.0),
            "Observed loss share for this crop in the official post-harvest table",
        )

    # --- capacity -----------------------------------------------------------
    if capacity_available_kg is None:
        add_factor(
            "Storage capacity",
            "not verified",
            0.05,
            "No facility capacity is published, so capacity is treated conservatively",
        )
        actions.append(
            RiskAction(
                "Confirm facility capacity before dispatch",
                "Capacity is unverified in every public source used here",
                PRIORITY_MEDIUM,
            )
        )
    elif expected_quantity_kg and capacity_available_kg < expected_quantity_kg:
        add_factor(
            "Storage capacity",
            f"{capacity_available_kg:.0f} kg available",
            0.15,
            "Available capacity is below the expected harvest volume",
        )
        actions.append(
            RiskAction(
                "Request additional storage or reduce volume per facility",
                "Verified capacity is insufficient for the expected volume",
                PRIORITY_HIGH,
            )
        )

    # --- transport ----------------------------------------------------------
    if distance_km is not None and distance_km > 25:
        add_factor(
            "Travel distance",
            f"{distance_km:.0f} km",
            0.1,
            "Long transport time increases exposure to heat and handling damage",
        )
        actions.append(
            RiskAction(
                "Minimise transport time; avoid peak heat hours",
                "Distance exceeds the 25 km comfortable handling radius",
                PRIORITY_MEDIUM,
            )
        )

    probability = round(max(0.0, min(1.0, score_val)), 3)
    if not actions:
        actions.append(
            RiskAction(
                "Standard handling is sufficient; monitor as usual",
                "No elevated risk factor was identified for this harvest",
                PRIORITY_LOW,
            )
        )

    return RiskResult(
        probability=probability,
        band=_band(probability),
        factors=factors,
        actions=actions,
        contributing_factors=[f.as_line() for f in factors],
        recommended_actions=[a.action for a in actions],
    )
