"""National trend services (crop area/production/yield + input adoption).

Only the periods that genuinely exist in the published data are returned, so
charts never show an interpolated or assumed point.
"""

from __future__ import annotations

from app.repositories import dataset_repository as repo

TREND_UNITS = {
    "cultivated_area_ha": "ha",
    "harvested_area_ha": "ha",
    "production_mt": "metric tonnes",
    "yield_mt_ha": "t/ha",
}

INPUT_UNITS = {
    "improved_seed_pct": "% of farmers",
    "organic_fertilizer_pct": "% of farmers",
    "inorganic_fertilizer_pct": "% of farmers",
    "pesticide_pct": "% of farmers",
    "irrigation_pct": "% of farmers",
    "anti_erosion_pct": "% of households",
    "agroforestry_pct": "% of households",
    "mechanization_pct": "% of farmers",
}


def _period(year, season) -> str:
    return f"{int(year)}{season}" if season else str(int(year))


def crop_trends(crop: str | None = None) -> dict:
    """National crop area/production/yield series.

    With no crop the individual (non-aggregate) crops are summed per period; the
    official aggregate groups are excluded to avoid double counting.
    """
    df = repo.national_crop_trends()
    df = df[~df["is_aggregate"].astype(bool)].copy()
    if crop:
        df = df[df["canonical_crop_name"].astype(str).str.lower() == crop.lower()]

    metrics = ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_mt_ha"]
    points = []
    for (year, season), grp in df.groupby(["year", "season"], dropna=False):
        values = {
            m: (None if grp[m].dropna().empty else round(float(grp[m].sum()), 2))
            for m in metrics
        }
        # Yield is a ratio, never a sum of ratios.
        y = grp["yield_mt_ha"].dropna()
        values["yield_mt_ha"] = None if y.empty else round(float(y.mean()), 4)
        points.append({
            "period": _period(year, season),
            "year": int(year),
            "season": str(season),
            "values": values,
        })
    points.sort(key=lambda p: (p["year"], p["season"]))
    return {"crop": crop, "kind": "crop_trends", "metric_units": TREND_UNITS, "points": points}


def input_adoption() -> dict:
    df = repo.national_input_trends()
    cols = [c for c in df.columns if c.endswith("_pct")]
    points = []
    for _, row in df.sort_values(["year", "season"]).iterrows():
        values = {c: (None if _isna(row[c]) else round(float(row[c]), 2)) for c in cols}
        points.append({
            "period": _period(row["year"], row["season"]),
            "year": int(row["year"]),
            "season": str(row["season"]),
            "values": values,
        })
    return {"kind": "input_adoption", "crop": None, "metric_units": INPUT_UNITS, "points": points}


def available_national_periods() -> list[str]:
    df = repo.national_crop_trends()
    pairs = df[["year", "season"]].dropna().drop_duplicates().sort_values(["year", "season"])
    return [_period(y, s) for y, s in pairs.itertuples(index=False)]


def _isna(value) -> bool:
    try:
        return value != value  # NaN check without importing numpy
    except Exception:
        return value is None
