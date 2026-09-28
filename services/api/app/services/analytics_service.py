"""Analytics service: turns processed tables into API-ready results.

All Pandas computation lives here (never in routers). Every result carries the
benchmark strategy, the period and the provenance so the numbers stay reviewable.
Gap semantics follow ``app.analytics.productivity_gap`` (higher = further below
benchmark). Associations are never presented as causal effects.
"""

from __future__ import annotations

from dataclasses import replace as dc_replace

import numpy as np
import pandas as pd

from app.analytics import intervention_priority as ip
from app.analytics.productivity_gap import STRATEGIES, compute_gaps
from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import period_service

# MVP proxies for priority components that official 2025B tables do not carry.
# Documented so the weighting is never a black box (docs/11_INTERVENTION_ENGINE.md).
_PERISHABILITY = {"high": 1.0, "medium": 0.5, "low": 0.2}

HIGH_GAP_PCT = 25.0  # |gap_index| at/above this is flagged "high gap" in the UI

# Yield-gap distribution bands. Thresholds are explicit and returned with the
# counts so the UI can print the actual cut points instead of a vague "low to
# high" legend. ``min_pct`` is exclusive, ``max_pct`` inclusive.
GAP_BANDS: tuple[dict, ...] = (
    {"id": "above_benchmark", "label": "At or above benchmark", "min_pct": None, "max_pct": 0.0},
    {"id": "near_benchmark", "label": "Near benchmark", "min_pct": 0.0, "max_pct": 10.0},
    {"id": "moderate_gap", "label": "Moderate gap", "min_pct": 10.0, "max_pct": HIGH_GAP_PCT},
    {"id": "high_gap", "label": "High gap", "min_pct": HIGH_GAP_PCT, "max_pct": None},
)

# --- primary KPI policy ----------------------------------------------------
# No surface may present more than four headline KPI cards, and the headline
# strip must describe one analytical scope and one period - never a 2025B
# context figure sitting next to a 2026B observation. Pages therefore name the
# KPI ids they consider primary, in order; everything else is secondary and
# belongs in a detail panel, table or "more metrics" disclosure.
MAX_PRIMARY_KPIS = 4


def split_kpis(kpis: list[dict], primary_ids: list[str]) -> tuple[list[dict], list[dict]]:
    """``(primary, secondary)`` with primary capped at four, in requested order.

    A primary KPI whose value is unavailable is still returned so the UI shows
    an explicit "no verified data" state; it is never swapped for a value from
    a different period to fill the slot.
    """
    by_id = {k["id"]: k for k in kpis}
    primary = [by_id[i] for i in primary_ids if i in by_id][:MAX_PRIMARY_KPIS]
    chosen = {k["id"] for k in primary}
    secondary = [k for k in kpis if k["id"] not in chosen]
    return primary, secondary

FACTOR_COLUMNS = [
    "improved_seed_farmers_pct",
    "organic_fertilizer_farmers_pct",
    "inorganic_fertilizer_farmers_pct",
    "pesticide_farmers_pct",
    "erosion_protection_farmers_pct",
    "mechanization_farmers_pct",
    "irrigation_farmers_pct",
    "agroforestry_farmers_pct",
]

FACTOR_LABELS = {
    "improved_seed_farmers_pct": "Improved seed use",
    "organic_fertilizer_farmers_pct": "Organic fertilizer use",
    "inorganic_fertilizer_farmers_pct": "Inorganic fertilizer use",
    "pesticide_farmers_pct": "Pesticide use",
    "erosion_protection_farmers_pct": "Erosion protection",
    "mechanization_farmers_pct": "Mechanization",
    "irrigation_farmers_pct": "Irrigation",
    "agroforestry_farmers_pct": "Agroforestry",
    "agricultural_land_000ha": "Agricultural land area",
}

PROXY_NOTES = [
    "vulnerability uses crop perishability as a proxy (no verified post-harvest loss join per district yet)",
    "readiness uses erosion-protection adoption as a proxy for existing practice uptake",
    "cost constraint uses agricultural-land share as an inverse cost proxy",
    "affected scale uses harvested area as a proxy for the number of farmers exposed",
]


def records(df: pd.DataFrame, columns: list[str] | None = None) -> list[dict]:
    """Convert a frame to JSON-safe records (NaN/NaT -> None)."""
    if columns:
        df = df[[c for c in columns if c in df.columns]]
    return df.replace({np.nan: None}).to_dict(orient="records")


def valid_yield(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["yield_kg_ha"].fillna(0) > 0].copy()


LEGACY_SOURCE_ID = "NISR_SAS_2025B_DISTRICT_CROP"


def frame_source_id(df: pd.DataFrame) -> str:
    """Source id of the rows actually used, taken from the rows themselves."""
    if "source_id" in df.columns:
        ids = sorted({str(v) for v in df["source_id"].dropna() if str(v)})
        if ids:
            return ",".join(ids)
    return LEGACY_SOURCE_ID


def frame_period_code(df: pd.DataFrame) -> str | None:
    """The single period a frame covers, or None when it spans several."""
    if "period_code" in df.columns:
        codes = sorted({str(v) for v in df["period_code"].dropna() if str(v)})
        if len(codes) == 1:
            return codes[0]
        return None
    if {"year", "season"}.issubset(df.columns):
        pairs = {
            (int(y), str(s)) for y, s in zip(df["year"], df["season"], strict=False) if str(s)
        }
        if len(pairs) == 1:
            year, season = pairs.pop()
            return f"{year}{season}"
    return None


def _factor_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in FACTOR_COLUMNS if c in df.columns]


def legacy_periods() -> set[str]:
    """Periods the joined training table actually carries (a single release)."""
    try:
        df = repo.training_dataset()
    except Exception:
        return set()
    if df.empty or not {"year", "season"}.issubset(df.columns):
        return set()
    return {
        f"{int(y)}{str(s).upper()}"
        for y, s in zip(df["year"], df["season"], strict=False)
        if str(s)
    }


def productivity_frame(f: AnalyticsFilters | None = None) -> pd.DataFrame:
    """The productivity rows a filter should read.

    Without a period selection this stays the joined training table, so existing
    analytics keep exactly the behaviour they had (including the factor columns
    only that table has). For a period the training table does not cover - the
    other seven published periods - it reads the canonical panel, district rows
    only, so a national row can never be reported as a district observation.
    """
    if f is None:
        return repo.training_dataset()

    key = f.period_key()
    if not key or key in legacy_periods():
        return repo.training_dataset()

    try:
        panel = repo.crop_productivity()
    except Exception:
        return repo.training_dataset()
    if "period_code" not in panel.columns:
        return repo.training_dataset()
    frame = panel[panel["period_code"].astype(str) == key]
    if "geography_level" in frame.columns:
        frame = frame[frame["geography_level"] == "DISTRICT"]
    if frame.empty:
        # The period exists but has no district rows: fall back to the training
        # table, whose apply_filters then yields an honest empty selection.
        return repo.training_dataset()
    return frame.copy()


def period_of(df: pd.DataFrame) -> str | None:
    if df.empty or "year" not in df.columns or "season" not in df.columns:
        return None
    years = sorted(df["year"].dropna().unique())
    seasons = sorted({str(s) for s in df["season"].dropna().unique()})
    if not years:
        return None
    if len(years) == 1 and seasons:
        return f"{years[0]}-{'-'.join(seasons)}"
    return ", ".join(f"{y}-{s}" for y in years for s in seasons)


# --- gap / priority frames -------------------------------------------------


def gapped(df: pd.DataFrame, strategy: str) -> pd.DataFrame:
    """Compute gaps on valid rows using the chosen benchmark strategy."""
    return compute_gaps(valid_yield(df), strategy=strategy)


def priority_frame(
    df: pd.DataFrame, strategy: str = "national_crop_median", weights: dict | None = None
) -> pd.DataFrame:
    """Attach priority components and a normalized priority score/band per row."""
    g = compute_gaps(valid_yield(df), strategy=strategy)
    if g.empty:
        return g
    g = g.copy()
    perish = g.get("perishability", pd.Series(index=g.index, dtype=object))
    g["vulnerability"] = perish.map(_PERISHABILITY).fillna(0.5)
    g["affected_scale"] = g.get("harvested_area_ha", pd.Series(0.0, index=g.index)).fillna(0.0)
    g["readiness"] = (
        g.get("erosion_protection_farmers_pct", pd.Series(50.0, index=g.index)).fillna(50.0) / 100.0
    )
    land = g.get("agricultural_land_000ha", pd.Series(index=g.index, dtype=float))
    g["cost_constraint"] = 1.0 - (land / land.max()) if land.notna().any() and land.max() else 0.0

    norm = {}
    for metric in ["gap_index", "vulnerability", "affected_scale", "readiness", "cost_constraint"]:
        norm[metric] = ip.normalize(
            {i: float(v) for i, v in g[metric].fillna(0.0).items()}
        )
    scores, bands = [], []
    for idx, _row in g.iterrows():
        r = ip.priority_score(
            gap=norm["gap_index"].get(idx, 0.0),
            vulnerability=norm["vulnerability"].get(idx, 0.0),
            affected_scale=norm["affected_scale"].get(idx, 0.0),
            readiness=norm["readiness"].get(idx, 0.0),
            cost_constraint=norm["cost_constraint"].get(idx, 0.0),
            weights=weights,
        )
        scores.append(r.score)
        bands.append(r.band)
    g["priority_score"] = scores
    g["priority_band"] = bands
    return g


# --- endpoints support -----------------------------------------------------


def gap_report(strategy: str = "national_crop_median", limit: int = 100) -> dict:
    df = repo.training_dataset()
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy {strategy!r}; expected one of {STRATEGIES}")
    gapped_df = compute_gaps(df, strategy=strategy)
    gapped_df = gapped_df[gapped_df["gap_index"].notna()].sort_values("gap_index", ascending=False)
    rows = gapped_df.head(limit)[
        ["year", "season", "district", "canonical_crop_name", "cultivated_area_ha",
         "harvested_area_ha", "production_mt", "yield_kg_ha", "benchmark_yield_kg_ha",
         "gap_index"]
    ].rename(columns={"canonical_crop_name": "crop"})
    return {
        "strategy": strategy,
        "count": len(rows),
        "rows": rows.where(pd.notna(rows), None).to_dict(orient="records"),
    }


def productivity(f: AnalyticsFilters) -> dict:
    """KPI + district ranking for the Productivity Intelligence page."""
    df = apply_filters(productivity_frame(f), f)
    g = gapped(df, f.benchmark_strategy)
    if g.empty:
        # The crop was not tabulated for this period. Report no KPIs at all
        # rather than manufactured zeros, but still explain the missing
        # same-season comparison so a client can say why.
        return {
            "period": None,
            "period_code": f.period_code,
            "kpis": [],
            "primary_kpis": [],
            "secondary_kpis": [],
            "yoy": same_season_yoy(f, f.period_code),
            "gap_bands": [],
            "gap_summary": gap_summary(pd.Series(dtype=float)),
            "rows": [],
            "n_observations": 0,
        }

    valid = g[g["gap_index"].notna()]
    benchmark_median = float(valid["benchmark_yield_kg_ha"].median()) if not valid.empty else None
    summary = gap_summary(valid["gap_index"] if not valid.empty else pd.Series(dtype=float))
    period_code = frame_period_code(g)
    source_id = frame_source_id(g)

    rows = (
        valid.groupby("district", dropna=False)
        .agg(
            district_code=("district_code", "first"),
            province=("province", "first"),
            yield_kg_ha=("yield_kg_ha", "median"),
            benchmark_yield_kg_ha=("benchmark_yield_kg_ha", "median"),
            gap_index=("gap_index", "median"),
            harvested_area_ha=("harvested_area_ha", "sum"),
            production_mt=("production_mt", "sum"),
        )
        .reset_index()
        .sort_values("gap_index", ascending=False)
    )
    rows = rows.head(f.limit)

    # Same-season year-on-year change and the gap distribution both describe the
    # selection the caller is looking at, so they are computed here rather than
    # in the browser.
    yoy = same_season_yoy(f, period_code)
    bands = gap_distribution(rows)

    kpis: list[dict] = []
    # Raw yields are only comparable within a crop. Without a crop selection no
    # yield KPI is produced at all - an "all crops yield" would average across
    # biologically different crops and is never presented.
    if f.crop:
        # A headline must answer "what crop is this?" on its own, so the crop is
        # in the label rather than only in surrounding context.
        kpis.append(
            {
                "id": "mean_yield", "label": f"Observed {f.crop} yield",
                "value": round(float(valid["yield_kg_ha"].mean()), 1)
                if not valid.empty else None,
                "unit": "kg/ha", "period_code": period_code, "source_id": source_id,
                "note": f"{f.crop} only",
            }
        )
        kpis.append(
            {
                "id": "benchmark_yield", "label": f"Benchmark {f.crop} yield",
                "value": None if benchmark_median is None else round(benchmark_median, 1),
                "unit": "kg/ha", "period_code": period_code, "source_id": source_id,
                "note": f"{f.crop} only · {f.benchmark_strategy} benchmark",
            }
        )
    shortfall = summary["typical_shortfall"]
    n_below = summary["districts_below"]
    kpis.extend(
        [
            # The informative gap figure: how far the districts that ARE below
            # benchmark typically sit below it.
            {"id": "gap_shortfall", "label": "Typical yield gap",
             "value": None if shortfall is None else round(shortfall, 1),
             "unit": "%", "period_code": period_code, "source_id": source_id,
             "note": (
                 f"median shortfall across the {n_below} districts below benchmark"
                 if n_below
                 else "no district is below the benchmark for this selection"
             )},
            {"id": "below_benchmark_share", "label": "Districts below benchmark",
             "value": summary["below_share_pct"], "unit": "%",
             "period_code": period_code, "source_id": source_id,
             "note": f"{n_below} of {summary['total']}"},
            # Kept for compatibility, but flagged when it is a structural zero so
            # a client can never present it as "no gap anywhere".
            {"id": "median_gap", "label": "Median productivity gap",
             "value": None if summary["median_gap"] is None else round(summary["median_gap"], 1),
             "unit": "%", "period_code": period_code, "source_id": source_id,
             "note": (
                 "0 by construction: the benchmark is itself a distribution "
                 "median, so use the typical yield gap and the share below benchmark"
                 if summary["median_is_degenerate"]
                 else f"{f.benchmark_strategy} benchmark"
             )},
            {"id": "districts_above", "label": "Observations at/above benchmark",
             "value": summary["districts_above"], "unit": "district-crops",
             "period_code": period_code, "source_id": source_id},
            {"id": "districts_below", "label": "Observations below benchmark",
             "value": n_below, "unit": "district-crops",
             "period_code": period_code, "source_id": source_id},
            {"id": "crops", "label": "Crops analysed",
             "value": int(valid["canonical_crop_name"].nunique()) if not valid.empty else 0,
             "unit": "crops", "period_code": period_code, "source_id": source_id},
        ]
    )

    if f.crop:
        available = bool(yoy and yoy.get("available"))
        kpis.append(
            {
                "id": "yoy_yield",
                "label": "Same-season change",
                "value": yoy.get("change_pct") if available else None,
                "unit": "%",
                "period_code": period_code,
                "source_id": source_id,
                "note": (
                    f"{f.crop} vs {yoy['previous_period_label']} "
                    f"({yoy['previous_period_code']})"
                    if available
                    else (yoy or {}).get("reason", "not available for this selection")
                ),
            }
        )

    # Yield Intelligence headlines: observed yield, benchmark, the typical gap
    # and the same-season change. "Median productivity gap" is deliberately not a
    # headline: it is structurally 0 for a median benchmark (see gap_summary).
    primary_ids = (
        ["mean_yield", "benchmark_yield", "gap_shortfall", "yoy_yield"]
        if f.crop
        else ["gap_shortfall", "below_benchmark_share", "districts_below", "crops"]
    )
    primary, secondary = split_kpis(kpis, primary_ids)

    return {
        "period": period_of(g),
        "period_code": period_code,
        "source_id": source_id,
        "kpis": kpis,
        "primary_kpis": primary,
        "secondary_kpis": secondary,
        "yoy": yoy,
        "gap_bands": bands,
        "gap_summary": summary,
        "rows": records(rows),
        "n_observations": int(len(valid)),
    }


def gap_summary(gap_index: pd.Series) -> dict:
    """Summarise a gap distribution without headlining a degenerate median.

    ``gap_index = 100 * (1 - yield / benchmark)`` is a monotone-decreasing
    transform of yield, so whenever the benchmark is itself a median of the same
    population ``median(gap_index)`` is *identically 0* - not "no gap", but a
    property of the estimator. Reporting it as "Median productivity gap: 0.0%"
    while half the districts sit below the benchmark is exactly the kind of
    number that reads as meaningful and is not.

    This returns the median (kept for compatibility) **plus** the two figures
    that do carry information: the typical shortfall among districts that are
    actually below benchmark, and the share of districts below benchmark.
    """
    series = gap_index.dropna()
    total = int(len(series))
    if total == 0:
        return {
            "median_gap": None,
            "typical_shortfall": None,
            "districts_below": 0,
            "districts_above": 0,
            "total": 0,
            "below_share_pct": None,
            "median_is_degenerate": False,
        }

    median_gap = float(series.median())
    below = series[series > 0]
    n_below = int(len(below))
    return {
        "median_gap": median_gap,
        "typical_shortfall": float(below.median()) if n_below else None,
        "districts_below": n_below,
        "districts_above": int(total - n_below),
        "total": total,
        "below_share_pct": round(100.0 * n_below / total, 1),
        # A structural zero, not a measured absence of gaps.
        "median_is_degenerate": abs(median_gap) < 1e-9 and n_below > 0,
    }


def gap_distribution(rows: pd.DataFrame) -> list[dict]:
    """Count districts into the documented yield-gap bands.

    Bands are counted over the district rows the page actually shows (one
    median gap per district), and every band reports its own cut points so the
    classification is auditable rather than a black box.
    """
    if rows.empty or "gap_index" not in rows.columns:
        return []
    series = rows["gap_index"].dropna()
    total = int(len(series))
    out: list[dict] = []
    for band in GAP_BANDS:
        low, high = band["min_pct"], band["max_pct"]
        mask = pd.Series(True, index=series.index)
        if low is not None:
            mask &= series > low
        if high is not None:
            mask &= series <= high
        count = int(mask.sum())
        out.append(
            {
                "id": band["id"],
                "label": band["label"],
                "min_pct": low,
                "max_pct": high,
                "count": count,
                "share_pct": None if total == 0 else round(100.0 * count / total, 1),
            }
        )
    return out


def _mean_yield_for(f: AnalyticsFilters, period_code: str) -> float | None:
    """Mean observed yield of the same selection in one period, or None."""
    probe = dc_replace(f, period_code=period_code)
    frame = apply_filters(productivity_frame(probe), probe)
    if frame.empty or "yield_kg_ha" not in frame.columns:
        return None
    present = frame["yield_kg_ha"].dropna()
    present = present[present > 0]
    if present.empty:
        return None
    return float(present.mean())


def same_season_yoy(f: AnalyticsFilters, period_code: str | None) -> dict | None:
    """Same-season, previous-year change for the current selection.

    Agricultural seasons differ, so an A -> B -> C step is not a time series.
    The honest comparison is the same season one year earlier (2025B vs 2026B),
    which is what this computes. Returns ``None`` when no crop is selected (a
    cross-crop mean yield is meaningless) and a structured "not published"
    result when the previous year has no release for the crop.
    """
    if not f.crop or not period_code:
        return None
    try:
        year, season = period_service.parse(period_code)
    except period_service.UnknownPeriodError:
        return None

    previous = f"{year - 1}{season}"
    if previous not in period_service.period_codes():
        return {
            "available": False,
            "reason": (
                f"{period_service.label(previous)} has not been published, so no "
                "same-season comparison exists"
            ),
            "period_code": period_code,
            "previous_period_code": previous,
        }

    current_value = _mean_yield_for(f, period_code)
    previous_value = _mean_yield_for(f, previous)
    if current_value is None or previous_value is None or previous_value == 0:
        return {
            "available": False,
            "reason": (
                f"{f.crop} has no published yield for "
                f"{period_service.label(previous)} in this selection"
            ),
            "period_code": period_code,
            "previous_period_code": previous,
        }

    return {
        "available": True,
        "period_code": period_code,
        "period_label": period_service.label(period_code),
        "previous_period_code": previous,
        "previous_period_label": period_service.label(previous),
        "current_yield_kg_ha": round(current_value, 1),
        "previous_yield_kg_ha": round(previous_value, 1),
        "change_pct": round(100.0 * (current_value - previous_value) / previous_value, 1),
        "crop": f.crop,
        "district": f.district,
        "province": f.province,
        "note": (
            "same-season year-on-year comparison of mean observed yield; seasons "
            "are not comparable in sequence because they differ agronomically"
        ),
    }


def single_release_note(f: AnalyticsFilters, dataset: str, what: str) -> str | None:
    """Explain, honestly, why a period selection has no rows for a dataset.

    District input/practice, irrigation and erosion tables are still a
    single-release extract, so any other period genuinely has no such data.
    Saying so is better than an empty result that reads as "nothing measured".
    """
    if not f.period_code:
        return None
    covers = any(d["dataset"] == dataset for d in period_service.datasets_for(f.period_code))
    if covers:
        return None
    return (
        f"{what} is not published for {f.period_code}; the district "
        f"{dataset.replace('_', ' ')} table covers 2025 Season B only, so this "
        "period returns no rows"
    )


def factor_associations(f: AnalyticsFilters) -> dict:
    if not f.crop:
        return {"crop": None, "district": f.district, "factors": []}
    df = apply_filters(repo.training_dataset(), f)
    df = valid_yield(df)

    results = []
    for col in _factor_cols(df):
        sub = df[["yield_kg_ha", col]].dropna()
        corr = sub["yield_kg_ha"].corr(sub[col]) if len(sub) >= 3 else None
        if corr is not None and pd.isna(corr):
            corr = None
        n = int(len(sub))
        if corr is None:
            interpretation = "insufficient observations to estimate association"
            direction = None
        elif n < 8:
            interpretation = "small sample; association is indicative only"
            direction = "positive" if corr > 0 else "negative"
        else:
            direction = "positive" if corr > 0 else "negative"
            interpretation = (
                f"{direction} association with yield across {n} observations "
                "(not evidence of causation)"
            )
        results.append({
            "factor": col,
            "label": FACTOR_LABELS.get(col, col),
            "correlation": None if corr is None else round(float(corr), 4),
            "absolute_correlation": None if corr is None else round(abs(float(corr)), 4),
            "n_observations": n,
            "direction": direction,
            "interpretation": interpretation,
        })
    results.sort(
        key=lambda r: (r["absolute_correlation"] is None, -(r["absolute_correlation"] or 0))
    )
    return {
        "crop": f.crop,
        "district": f.district,
        "factors": results[: f.limit],
    }


def heatmap(f: AnalyticsFilters, metric: str = "gap") -> dict:
    """district x crop matrix for a chosen metric."""
    g = gapped(apply_filters(productivity_frame(f), f), f.benchmark_strategy)
    if g.empty:
        return {"metric": metric, "districts": [], "crops": [], "cells": [],
                "max_value": None, "min_value": None, "unit": None}
    col = "gap_index" if metric == "gap" else "yield_kg_ha"
    unit = "%" if metric == "gap" else "kg/ha"
    piv = g.pivot_table(index="district", columns="canonical_crop_name", values=col, aggfunc="median")
    districts = [str(d) for d in piv.index.tolist()]
    crops = [str(c) for c in piv.columns.tolist()]
    cells = [
        {"district": str(d), "crop": str(c), "value": None if pd.isna(v) else round(float(v), 2)}
        for d, row in piv.iterrows()
        for c, v in row.items()
    ]
    values = [c["value"] for c in cells if c["value"] is not None]
    return {
        "metric": metric,
        "districts": districts,
        "crops": crops,
        "cells": cells,
        "max_value": max(values) if values else None,
        "min_value": min(values) if values else None,
        "unit": unit,
    }


def _district_factor_means(f: AnalyticsFilters, columns: list[str]) -> list[dict]:
    df = apply_filters(repo.factors_dataset(), f, crop_column="district")
    cols = [c for c in columns if c in df.columns]
    if not cols:
        return []
    out = df[["district", "district_code", "province", *cols]].copy()
    out["mean"] = out[cols].mean(axis=1)
    return records(out[["district", "district_code", "province", "mean"]])


def irrigation_summary(f: AnalyticsFilters) -> dict:
    df = apply_filters(repo.irrigation_water(), f, crop_column="district")
    return {"districts": records(df), "period": period_of(df)}


def erosion_summary(f: AnalyticsFilters) -> dict:
    df = apply_filters(repo.erosion_control(), f, crop_column="district")
    return {"districts": records(df), "period": period_of(df)}


def normalise_weights(weights: dict | None) -> dict:
    """The fully-specified weighting actually used, defaults filled in."""
    return {**ip.DEFAULT_WEIGHTS, **(weights or {})}


def _candidate_frame(f: AnalyticsFilters | None) -> pd.DataFrame:
    """Rows carrying the **raw** priority components, before any weighting.

    Kept as the single source for the candidate set. The sensitivity sweep needs
    the un-normalized components, because it re-normalizes and re-weights the
    same candidates many times; feeding it the already-normalized values the API
    exposes would normalize twice and silently change every score.
    """
    df = apply_filters(productivity_frame(f), f) if f is not None else repo.training_dataset()
    gapped_df = _threshold_gap(df, f.benchmark_strategy if f else "national_crop_median")
    gapped_df = gapped_df[gapped_df["yield_kg_ha"].fillna(0) > 0].copy()
    if gapped_df.empty:
        return gapped_df

    perish = gapped_df.get("perishability", pd.Series(index=gapped_df.index, dtype=object))
    gapped_df["vulnerability"] = perish.map(_PERISHABILITY).fillna(0.5)
    gapped_df["affected_scale"] = gapped_df.get(
        "harvested_area_ha", pd.Series(0, index=gapped_df.index)
    ).fillna(0)
    gapped_df["readiness"] = (
        gapped_df.get("erosion_protection_farmers_pct", pd.Series(50.0, index=gapped_df.index))
        .fillna(50.0) / 100.0
    )
    land = gapped_df.get("agricultural_land_000ha", pd.Series(index=gapped_df.index, dtype=float))
    gapped_df["cost_constraint"] = 1.0 - (land / land.max()) if land.notna().any() and land.max() else 0.0
    return gapped_df


def priority_candidates_with_source(
    f: AnalyticsFilters | None = None,
) -> tuple[list[dict], str | None]:
    """The candidates plus the source id of the rows they were built from.

    The source is read from the frame that actually produced the candidates, so a
    ranking's provenance can never name a different dataset than the one ranked.
    """
    gapped_df = _candidate_frame(f)
    if gapped_df.empty:
        return [], None

    candidates = []
    for _, row in gapped_df.iterrows():
        cid = f"{row.get('district_code', row['district'])}::{row['canonical_crop_name']}"
        candidates.append({
            "id": cid,
            "district": row["district"],
            "crop": row["canonical_crop_name"],
            "yield_kg_ha": None if pd.isna(row["yield_kg_ha"]) else round(float(row["yield_kg_ha"]), 1),
            "benchmark_yield_kg_ha": (
                None if pd.isna(row["benchmark_yield_kg_ha"])
                else round(float(row["benchmark_yield_kg_ha"]), 1)
            ),
            "harvested_area_ha": (
                None if pd.isna(row.get("harvested_area_ha")) else round(float(row["harvested_area_ha"]), 1)
            ),
            "gap": float(row["gap_index"]) if pd.notna(row["gap_index"]) else 0.0,
            "vulnerability": float(row["vulnerability"]),
            "affected_scale": float(row["affected_scale"]),
            "readiness": float(row["readiness"]),
            "cost_constraint": float(row["cost_constraint"]),
        })
    return candidates, frame_source_id(gapped_df)


def priority_candidates(f: AnalyticsFilters | None = None) -> list[dict]:
    """The district x crop candidates, with raw (un-normalized) components."""
    return priority_candidates_with_source(f)[0]


def priorities(limit: int = 50, weights: dict | None = None, f: AnalyticsFilters | None = None) -> dict:
    candidates = priority_candidates(f)
    if not candidates:
        return {"weights": {**ip.DEFAULT_WEIGHTS, **(weights or {})}, "rows": [],
                "proxy_notes": PROXY_NOTES}

    ranked = ip.rank(candidates, weights=weights)[:limit]
    rows = [{
        "id": r["id"], "district": r["district"], "crop": r["crop"],
        "score": r["score"], "band": r["band"],
        "yield_kg_ha": r.get("yield_kg_ha"),
        "benchmark_yield_kg_ha": r.get("benchmark_yield_kg_ha"),
        "harvested_area_ha": r.get("harvested_area_ha"),
        # `gap` is a raw component while the others are normalized, because gap is
        # reported to users in its own units. Callers that need a consistent set
        # (the sensitivity sweep) use `priority_candidates` instead.
        "gap": round(r["gap"], 4), "vulnerability": r["vulnerability_component"],
        "affected_scale": r["affected_scale_component"],
        "readiness": r["readiness_component"], "cost_constraint": r["cost_component"],
    } for r in ranked]
    return {
        "weights": {**ip.DEFAULT_WEIGHTS, **(weights or {})},
        "rows": rows,
        "proxy_notes": PROXY_NOTES,
    }


def _threshold_gap(df: pd.DataFrame, strategy: str) -> pd.DataFrame:
    """Compute gaps on all valid rows using the selected benchmark."""
    valid = df[df["yield_kg_ha"].fillna(0) > 0].copy()
    return compute_gaps(valid, strategy=strategy)
