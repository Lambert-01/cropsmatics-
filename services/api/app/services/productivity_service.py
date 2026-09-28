"""Period-aware productivity reads over the canonical multi-period panel.

Two shapes are exposed: a filtered window of one period (``panel_rows``) and one
crop across all periods (``crop_trend``). Both read ``crop_productivity.csv``,
which stores the official figures as published - a null stays null, and a crop a
release did not tabulate simply has no row for that period.

The national series in ``crop_trend`` uses the *published* national total rows
(``geography_level == NATIONAL``, ``farmer_scale == all``). District rows are
never summed into a national figure: that would be an invented statistic.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo
from app.services import period_service

UNITS = {
    "cultivated_area_ha": "ha",
    "harvested_area_ha": "ha",
    "production_mt": "metric tonnes",
    "yield_kg_ha": "kg/ha",
}

VALUE_COLUMNS = tuple(UNITS)

ROWS_LIMITATIONS_SOURCE = "crop_productivity"

_ROW_COLUMNS = [
    "period_code",
    "year",
    "season",
    "geography_level",
    "district",
    "district_code",
    "province",
    "agro_ecological_zone",
    "farmer_scale",
    "crop_code",
    "canonical_crop_name",
    "cultivated_area_ha",
    "harvested_area_ha",
    "production_mt",
    "yield_kg_ha",
    "source_id",
    "source_sheets",
]


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    return df.replace({np.nan: None})


def _source_id(df: pd.DataFrame) -> str:
    if "source_id" not in df.columns:
        return ""
    ids = sorted({str(v) for v in df["source_id"].dropna() if str(v)})
    return ",".join(ids)


def _resolve_period(period_code: str | None) -> tuple[str, bool]:
    """``(canonical period, defaulted)`` - raises for an unpublished period."""
    if period_code:
        return period_service.require(period_code), False
    fallback = period_service.latest_district() or period_service.latest()
    if not fallback:
        raise period_service.UnknownPeriodError(
            "no processed period data found - run `make data` to build the panel"
        )
    return fallback, True


def _panel() -> pd.DataFrame:
    panel = repo.crop_productivity()
    if "canonical_crop_name" not in panel.columns and "crop_name_raw" in panel.columns:
        panel = panel.assign(canonical_crop_name=panel["crop_name_raw"])
    return panel


def _filter_crop(df: pd.DataFrame, crop: str | None) -> pd.DataFrame:
    if not crop:
        return df
    needle = crop.strip().lower()
    mask = df["canonical_crop_name"].astype(str).str.lower() == needle
    if "crop_code" in df.columns:
        mask |= df["crop_code"].astype(str).str.lower() == needle
    return df[mask]


def _filter_district(df: pd.DataFrame, district: str | None) -> pd.DataFrame:
    if not district:
        return df
    needle = district.strip().lower()
    mask = df["district"].astype(str).str.lower() == needle
    if "district_code" in df.columns:
        mask |= df["district_code"].astype(str).str.lower() == needle
    return df[mask]


def panel_rows(
    *,
    period_code: str | None = None,
    crop: str | None = None,
    district: str | None = None,
    province: str | None = None,
    geography_level: str = "DISTRICT",
    limit: int = 500,
) -> dict:
    """One period of the panel, filtered and JSON-safe."""
    resolved, defaulted = _resolve_period(period_code)
    panel = _panel()

    frame = panel[panel["period_code"].astype(str) == resolved]
    if "geography_level" in frame.columns:
        frame = frame[frame["geography_level"].astype(str) == geography_level]

    frame = _filter_crop(frame, crop)
    frame = _filter_district(frame, district)
    if province and "province" in frame.columns:
        frame = frame[
            frame["province"].astype(str).str.lower() == province.strip().lower()
        ]

    # District-level rows only: the national/SSF/LSF breakdown is a different
    # population and is requested explicitly through geography_level.
    if geography_level == "DISTRICT" and "farmer_scale" in frame.columns:
        frame = frame[frame["farmer_scale"].astype(str) == "all"]

    frame = frame.sort_values(
        ["district", "canonical_crop_name"], kind="stable", na_position="last"
    )

    n_observations = int(len(frame))
    n_districts = int(frame["district"].nunique()) if "district" in frame else 0
    n_crops = int(frame["canonical_crop_name"].nunique()) if "canonical_crop_name" in frame else 0

    window = _clean(frame[[c for c in _ROW_COLUMNS if c in frame.columns]].head(limit))

    return {
        "period_code": resolved,
        "label": period_service.label(resolved),
        "defaulted_to_latest": defaulted,
        "filters": {
            "period_code": resolved,
            "crop": crop,
            "district": district,
            "province": province,
            "geography_level": geography_level,
            "limit": limit,
        },
        "n_observations": n_observations,
        "n_districts": n_districts,
        "n_crops": n_crops,
        "available_periods": period_service.period_codes(),
        "rows": window.to_dict(orient="records"),
        "source_id": _source_id(frame),
    }


def crop_trend(*, crop: str, district: str | None = None, season: str | None = None) -> dict:
    """One crop across every published period, district or national."""
    panel = _panel()
    crop_rows = _filter_crop(panel, crop)
    missing = crop_rows.empty

    if district:
        scope = "district"
        series = _filter_district(
            crop_rows[crop_rows["geography_level"].astype(str) == "DISTRICT"], district
        )
    else:
        # Published national totals only - never a sum of district rows.
        scope = "national"
        series = crop_rows[crop_rows["geography_level"].astype(str) == "NATIONAL"]
        if "farmer_scale" in series.columns:
            series = series[series["farmer_scale"].astype(str) == "all"]

    if season:
        letter = season.strip().upper()
        series = series[series["season"].astype(str).str.upper() == letter]

    points = []
    for code in period_service.period_codes():
        rows = series[series["period_code"].astype(str) == code]
        if rows.empty:
            # Not tabulated for this period: reported as no point at all rather
            # than a point full of zeros.
            continue
        year, season_letter = period_service.parse(code)
        values = {}
        for column in VALUE_COLUMNS:
            if column not in rows.columns:
                values[column] = None
                continue
            present = rows[column].dropna()
            # One district x crop row per period; a blank published cell stays null.
            values[column] = None if present.empty else round(float(present.iloc[0]), 4)
        points.append(
            {
                "period_code": code,
                "year": year,
                "season": season_letter,
                "label": period_service.label(code),
                "values": values,
            }
        )

    return {
        "crop": crop,
        "district": district,
        "geography_scope": scope,
        "points": points,
        "available_periods": period_service.period_codes(),
        "missing": missing or not points,
        "source_id": _source_id(series),
    }
