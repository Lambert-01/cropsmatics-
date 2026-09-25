"""Post-harvest risk scoring.

MVP: a documented additive rule model (transparent, explainable). The class also
accepts an optional calibrated classifier so a data-driven model can replace the
rules behind the same interface once enough outcome data is collected.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

PERISHABILITY_RISK = {"high": 0.35, "medium": 0.2, "low": 0.05}
RAINFALL_RISK = {"high": 0.2, "moderate": 0.1, "low": 0.0}
BAND_THRESHOLDS = {"high": 0.66, "moderate": 0.33}


def band_for(probability: float, thresholds: dict | None = None) -> str:
    t = {**BAND_THRESHOLDS, **(thresholds or {})}
    if probability >= t["high"]:
        return "HIGH"
    if probability >= t["moderate"]:
        return "MODERATE"
    return "LOW"


@dataclass
class RiskResult:
    probability: float
    band: str
    contributing_factors: list[str] = field(default_factory=list)
    recommended_actions: list[str] = field(default_factory=list)
    model_version: str = "rule-based-risk-0.1.0"

    def as_dict(self) -> dict:
        return asdict(self)


class PostHarvestRiskModel:
    """Rule-based risk model with an optional classifier override."""

    def __init__(self, classifier=None, thresholds: dict | None = None) -> None:
        self.classifier = classifier
        self.thresholds = thresholds or BAND_THRESHOLDS

    def score(
        self,
        crop: str,
        expected_quantity_kg: float | None = None,
        perishability: str | None = None,
        rainfall_risk: str | None = None,
        distance_km: float | None = None,
        capacity_available_kg: float | None = None,
        historical_loss_pct: float | None = None,
    ) -> RiskResult:
        if self.classifier is not None:
            return self._score_classifier(
                crop, expected_quantity_kg, perishability, rainfall_risk,
                distance_km, capacity_available_kg, historical_loss_pct,
            )
        return self._score_rules(
            crop, expected_quantity_kg, perishability, rainfall_risk,
            distance_km, capacity_available_kg, historical_loss_pct,
        )

    # -- rules --------------------------------------------------------------
    def _score_rules(self, crop, expected_quantity_kg, perishability, rainfall_risk,
                     distance_km, capacity_available_kg, historical_loss_pct) -> RiskResult:
        value = 0.05
        factors: list[str] = []
        actions: list[str] = []

        p = (perishability or "medium").lower()
        add = PERISHABILITY_RISK.get(p, 0.2)
        value += add
        factors.append(f"crop perishability: {p} (+{add:.2f})")
        if p == "high":
            actions.append("Prioritise rapid cooling / same-day transport")

        rain = (rainfall_risk or "").lower()
        if rain in RAINFALL_RISK and RAINFALL_RISK[rain]:
            add = RAINFALL_RISK[rain]
            value += add
            factors.append(f"rainfall risk: {rain} (+{add:.2f})")
            actions.append("Use covered storage; bring harvest forward if possible")

        if expected_quantity_kg:
            if expected_quantity_kg >= 1000:
                value += 0.10
                factors.append(f"large expected volume: {expected_quantity_kg:.0f} kg (+0.10)")
                actions.append("Split load across multiple facilities")
            elif expected_quantity_kg >= 300:
                value += 0.05
                factors.append(f"moderate expected volume: {expected_quantity_kg:.0f} kg (+0.05)")

        if historical_loss_pct is not None:
            add = min(0.2, historical_loss_pct / 100.0)
            value += add
            factors.append(f"historical loss for {crop}: {historical_loss_pct:.2f}% (+{add:.2f})")

        if capacity_available_kg is None:
            value += 0.05
            factors.append("capacity not verified — treated conservatively (+0.05)")
            actions.append("Confirm facility capacity before dispatch")
        elif expected_quantity_kg and capacity_available_kg < expected_quantity_kg:
            value += 0.15
            factors.append("available capacity below expected harvest (+0.15)")
            actions.append("Request additional storage or reduce volume per facility")

        if distance_km is not None and distance_km > 25:
            value += 0.10
            factors.append(f"long travel distance: {distance_km:.0f} km (+0.10)")
            actions.append("Minimise transport time; avoid peak heat hours")

        probability = round(max(0.0, min(1.0, value)), 3)
        if not actions:
            actions.append("Standard handling is sufficient; monitor as usual")
        return RiskResult(probability, band_for(probability, self.thresholds), factors, actions)

    # -- classifier ---------------------------------------------------------
    def _score_classifier(self, crop, expected_quantity_kg, perishability, rainfall_risk,
                          distance_km, capacity_available_kg, historical_loss_pct) -> RiskResult:
        features = [[
            PERISHABILITY_RISK.get((perishability or "medium").lower(), 0.2),
            RAINFALL_RISK.get((rainfall_risk or "low").lower(), 0.0),
            float(expected_quantity_kg or 0.0),
            float(distance_km or 0.0),
            -1.0 if capacity_available_kg is None else float(capacity_available_kg),
            -1.0 if historical_loss_pct is None else float(historical_loss_pct),
        ]]
        probability = float(self.classifier.predict_proba(features)[0][1])
        p = round(max(0.0, min(1.0, probability)), 3)
        return RiskResult(
            p, band_for(p, self.thresholds),
            ["classifier probability from calibrated model"],
            ["Follow the recommended storage/aggregation action"],
            model_version="postharvest-classifier",
        )


def score(crop: str, **kwargs) -> RiskResult:
    """Convenience wrapper around the default rule model."""
    return PostHarvestRiskModel().score(crop, **kwargs)
