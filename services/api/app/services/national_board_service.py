"""Read-only national crop board.

One request replaces the mobile client's per-crop burst (17 round trips on a
30-crop catalogue) and, more importantly, keeps the authoritative numbers on the
Python side:

* every crop's series is returned **aligned to one shared period axis**, with
  ``null`` for a period the release did not tabulate. The client never has to
  align two series by array position, which would compare unrelated seasons.
* the same-season change is computed here, not on the device. Seasons differ
  agronomically, so the comparison is the same season one year earlier
  (2026A vs 2025A), and it is reported only when **both** observations exist and
  the baseline is usable. A missing prior year is ``available: false`` with a
  reason - never a 0 % change and never a comparison across seasons.

Nothing is imputed and nothing is summed across releases: the source is the
published national crop trend table.
"""

from __future__ import annotations

import numpy as np

from app.repositories import dataset_repository as repo
from app.services import trend_service
from app.services.trend_service import collapse_crop_breakdown

METRIC_UNITS = {
    "cultivated_area_ha": "ha",
    "harvested_area_ha": "ha",
    "production_mt": "metric tonnes",
    "yield_mt_ha": "t/ha",
}

METRICS = tuple(METRIC_UNITS)

SEASON_WORDS = {"A": "Season A", "B": "Season B", "C": "Season C"}


def _period(year, season) -> str:
    return f"{int(year)}{season}" if season else str(int(year))


def _label(code: str) -> str:
    try:
        year, season = int(code[:4]), code[4:].upper()
    except (TypeError, ValueError):
        return code
    return f"{year} {SEASON_WORDS.get(season, f'Season {season}')}"


def _value(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(number) else round(number, 4)


def _same_season_previous(code: str) -> str | None:
    """``2026B`` -> ``2025B``. None when the code is not a published period."""
    if len(code) < 5 or not code[:4].isdigit():
        return None
    return f"{int(code[:4]) - 1}{code[4:].upper()}"


def same_season_change(
    series: list[float | None],
    axis: list[str],
    metric: str,
    unit: str | None = None,
) -> dict:
    """Same-season change for one metric, from two published observations.

    Public so every period-aware endpoint reports a delta the same way instead
    of each service (or the mobile client) inventing its own rule.
    """
    current_index = None
    for index in range(len(axis) - 1, -1, -1):
        if series[index] is not None:
            current_index = index
            break

    base = {
        "metric": metric,
        "unit": unit or METRIC_UNITS.get(metric),
        "available": False,
        "reason": None,
        "period_code": None,
        "period_label": None,
        "previous_period_code": None,
        "previous_period_label": None,
        "current_value": None,
        "previous_value": None,
        "change_pct": None,
        "change_abs": None,
    }

    if current_index is None:
        base["reason"] = "no published value for this metric"
        return base

    base["period_code"] = axis[current_index]
    base["period_label"] = _label(axis[current_index])
    base["current_value"] = series[current_index]

    previous = _same_season_previous(axis[current_index])
    if previous is None or previous not in axis:
        base["reason"] = (
            "the same season one year earlier is not published for this crop"
        )
        return base

    previous_index = axis.index(previous)
    previous_value = series[previous_index]
    base["previous_period_code"] = previous
    base["previous_period_label"] = _label(previous)
    base["previous_value"] = previous_value

    if previous_value is None:
        base["reason"] = (
            f"{_label(previous)} is published as a blank cell for this crop"
        )
        return base

    if previous_value == 0:
        base["reason"] = "a percentage change against zero is undefined"
        return base

    change = (base["current_value"] - previous_value) / abs(previous_value) * 100
    base["available"] = True
    base["change_pct"] = round(change, 4)
    base["change_abs"] = round(base["current_value"] - previous_value, 4)
    return base


def national_totals(axis: list[str]) -> dict:
    """The national total across the non-aggregate crops, on the shared axis.

    Reuses the trend service's own no-crop aggregation so the home pulse and the
    per-crop board can never disagree, and aligns it to the same period axis the
    crops use. Yield is production over harvested area across the crops that
    published both - never an average of per-crop yields.
    """
    points = {point["period"]: point["values"] for point in trend_service.crop_trends()["points"]}
    series = {
        metric: [(points.get(code) or {}).get(metric) for code in axis] for metric in METRICS
    }
    return {
        "series": series,
        "changes": {
            metric: same_season_change(series[metric], axis, metric) for metric in METRICS
        },
    }


def board(
    crops: list[str] | None = None,
    *,
    year: int | None = None,
    season: str | None = None,
) -> dict:
    """Per-crop national series on one shared period axis.

    ``year`` and ``season`` restrict the axis to the periods that match, which is
    the only honest way to offer a period filter on a multi-season board: the
    series, the latest published point and the same-season delta are all derived
    from ``axis`` afterwards, so a filtered board cannot mix a filtered metric
    with an unfiltered change. With neither argument the result is byte-identical
    to the unfiltered board.

    A year resolves to the seasons NISR actually published for it. Selecting a
    year is therefore never an aggregate across incompatible observations; it
    selects the published periods of that year and nothing else. A year/season
    combination with no published data yields an empty axis, never an
    interpolation.
    """
    df = repo.national_crop_trends()
    if "is_aggregate" in df.columns:
        df = df[~df["is_aggregate"].astype(bool)].copy()
    # A family row and its varieties share a canonical crop; use only the family
    # total so a crop is never reported as the sum of itself and its breakdown.
    df = collapse_crop_breakdown(df)

    for column in ("year", "season", "canonical_crop_name"):
        if column not in df.columns:
            raise KeyError(f"national crop trends table is missing {column}")

    pairs = sorted(
        {(int(row["year"]), str(row["season"])) for _, row in df.iterrows()},
        key=lambda item: (item[0], item[1]),
    )
    # Scope before anything is derived from the axis, so the series, the latest
    # published point and the deltas all describe the same selection.
    if year is not None:
        pairs = [item for item in pairs if item[0] == year]
    if season:
        wanted_season = str(season).strip().upper()
        pairs = [item for item in pairs if item[1] == wanted_season]
    axis = [_period(item_year, item_season) for item_year, item_season in pairs]

    if crops:
        order = [name.strip() for name in crops if name.strip()]
    else:
        order = sorted({str(name) for name in df["canonical_crop_name"].dropna()})

    rows = []
    for crop in order:
        sub = df[df["canonical_crop_name"].astype(str).str.lower() == crop.lower()]
        series: dict[str, list[float | None]] = {}
        for metric in METRICS:
            values: list[float | None] = []
            for year, season in pairs:
                cell = sub[
                    (sub["year"].astype(int) == year) & (sub["season"].astype(str) == season)
                ]
                published = (
                    [v for v in (_value(v) for v in cell[metric].tolist()) if v is not None]
                    if metric in cell.columns
                    else []
                )
                values.append(published[0] if published else None)
            series[metric] = values

        latest_index = None
        for index in range(len(axis) - 1, -1, -1):
            if any(series[metric][index] is not None for metric in METRICS):
                latest_index = index
                break

        rows.append(
            {
                "crop": crop,
                "coverage": "national",
                "n_published_periods": sum(
                    1
                    for index in range(len(axis))
                    if any(series[metric][index] is not None for metric in METRICS)
                ),
                "latest_published_period": axis[latest_index] if latest_index is not None else None,
                "latest_published_label": _label(axis[latest_index]) if latest_index is not None else None,
                "series": series,
                "changes": {
                    metric: same_season_change(series[metric], axis, metric)
                    for metric in METRICS
                },
            }
        )

    return {
        "metric_units": METRIC_UNITS,
        "periods": axis,
        "period_labels": {code: _label(code) for code in axis},
        "crops": rows,
        "national": national_totals(axis),
    }
