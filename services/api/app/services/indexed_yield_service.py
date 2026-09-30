"""Indexed national crop-yield performance.

Why this exists
---------------
Raw yields are not comparable across crop species: a maize t/ha and a banana
t/ha are different quantities with different natural scales. A reader can still
legitimately ask "which of these crops improved?", so each crop is indexed to
*its own* published national baseline (= 100). Only the shape of the change is
compared; no cross-crop yield is ever averaged.

Baseline definition
-------------------
For each crop the baseline is the **median of that crop's own published national
yield values** across the periods the national trend table carries. The median is
used rather than the mean so one exceptional season does not move the reference,
and it is computed strictly per crop - the crop's values are never pooled with
another crop's.

Eligibility
-----------
A crop is either fully eligible or reported as ineligible with a reason:

* at least ``MIN_PERIODS`` published yield values for that crop;
* a strictly positive baseline.

Nothing is imputed. A period the release did not tabulate for that crop is
returned with ``value = None`` and ``index = None``, so a chart draws a gap
rather than a point at zero.

Limitations (returned with every response)
------------------------------------------
The published national series is short (2024B, 2025A, 2025B, 2026A) and mixes
Season A with Season B, which are agronomically different. A season-specific
baseline would be preferable but cannot be estimated from two points per season,
so part of an index movement may reflect which season a point came from. An
index also says nothing about absolute level: two crops can both read 120 with
completely different yields.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo
from app.services.trend_service import collapse_crop_breakdown

METRIC = "yield_mt_ha"
UNIT = "index (crop's own published baseline = 100)"
BASELINE_DEFINITION = "median of the crop's own published national yield values"
MIN_PERIODS = 2

LIMITATIONS = [
    "national series only, never a district value",
    "the baseline mixes Season A and Season B because the published national "
    "series is too short for a season-specific baseline; seasons differ "
    "agronomically, so part of a movement may reflect the season",
    "an index describes relative change, not absolute yield: two crops can share "
    "an index while producing very different tonnages per hectare",
    "a period the release did not tabulate for a crop is a gap, never a zero",
    "official aggregate crop groups are excluded to avoid double counting",
]


def _period(year, season) -> str:
    return f"{int(year)}{season}" if season else str(int(year))


def _label(period: str) -> str:
    """``2026B`` -> ``2026 Season B``; an unknown code passes through."""
    try:
        year, season = int(period[:4]), str(period[4:]).upper()
    except (TypeError, ValueError):
        return period
    if not season:
        return str(year)
    return f"{year} Season {season}"


def _rank(period: str) -> tuple[int, str]:
    """Chronological sort key for a period code (year-only sorts within year)."""
    try:
        year = int(str(period)[:4])
    except (TypeError, ValueError):
        year = 0
    return (year, str(period)[4:].upper())


def _clean(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(number) else number


def _series_for(df: pd.DataFrame, crop: str) -> dict:
    sub = df[df["canonical_crop_name"].astype(str).str.lower() == crop.lower()]
    if sub.empty or METRIC not in sub.columns:
        return {
            "crop": crop,
            "eligible": False,
            "availability": "ineligible",
            "reason": "this crop has no published national yield rows",
            "baseline": None,
            "n_observations": 0,
            "points": [],
        }

    pairs = sorted(
        {(int(row["year"]), str(row["season"])) for _, row in sub.iterrows()},
        key=lambda pair: (pair[0], pair[1]),
    )

    points = []
    published: list[float] = []
    for year, season in pairs:
        rows = sub[(sub["year"].astype(int) == year) & (sub["season"].astype(str) == season)]
        values = [v for v in (_clean(v) for v in rows[METRIC].tolist()) if v is not None]
        value = values[0] if values else None
        if value is not None:
            published.append(value)
        points.append(
            {
                "period": _period(year, season),
                "label": f"{year} Season {season}",
                "value": None if value is None else round(value, 4),
                "index": None,
            }
        )

    if len(published) < MIN_PERIODS:
        return {
            "crop": crop,
            "eligible": False,
            "availability": "ineligible",
            "reason": (
                f"only {len(published)} published national yield value(s); at least "
                f"{MIN_PERIODS} are required before an index is defined"
            ),
            "baseline": None,
            "n_observations": len(published),
            "points": points,
        }

    baseline = float(np.median(np.array(published, dtype=float)))
    if not baseline > 0:
        return {
            "crop": crop,
            "eligible": False,
            "availability": "ineligible",
            "reason": "the crop's published baseline is not positive, so an index is undefined",
            "baseline": None,
            "n_observations": len(published),
            "points": points,
        }

    for point in points:
        if point["value"] is not None:
            point["index"] = round(point["value"] / baseline * 100, 4)

    return {
        "crop": crop,
        "eligible": True,
        "availability": "eligible",
        "reason": None,
        "baseline": round(baseline, 4),
        "n_observations": len(published),
        "points": points,
    }


def indexed_yield(crops: list[str] | None = None) -> dict:
    """Per-crop yield index, each against that crop's own published baseline.

    Every returned series is aligned to one shared, chronologically ordered
    period axis (the union of periods any requested crop published). A crop the
    release did not tabulate in one of those periods gets a point with
    ``value = None`` and ``index = None`` for that period, so the client can
    plot the series positionally without ever putting one crop's observation
    under another crop's date.
    """
    df = repo.national_crop_trends()
    if "is_aggregate" in df.columns:
        df = df[~df["is_aggregate"].astype(bool)].copy()
    df = collapse_crop_breakdown(df)

    if crops:
        order = [c.strip() for c in crops if c.strip()]
    else:
        order = sorted({str(name) for name in df["canonical_crop_name"].dropna()})

    series = [_series_for(df, crop) for crop in order]

    # One shared axis: the union of every period any series published.
    periods = sorted(
        {point["period"] for item in series for point in item["points"]},
        key=_rank,
    )

    # Align each non-empty series to that axis. A series with no published rows
    # at all (unknown crop) stays empty rather than becoming a column of nulls.
    for item in series:
        if not item["points"]:
            continue
        by_period = {point["period"]: point for point in item["points"]}
        item["points"] = [
            by_period.get(code)
            or {"period": code, "label": _label(code), "value": None, "index": None}
            for code in periods
        ]

    return {
        "metric": METRIC,
        "unit": UNIT,
        "baseline_definition": BASELINE_DEFINITION,
        "min_periods": MIN_PERIODS,
        "periods": periods,
        "series": series,
    }
