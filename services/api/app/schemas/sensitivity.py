"""Request/response models for the Intervention Sensitivity (ranking robustness) lab.

Re-ranks the planner's candidates under a reproducible sweep of plausible
weightings and reports, per candidate, how often it stayed in the review
shortlist. The share is a **robustness share**, not a probability, and the
schema says so in ``disclaimer`` and in every field name that reports it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.analytics import ComponentAvailability, WeightsIn
from app.schemas.common import Provenance


class SensitivityRequest(BaseModel):
    """Selection plus the sweep definition.

    Everything except the weighting sweep is a *selection*: it decides which
    candidates are tested, and is held fixed across every draw, so the result
    isolates sensitivity to the weights and nothing else.
    """

    purpose: Literal["productivity_support", "harvest_coordination"] = "productivity_support"
    threshold_pct: float = Field(0.0, ge=0, le=100)
    weights: WeightsIn = Field(
        default_factory=WeightsIn,
        description="the baseline weighting the reported baseline ranks use",
    )
    period_code: str | None = Field(None, description="published period, e.g. 2026B")
    benchmark_strategy: str | None = Field(None, description="benchmark used for the gap component")
    province: str | None = Field(None, description="restrict the candidate set to one province")
    district: str | None = Field(None, description="restrict the candidate set to one district")
    crop: str | None = Field(None, description="restrict the candidate set to one crop")
    n_random: int = Field(
        200, ge=0, le=2000, description="random weightings drawn on the simplex (0 = presets only)"
    )
    seed: int = Field(
        42, ge=0, le=2_147_483_647, description="makes the sweep exactly reproducible"
    )
    top_n: int = Field(10, ge=1, le=200, description="how many candidates count as the shortlist")
    include_presets: bool = Field(
        True, description="always test the named planning positions as well as random draws"
    )


class SensitivityRow(BaseModel):
    """How one candidate behaves across the whole sweep."""

    id: str
    district: str
    crop: str | None = None
    baseline_rank: int
    baseline_band: str
    baseline_score: float
    top_n_inclusions: int
    #: Fraction of tested weightings in which the candidate stayed in the top-N.
    #: A robustness share, not a probability.
    top_n_share_pct: float
    band_counts: dict[str, int] = Field(default_factory=dict)
    band_shares_pct: dict[str, float] = Field(default_factory=dict)
    dominant_band: str
    band_stability_pct: float
    best_rank: int
    median_rank: float
    worst_rank: int
    rank_range: int
    #: True when the candidate stayed in the shortlist under at least 75% of the
    #: tested assumptions.
    robust: bool = False


class SensitivityResponse(BaseModel):
    weights: dict[str, float] = Field(default_factory=dict)
    #: Human-readable names for the engine weight keys.
    weight_labels: dict[str, str] = Field(default_factory=dict)
    #: Named assumption sets included in the sweep (engine-keyed, like `weights`).
    presets: dict[str, dict[str, float]] = Field(default_factory=dict)
    #: Display names for `presets`, keyed by preset id.
    preset_labels: dict[str, str] = Field(default_factory=dict)
    rows: list[SensitivityRow] = Field(default_factory=list)
    districts_analysed: int = 0
    robust_count: int = 0
    n_scenarios_tested: int = 0
    n_random_draws: int = 0
    presets_included: list[str] = Field(default_factory=list)
    seed: int = 42
    top_n: int = 10
    proxy_notes: list[str] = Field(default_factory=list)
    #: Components whose weight was redistributed out of every tested weighting
    #: because they have no measured value for the selected period. The sweep
    #: never tests a weighting that would score a neutral constant.
    components_unavailable: list[str] = Field(default_factory=list)
    component_availability: list[ComponentAvailability] = Field(default_factory=list)
    #: The planning purpose the sweep was run for. A robustness share only means
    #: something relative to a stated purpose and a stated candidate set.
    purpose: str | None = None
    purpose_label: str | None = None
    purpose_note: str | None = None
    methodology_version: str | None = None
    #: Eligible candidates tested, and candidates excluded because they are not a
    #: shortfall for this purpose. The sweep never tests an ineligible candidate,
    #: so a share cannot make one look "stable".
    n_eligible: int = 0
    n_ineligible: int = 0
    disclaimer: str = ""
    limitations: list[str] = Field(default_factory=list)
    provenance: Provenance
