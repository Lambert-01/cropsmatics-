"""Forecast target registry.

A target is a *question with an answer that could be scored*, not a vague
promise to "predict agriculture". Each entry states the crop, the metric, the
unit, the geographic level, the season the forecast applies to, the horizon, how
much history the method needs, and what published record could ever confirm it.

Everything in here is derived from the published period dimension: a target that
names a season the source does not publish cannot be constructed, and the
eligibility check reports that rather than inventing a comparable period.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from ml.src.utils.paths import PROCESSED_DIR

PANEL_FILENAME = "crop_productivity.csv"

# The canonical panel column holding each scorable metric.
METRIC_COLUMNS: dict[str, str] = {
    "yield": "yield_kg_ha",
    "area": "harvested_area_ha",
    "production": "production_mt",
}

UNITS: dict[str, str] = {
    "yield_kg_ha": "kg/ha",
    "harvested_area_ha": "ha",
    "production_mt": "MT",
}


@dataclass(frozen=True)
class ForecastTarget:
    """One scorable forecast question.

    ``season`` is the agricultural season the target applies to. A season-A
    forecast is only ever trained on season-A observations: seasons differ
    agronomically, so stacking A and B to get more rows would be a fabricated
    time series.
    """

    target_id: str
    crop: str
    metric: str
    season: str
    geography_level: str
    horizon: str
    publication_lag_note: str
    notes: str = ""
    tags: tuple[str, ...] = field(default_factory=tuple)

    @property
    def metric_column(self) -> str:
        return METRIC_COLUMNS[self.metric]

    @property
    def unit(self) -> str:
        return UNITS[self.metric_column]


# Candidate targets, deliberately narrow. Each one is a same-season, one-step
# question because that is the only horizon the record can score: the earliest
# district release is 2022A, so there are at most five same-season observations
# per district (2022-2026) and one-step-ahead is the honest limit.
CANDIDATE_TARGETS: tuple[ForecastTarget, ...] = (
    ForecastTarget(
        target_id="district_maize_yield_next_season_a",
        crop="Maize",
        metric="yield",
        season="A",
        geography_level="DISTRICT",
        horizon="next published Season A after the last observed one",
        publication_lag_note=(
            "NISR publishes a season's district tables roughly 3-6 months after "
            "harvest, so a next-season-A forecast is made with the previous "
            "season's release as the most recent information available."
        ),
        notes="Maize is tabulated in every A/B release, so the series is continuous.",
    ),
    ForecastTarget(
        target_id="district_maize_yield_next_season_b",
        crop="Maize",
        metric="yield",
        season="B",
        geography_level="DISTRICT",
        horizon="next published Season B after the last observed one",
        publication_lag_note="Same publication lag as Season A.",
        notes="Maize is tabulated in every A/B release, so the series is continuous.",
    ),
    ForecastTarget(
        target_id="district_beans_yield_next_season_a",
        crop="Beans",
        metric="yield",
        season="A",
        geography_level="DISTRICT",
        horizon="next published Season A after the last observed one",
        publication_lag_note="Same publication lag as maize.",
        notes=(
            "Beans are reported at the parent level (bush + climbing + pea are "
            "subtypes and are never summed in as well)."
        ),
    ),
    ForecastTarget(
        target_id="district_beans_yield_next_season_b",
        crop="Beans",
        metric="yield",
        season="B",
        geography_level="DISTRICT",
        horizon="next published Season B after the last observed one",
        publication_lag_note="Same publication lag as maize.",
    ),
    ForecastTarget(
        target_id="national_maize_yield_next_season_b",
        crop="Maize",
        metric="yield",
        season="B",
        geography_level="NATIONAL",
        horizon="next published Season B after the last observed one",
        publication_lag_note="Same publication lag as the district tables.",
        notes=(
            "The published national row, never a sum of district rows. National "
            "yield is tabulated in every release, unlike national production, "
            "which only the 2023 workbook publishes."
        ),
    ),
    ForecastTarget(
        target_id="national_maize_production_next_season_b",
        crop="Maize",
        metric="production",
        season="B",
        geography_level="NATIONAL",
        horizon="next published Season B after the last observed one",
        publication_lag_note="Same publication lag as the district tables.",
        notes=(
            "National totals are the published national rows, never a sum of the "
            "district rows (which would silently change the estimator)."
        ),
    ),
)


def load_panel(panel_path=None) -> pd.DataFrame:
    """Load the canonical multi-period productivity panel."""
    path = panel_path or (PROCESSED_DIR / PANEL_FILENAME)
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Run `make data` to build the processed panel first."
        )
    panel = pd.read_csv(path)
    for column in ("period_code", "crop_name_raw", "geography_level", "farmer_scale"):
        if column not in panel.columns:
            raise ValueError(f"panel is missing required column {column!r}")
    return panel


EMPTY_SERIES_COLUMNS = ["period_code", "year", "season", "district", "value"]


def target_series(target: ForecastTarget, panel: pd.DataFrame) -> pd.DataFrame:
    """The admissible observations for one target, one row per period.

    Returns a frame with ``period_code``, ``year``, ``season``, ``district`` and
    ``value``; see :func:`admissible_rows` for the exclusion rules.
    """
    admissible, _excluded = admissible_rows(target, panel)
    if admissible.empty:
        return pd.DataFrame(columns=EMPTY_SERIES_COLUMNS)
    series = pd.DataFrame(
        {
            "period_code": admissible["period_code"].astype(str),
            "year": pd.to_numeric(admissible["year"], errors="coerce").astype("Int64"),
            "season": admissible["season"].astype(str),
            "district": admissible["district"].where(admissible["district"].notna(), None),
            "value": admissible["value"],
        }
    )
    return series.sort_values(
        ["district", "period_code"], na_position="first"
    ).reset_index(drop=True)


def excluded_observation_count(target: ForecastTarget, panel: pd.DataFrame) -> int:
    """Observations dropped by the published-consistency policy for one target."""
    _admissible, excluded = admissible_rows(target, panel)
    return int(len(excluded))


def admissible_rows(target: ForecastTarget, panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """``(admissible, excluded)`` observations for one target.

    ``excluded`` holds rows dropped because their published yield contradicts
    their own production and harvested area beyond the shared documented
    tolerance. They are returned rather than silently dropped so the backtest
    report can say how many observations a flag removed. Every other exclusion is
    a statement about admissibility:

    * only the canonical published crop label (never an alias or aggregate);
    * only the requested season - seasons are not interchangeable;
    * only the requested geography level, with ``farmer_scale == "all"`` so the
      all-farmer series is never mixed with the small/large-scale series;
    * rows whose published yield contradicts their own production/area beyond the
      documented tolerance are dropped, using the same shared policy the API and
      the database loader use.
    """
    from scripts.data.common import is_material_yield_discrepancy

    empty = pd.DataFrame(columns=["period_code", "year", "season", "district", "value"])
    rows = panel[
        (panel["crop_name_raw"].astype(str) == target.crop)
        & (panel["season"].astype(str).str.upper() == target.season.upper())
        & (panel["geography_level"].astype(str).str.upper() == target.geography_level.upper())
    ].copy()
    if "farmer_scale" in rows.columns:
        rows = rows[rows["farmer_scale"].astype(str) == "all"]
    if rows.empty:
        return empty, empty

    if target.geography_level.upper() == "DISTRICT":
        rows = rows[rows["district"].notna()]
    else:
        rows = rows[rows["district"].isna()]

    column = target.metric_column
    if column not in rows.columns:
        return empty, empty

    frame = pd.DataFrame(
        {
            "period_code": rows["period_code"].astype(str),
            "year": pd.to_numeric(rows["year"], errors="coerce").astype("Int64"),
            "season": rows["season"].astype(str),
            "district": rows["district"].where(rows["district"].notna(), None),
            "value": pd.to_numeric(rows[column], errors="coerce"),
        }
    )
    measurable = frame[frame["value"].notna()].copy()
    if measurable.empty:
        return empty, empty

    # Published-consistency exclusion, applied per row and returned so the
    # backtest report can state how many observations a quality flag removed.
    if target.metric == "yield":
        flagged = rows.apply(
            lambda row: is_material_yield_discrepancy(
                _as_float(row.get("production_mt")),
                _as_float(row.get("harvested_area_ha")),
                _as_float(row.get("yield_kg_ha")),
            ),
            axis=1,
        )
        flagged = flagged.reindex(rows.index, fill_value=False)
        excluded = measurable.loc[flagged.reindex(measurable.index, fill_value=False).to_numpy()]
        admissible = measurable.drop(index=excluded.index)
        return admissible, excluded
    return measurable, empty


def _as_float(value) -> float | None:
    try:
        if value is None:
            return None
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if result != result else result  # NaN check without numpy
