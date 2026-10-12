"""Canonical 2022A-2026B productivity trends.

The legacy national trend (``trend_service``) reads a single-release context
table that covers only a handful of periods and mixes a different methodology.
This service answers the same question from the **canonical productivity panel**,
whose national rows are published for every period NISR has released, so a trend
visual can show a consistent 2022A-2026B axis without the browser aggregating
anything.

Method (fixed, and reported with every response):

* rows are the panel's ``geography_level == 'NATIONAL'`` rows at
  ``farmer_scale == 'all'`` - the published national figures, never a browser
  sum of district rows;
* one crop -> that crop's **published** yield for the period, nulls preserved;
* all crops -> production and harvested area are **summed** across the 17
  canonical crops (a non-overlapping, additive set, so the sum is valid). A
  cross-crop *yield* is never a simple average of per-crop yields; the only
  derived yield offered is ``yield_from_totals_kg_ha`` = 1000 * total production
  / total harvested area, and it is labelled as production-weighted;
* a family total is never added to its own varieties. The canonical panel
  already stores one row per canonical crop (the published varieties are
  normalised to their family), so the crop set is non-overlapping by
  construction; this is asserted rather than assumed.

A district + crop selection is answered from the same panel's district rows, so
the district trend is a published series too, not a client-side reduction.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo
from app.services import period_service

#: Metrics the canonical panel can carry for a trend, with their units.
METRIC_UNITS = {
    "production_mt": "metric tonnes",
    "harvested_area_ha": "ha",
    "yield_kg_ha": "kg/ha",
}

NATIONAL_FARMER_SCALE = "all"

METHOD_NOTE = (
    "published national rows of the canonical multi-period productivity panel; "
    "one crop reports its published yield, all crops sum production and harvested "
    "area across a non-overlapping crop set and never average crop yields"
)


class CanonicalTrendUnavailable(RuntimeError):
    """The canonical panel cannot answer a trend request."""


def _panel() -> pd.DataFrame:
    try:
        panel = repo.crop_productivity()
    except (repo.DatasetOutOfSync, repo.CanonicalDataUnavailable):
        # A canonical-authority problem must reach the 503 handler unchanged; it
        # is not a "this crop is not published" condition.
        raise
    except Exception as exc:  # noqa: BLE001 - report unavailability, do not 500
        raise CanonicalTrendUnavailable(str(exc)) from exc
    if panel.empty or "period_code" not in panel.columns:
        raise CanonicalTrendUnavailable("the canonical productivity panel is empty")
    return panel


def _axis(codes) -> list[str]:
    """The published periods present in the frame, chronological."""
    unique = {str(code) for code in codes if str(code)}
    order = {code: index for index, code in enumerate(period_service.period_codes())}
    return sorted(unique, key=lambda code: (order.get(code, 999), code))


def _series(values: pd.Series) -> list[float | None]:
    """Round a per-period series, preserving ``None`` (never a fabricated zero)."""
    return [
        None if (value is None or (isinstance(value, float) and np.isnan(value)))
        else round(float(value), 3)
        for value in values
    ]


def _assert_non_overlapping(frame: pd.DataFrame) -> None:
    """A crop family must never appear alongside its own varieties.

    The canonical panel stores one row per canonical crop, so a duplicate
    ``(period, crop_code)`` pair would be the only way a family total could be
    summed with its breakdown. That is a defect, not a number to publish.
    """
    duplicates = frame.duplicated(["period_code", "crop_code"]).sum()
    if duplicates:
        raise CanonicalTrendUnavailable(
            f"canonical national rows are not unique per (period, crop): {int(duplicates)} "
            "duplicate(s); a family total must not be summed with its varieties"
        )


def national_trend(crop: str | None = None) -> dict:
    """A 2022A-2026B national trend for one crop, or for the summed totals."""
    panel = _panel()
    frame = panel[
        (panel["geography_level"].astype(str).str.upper() == "NATIONAL")
        & (panel["farmer_scale"].astype(str) == NATIONAL_FARMER_SCALE)
    ].copy()
    if frame.empty:
        raise CanonicalTrendUnavailable("the panel carries no national rows")

    crop_name: str | None = None
    if crop:
        match = frame[
            frame["canonical_crop_name"].astype(str).str.lower() == crop.strip().lower()
        ]
        if match.empty:
            raise CanonicalTrendUnavailable(
                f"{crop!r} is not a crop the canonical panel publishes nationally"
            )
        crop_name = str(match["canonical_crop_name"].iloc[0])
        frame = match

    _assert_non_overlapping(frame)

    # The axis is every period the panel publishes (2022A-2026B), so the series
    # are aligned and a period a crop was not tabulated for is an explicit null
    # rather than an absent point.
    periods = _axis(panel["period_code"])
    keyed = frame.assign(_period=frame["period_code"].astype(str))

    def _series_by_period(name: str) -> list[float | None]:
        if name not in keyed.columns:
            return [None] * len(periods)
        # min_count=1 keeps an all-null period as null instead of summing to 0.
        summed = keyed.groupby("_period")[name].sum(min_count=1).reindex(periods)
        return _series(summed)

    series: dict[str, list[float | None]] = {}
    if crop_name:
        # One crop: exactly one row per period, so this is its published value.
        series["yield_kg_ha"] = _series_by_period("yield_kg_ha")
        series["production_mt"] = _series_by_period("production_mt")
        series["harvested_area_ha"] = _series_by_period("harvested_area_ha")
        method = (
            f"{crop_name}: published national yield, production and harvested area "
            "per period; a period the release did not tabulate is null"
        )
    else:
        production = _series_by_period("production_mt")
        area = _series_by_period("harvested_area_ha")
        series["production_mt"] = production
        series["harvested_area_ha"] = area
        derived: list[float | None] = []
        for produced, harvested in zip(production, area, strict=False):
            if produced is None or harvested is None or harvested <= 0:
                derived.append(None)
            else:
                derived.append(round(1000.0 * produced / harvested, 3))
        series["yield_from_totals_kg_ha"] = derived
        # A cross-crop raw yield is deliberately absent.
        series["yield_kg_ha"] = [None] * len(periods)
        method = (
            "all crops: production and harvested area summed across the canonical "
            "crop set per period; no crop yield is averaged - the only yield is "
            "production-weighted (1000 * total production / total harvested area)"
        )

    return {
        "geography_scope": "national",
        "district": None,
        "crop": crop_name,
        "periods": periods,
        "period_labels": {code: period_service.label(code) for code in periods},
        "metric_units": dict(METRIC_UNITS),
        "series": series,
        "n_crops": int(frame["crop_code"].nunique()),
        "n_periods": len(periods),
        "source_id": _frame_source(frame),
        "method": method,
        "provenance": {
            "source_id": _frame_source(frame),
            "source_period": f"{periods[0]}-{periods[-1]}" if periods else None,
            "geography": "national",
            "unit": dict(METRIC_UNITS),
            "method": method,
            "limitations": [
                "national published series, never a district estimate",
                "a period the release did not tabulate is returned as null and is never interpolated",
                "a cross-crop yield is never a simple average of per-crop yields",
                "the legacy /analytics/trends endpoint is unchanged and uses its own methodology",
            ],
        },
    }


def district_crop_trend(district: str, crop: str) -> dict:
    """A district x crop trend from the canonical panel (published district rows)."""
    panel = _panel()
    frame = panel[
        (panel["geography_level"].astype(str).str.upper() == "DISTRICT")
        & (panel["farmer_scale"].astype(str) == NATIONAL_FARMER_SCALE)
        & (panel["district"].astype(str).str.lower() == district.strip().lower())
        & (panel["canonical_crop_name"].astype(str).str.lower() == crop.strip().lower())
    ].copy()
    if frame.empty:
        raise CanonicalTrendUnavailable(
            f"the canonical panel publishes no district rows for {crop!r} in {district!r}"
        )

    _assert_non_overlapping(frame)
    periods = _axis(panel["period_code"])
    keyed = frame.assign(_period=frame["period_code"].astype(str))
    series = {
        name: _series(keyed.groupby("_period")[name].sum(min_count=1).reindex(periods))
        for name in ("yield_kg_ha", "production_mt", "harvested_area_ha")
    }
    crop_name = str(frame["canonical_crop_name"].iloc[0])
    district_name = str(frame["district"].iloc[0])
    method = (
        f"{crop_name} in {district_name}: published district yield, production and "
        "harvested area per period"
    )
    return {
        "geography_scope": "district",
        "district": district_name,
        "crop": crop_name,
        "periods": periods,
        "period_labels": {code: period_service.label(code) for code in periods},
        "metric_units": dict(METRIC_UNITS),
        "series": series,
        "n_crops": 1,
        "n_periods": len(periods),
        "source_id": _frame_source(frame),
        "method": method,
        "provenance": {
            "source_id": _frame_source(frame),
            "source_period": f"{periods[0]}-{periods[-1]}" if periods else None,
            "geography": f"district:{district_name}",
            "unit": dict(METRIC_UNITS),
            "method": method,
            "limitations": [
                "published district series, not a national figure",
                "a period the release did not tabulate is returned as null",
                "same-season comparison only: consecutive seasons are not a time series",
            ],
        },
    }


def _as_float(value):
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(f) else f


def _frame_source(frame: pd.DataFrame) -> str:
    if "source_id" in frame.columns:
        ids = sorted({str(value) for value in frame["source_id"].dropna() if str(value)})
        if ids:
            return ",".join(ids)
    return "NISR_SAS_CANONICAL_PRODUCTIVITY"
