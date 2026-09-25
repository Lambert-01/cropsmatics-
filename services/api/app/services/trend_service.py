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


def crop_trends(crop: str | None = None, compare_crops: list[str] | None = None) -> dict:
    """National crop area/production/yield series.

    With no crop the individual (non-aggregate) crops are summed per period; the
    official aggregate groups are excluded to avoid double counting.

    ``compare_crops`` (2-5 crops, enforced at the API layer) returns one series
    per crop for the absolute metrics (area, production). Yield is NOT compared
    crop-to-crop as a raw value: different crops have incomparable natural yield
    scales, so the compared view keeps yield out of the visual comparison.
    """
    df = repo.national_crop_trends()
    df = df[~df["is_aggregate"].astype(bool)].copy()

    if compare_crops:
        names = [c.strip().lower() for c in compare_crops if c.strip()]
        df = df[df["canonical_crop_name"].astype(str).str.lower().isin(names)]
        metrics = ["cultivated_area_ha", "harvested_area_ha", "production_mt"]
        points = []
        for (year, season), grp in df.groupby(["year", "season"], dropna=False):
            values: dict[str, float | None] = {}
            for crop_name in compare_crops:
                sub = grp[
                    grp["canonical_crop_name"].astype(str).str.lower()
                    == crop_name.strip().lower()
                ]
                for m in metrics:
                    key = f"{m}:{crop_name}"
                    values[key] = None if sub[m].dropna().empty else round(float(sub[m].sum()), 2)
            points.append({
                "period": _period(year, season),
                "year": int(year),
                "season": str(season),
                "values": values,
            })
        points.sort(key=lambda p: (p["year"], p["season"]))
        units = {f"{m}:{c}": TREND_UNITS[m] for c in compare_crops for m in metrics}
        return {
            "crop": None,
            "compared_crops": compare_crops,
            "kind": "crop_trends_compare",
            "metric_units": units,
            "points": points,
        }

    if crop:
        df = df[df["canonical_crop_name"].astype(str).str.lower() == crop.lower()]

    metrics = ["cultivated_area_ha", "harvested_area_ha", "production_mt", "yield_mt_ha"]
    points = []
    for (year, season), grp in df.groupby(["year", "season"], dropna=False):
        values = {
            m: (None if grp[m].dropna().empty else round(float(grp[m].sum()), 2))
            for m in metrics
        }
        # For all crops, production / harvested area is the only meaningful
        # combined yield. For one crop, retain its published yield value.
        if crop:
            y = grp["yield_mt_ha"].dropna()
            values["yield_mt_ha"] = None if y.empty else round(float(y.iloc[0]), 4)
        else:
            paired = grp.dropna(subset=["production_mt", "harvested_area_ha"])
            paired = paired[paired["harvested_area_ha"] > 0]
            area = paired["harvested_area_ha"].sum()
            values["yield_mt_ha"] = (
                round(float(paired["production_mt"].sum() / area), 4) if area > 0 else None
            )
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
