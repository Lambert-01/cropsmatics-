"""Manual ("build a projection") mathematics.

This is the third of the three different future-looking activities the product
must never conflate:

* **published historical observations** — what NISR published;
* **user-controlled projections** — what would follow from a stated baseline and
  explicit user assumptions (this module);
* **validated model forecasts** — what an evaluated model estimates for a defined
  future target, gated by the publication policy (``ml/``).

Nothing here predicts anything. A user says "hold the baseline" or "assume +15%
per same-season step", and this module computes exactly that, so the number on
screen is the arithmetic of the stated assumption and nothing else. The result is
labelled :data:`VALUE_KIND` and is never written into official statistics.

Only two things are actually computed:

1. **Carry forward** — the baseline repeated, with no assumed change.
2. **Assumption** — an explicit percentage change, applied either once (a level
   shift) or compounded per same-season step. Which one is the caller's stated
   choice, never a hidden default that silently changes the curve's shape.

A third mode, **personal plan**, simply multiplies a user's assumed yield by a
user's assumed harvested area in compatible units. That is a planning assumption
about a farm, not a farm-specific prediction.

Deliberately excluded: irrigation-response coefficients, fertilizer yield gains,
weather adjustment and budget returns. There is no evidence in this repository
for those causal effects, so the engine must not imply them.
"""

from __future__ import annotations

import re

#: Bumped whenever the *meaning* of a projection changes.
METHODOLOGY_VERSION = "1.0.0"

#: The value kind every row of a projection carries, so a consumer can never
#: mistake it for an official observation or a validated forecast.
VALUE_KIND = "planning_projection"
VALUE_KIND_LABEL = "Planning projection"
ASSUMPTION_BADGE = "Your assumptions"

# --- methods ----------------------------------------------------------------

METHOD_CARRY_FORWARD = "carry_forward"
METHOD_PERCENT_CHANGE = "percent_change"
METHOD_PERSONAL = "personal"

METHODS: tuple[str, ...] = (METHOD_CARRY_FORWARD, METHOD_PERCENT_CHANGE, METHOD_PERSONAL)

METHOD_LABELS: dict[str, str] = {
    METHOD_CARRY_FORWARD: "Carry forward the baseline",
    METHOD_PERCENT_CHANGE: "Apply your assumed change",
    METHOD_PERSONAL: "Personal plan (your yield and area)",
}

METHOD_NOTES: dict[str, str] = {
    METHOD_CARRY_FORWARD: (
        "Next-season values are set equal to the selected observed baseline. No "
        "change is claimed; this is a reference line, not a prediction."
    ),
    METHOD_PERCENT_CHANGE: (
        "Next-season values apply the change you entered to the selected observed "
        "baseline. The change can be applied once or compounded per same-season "
        "step; which one you chose is reported with the result."
    ),
    METHOD_PERSONAL: (
        "A production estimate from your own assumed yield and harvested area. It "
        "is a planning assumption about a farm, not a farm-specific prediction and "
        "not a district figure."
    ),
}

# --- baseline choices -------------------------------------------------------

BASELINE_LATEST = "latest_observed"
BASELINE_MEDIAN = "median_window"

BASELINE_CHOICES: tuple[str, ...] = (BASELINE_LATEST, BASELINE_MEDIAN)

BASELINE_LABELS: dict[str, str] = {
    BASELINE_LATEST: "Latest observed same-season value",
    BASELINE_MEDIAN: "Median of a window of same-season observations",
}

# --- metrics ----------------------------------------------------------------

METRIC_YIELD = "yield_kg_ha"
METRIC_PRODUCTION = "production_mt"

METRICS: tuple[str, ...] = (METRIC_YIELD, METRIC_PRODUCTION)

METRIC_UNITS: dict[str, str] = {
    METRIC_YIELD: "kg/ha",
    METRIC_PRODUCTION: "metric tonnes",
}

METRIC_LABELS: dict[str, str] = {
    METRIC_YIELD: "Yield",
    METRIC_PRODUCTION: "Production",
}

# --- compounding ------------------------------------------------------------

COMPOUND_ONCE = "once"
COMPOUND_PER_STEP = "per_step"

COMPOUNDING_MODES: tuple[str, ...] = (COMPOUND_ONCE, COMPOUND_PER_STEP)

COMPOUNDING_LABELS: dict[str, str] = {
    COMPOUND_ONCE: "Applied once to the baseline",
    COMPOUND_PER_STEP: "Compounded per same-season step",
}

# --- guards -----------------------------------------------------------------

#: The first implementation keeps the horizon short on purpose. This is a product
#: safeguard against extrapolating a user assumption far into the future, not a
#: scientific validation result.
MIN_HORIZON_STEPS = 1
MAX_HORIZON_STEPS = 3

#: A window of comparable same-season observations used for a median baseline.
MIN_BASELINE_WINDOW = 2
MAX_BASELINE_WINDOW = 8

#: Numeric bounds. Yields and areas are physical quantities; a rate below -100%
#: would produce a negative yield, which is not a projection but an input error.
MIN_CHANGE_PCT = -95.0
MAX_CHANGE_PCT = 500.0
MAX_ASSUMED_YIELD = 200_000.0
MAX_ASSUMED_AREA = 10_000_000.0

#: Rounding policy, reported with every response so a number can be reproduced.
ROUND_DECIMALS = 4

_PERIOD_RE = re.compile(r"^(20\d{2})([ABC])$")


class ProjectionError(ValueError):
    """An invalid projection request or an impossible arithmetic result."""

    def __init__(self, message: str, *, code: str = "invalid_projection") -> None:
        super().__init__(message)
        self.code = code


def round_value(value: float) -> float:
    """Round for display. The unrounded inputs are echoed for reproducibility."""
    return round(float(value), ROUND_DECIMALS)


def parse_period(code: str) -> tuple[int, str]:
    match = _PERIOD_RE.match(str(code or "").strip().upper())
    if not match:
        raise ProjectionError(
            f"period_code {code!r} is not a YYYYS code (e.g. 2026B)", code="bad_period"
        )
    return int(match.group(1)), match.group(2)


def format_period(year: int | str, season: str) -> str:
    season_letter = str(season).strip().upper()
    if season_letter not in ("A", "B", "C"):
        raise ProjectionError(f"season {season!r} is not one of A, B, C", code="bad_season")
    return f"{int(year)}{season_letter}"


def period_sort_key(code: str) -> tuple[int, str]:
    year, season = parse_period(code)
    return year, season


def next_same_season_codes(origin_code: str, steps: int) -> list[str]:
    """The next ``steps`` periods with the *same* season letter as the origin.

    A horizon of 2 from ``2026B`` means ``2027B`` and ``2028B`` — annual
    observations of Season B. It is never ``2026B`` then ``2027A``: stepping
    through A, B and C would treat three seasons of one year as three years.
    """
    if steps < MIN_HORIZON_STEPS or steps > MAX_HORIZON_STEPS:
        raise ProjectionError(
            f"horizon_steps must be between {MIN_HORIZON_STEPS} and {MAX_HORIZON_STEPS}; "
            f"got {steps}",
            code="horizon_out_of_range",
        )
    year, season = parse_period(origin_code)
    return [format_period(year + step, season) for step in range(1, steps + 1)]


def carry_forward(baseline: float, steps: int) -> list[float]:
    """The baseline repeated ``steps`` times. No change is claimed."""
    if steps < 1:
        raise ProjectionError("steps must be at least 1", code="horizon_out_of_range")
    return [float(baseline)] * steps


def percent_change(baseline: float, change_pct: float, steps: int, compounding: str) -> list[float]:
    """Apply an explicit user change to the baseline.

    ``once`` applies the change as a single level shift, so every projected point
    is ``baseline * (1 + r)``. ``per_step`` compounds it, so step ``k`` is
    ``baseline * (1 + r) ** k``. The mode is required so the curve's shape is the
    caller's stated intent rather than a hidden default.
    """
    if compounding not in COMPOUNDING_MODES:
        raise ProjectionError(
            f"compounding must be one of {COMPOUNDING_MODES}; got {compounding!r}",
            code="bad_compounding",
        )
    if not (MIN_CHANGE_PCT <= change_pct <= MAX_CHANGE_PCT):
        raise ProjectionError(
            f"change_pct must be between {MIN_CHANGE_PCT} and {MAX_CHANGE_PCT}; got {change_pct}",
            code="change_out_of_range",
        )
    rate = 1.0 + change_pct / 100.0
    if compounding == COMPOUND_PER_STEP:
        return [baseline * (rate**step) for step in range(1, steps + 1)]
    return [baseline * rate for _ in range(steps)]


def production_from(yield_kg_ha: float, harvested_area_ha: float) -> float:
    """Production in metric tonnes from a yield and a harvested area.

    Units are converted here, in Python, so the browser never does arithmetic on
    the official numbers: ``kg/ha * ha = kg``, and ``kg / 1000 = metric tonnes``.
    """
    return (float(yield_kg_ha) * float(harvested_area_ha)) / 1000.0


def check_finite(value: float | None, name: str) -> float | None:
    """Reject NaN and infinity rather than letting one poison the response."""
    if value is None:
        return None
    number = float(value)
    if number != number or number in (float("inf"), float("-inf")):
        raise ProjectionError(f"{name} must be a finite number", code="non_finite")
    return number


def ensure_positive_rate_result(baseline: float, projected: float, metric: str) -> None:
    """A stated assumption must not produce a negative or zero physical quantity."""
    if projected <= 0:
        raise ProjectionError(
            f"the stated change produces a non-positive {METRIC_LABELS.get(metric, metric)} "
            f"({projected:.4g}); the assumption is not a valid physical quantity",
            code="impossible_quantity",
        )
