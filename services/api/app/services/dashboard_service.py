"""Dashboard overview service.

Returns only metrics the real data support. Derived aggregates (average yield,
totals, gap medians, adoption means) are all computed here so the frontend never
recomputes an official statistic.
"""

from __future__ import annotations

from dataclasses import replace

import pandas as pd

from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import meta_service, period_service, trend_service
from app.services.analytics_service import (
    FACTOR_COLUMNS,
    HIGH_GAP_PCT,
    frame_period_code,
    frame_source_id,
    gap_summary,
    gapped,
    period_of,
    productivity_frame,
    split_kpis,
)


def _period_key(f: AnalyticsFilters) -> str | None:
    return f.period_key() or (str(f.year) if f.year else None)


#: Analytical scope of an overview request, reported verbatim in the response.
#:
#: ``period``  - one published release is selected; every figure shares it.
#: ``history`` - no release is selected, i.e. "all published periods". The
#:               district snapshot is then pinned to one *named* release instead
#:               of letting whichever table happened to be the default stand in
#:               for the whole published axis.
SCOPE_PERIOD = "period"
SCOPE_HISTORY = "history"

_SNAPSHOT_NOTE = (
    "no release is selected, so the district snapshot is pinned to the latest "
    "published district release; every panel that covers a different range "
    "names its own period"
)


def scope_of(f: AnalyticsFilters) -> str:
    """``period`` when the caller named a release, ``history`` when they did not."""
    return SCOPE_PERIOD if _period_key(f) else SCOPE_HISTORY


def _period_timeline() -> list[dict]:
    """The published period axis, ready to chart.

    Only periods that genuinely carry rows are listed (the catalogue is derived
    from the processed tables), and each entry carries its own coverage so a
    client cannot draw a district choropleth from a national-only period.
    """
    try:
        periods = period_service.catalog()["periods"]
    except Exception:
        return []
    return [
        {
            "period_code": p["period_code"],
            "label": p["label"],
            "coverage_level": p.get("coverage_level"),
            "n_districts": int(p.get("n_districts") or 0),
            "n_crops": int(p.get("n_crops") or 0),
            "is_latest": bool(p.get("is_latest")),
            "is_latest_district": bool(p.get("is_latest_district")),
            # Availability travels with the axis so a client can disable a
            # coverage-only release and explain why, instead of offering it and
            # then receiving an empty or 503 answer.
            "published": bool(p.get("published", True)),
            "servable": bool(p.get("servable")),
            "availability_status": p.get("availability_status", "not_servable"),
            "availability_message": p.get("availability_message"),
        }
        for p in periods
    ]


def _scope_payload(scope: str, snapshot_code: str | None) -> dict:
    """The explicit scope block every overview response carries.

    ``scope`` says whether the caller selected one release or asked for all
    published periods. ``snapshot`` names the single release the district panels
    describe, so a client can label a one-release snapshot instead of presenting
    it as the whole published axis.
    """
    snapshot = None
    if snapshot_code:
        snapshot = {
            "period_code": snapshot_code,
            "label": period_service.label(snapshot_code),
            "coverage_level": period_service.coverage_level(snapshot_code),
            "note": _SNAPSHOT_NOTE,
        }
    return {
        "scope": scope,
        "snapshot": snapshot,
        # The published axis is returned in both scopes: it is how a client shows
        # that more than one release exists and lets a reader switch to one.
        "period_timeline": _period_timeline(),
    }


def available_periods() -> list[str]:
    """The published period dimension, from the data (never a fixed list)."""
    try:
        codes = period_service.period_codes()
        if codes:
            return codes
    except Exception:
        pass
    levels = meta_service.coverage()["coverage"]
    periods = {period for dataset in levels.values() for period in dataset if len(period) == 5}
    return sorted(periods)


def _coverage_level(f: AnalyticsFilters, coverage: dict[str, str]) -> str | None:
    selected = [
        level for period, level in coverage.items()
        if (f.year is None or period.startswith(str(f.year)))
        and (f.season is None or period.endswith(f.season.upper()))
    ]
    if not selected:
        return None
    return "district" if "district" in selected else "national"


def _national_overview(
    f: AnalyticsFilters,
    coverage: dict[str, str],
    level: str | None,
    *,
    scope: str = SCOPE_PERIOD,
    snapshot_code: str | None = None,
) -> dict:
    period = _period_key(f)
    trend_points = [
        point for point in trend_service.crop_trends(f.crop)["points"]
        if (f.year is None or point["year"] == f.year)
        and (f.season is None or point["season"] == f.season.upper())
    ]
    input_points = [
        point for point in trend_service.input_adoption()["points"]
        if (f.year is None or point["year"] == f.year)
        and (f.season is None or point["season"] == f.season.upper())
    ]
    production = sum(p["values"]["production_mt"] or 0 for p in trend_points)
    area = sum(p["values"]["harvested_area_ha"] or 0 for p in trend_points)
    yield_value = production / area if area > 0 else None
    seed = input_points[0]["values"].get("improved_seed_pct") if len(input_points) == 1 else None
    source = "NISR_SAS_2024_2026_NATIONAL_TRENDS"
    kpis = [
        {"id": "national_production", "label": "National production", "value": round(production, 1) if trend_points else None,
         "unit": "metric tonnes", "period": period, "period_code": f.period_code,
         "source_id": source},
        {"id": "national_area", "label": "National harvested area", "value": round(area, 1) if trend_points else None,
         "unit": "ha", "period": period, "period_code": f.period_code,
         "source_id": source},
        # Production-weighted across reported crops. Kept as context, never as a
        # headline "yield" figure - raw crop yields are not comparable.
        {"id": "national_yield", "label": "National yield (production / area)",
         "value": round(yield_value, 3) if yield_value is not None else None,
         "unit": "t/ha", "period": period, "period_code": f.period_code,
         "source_id": source, "scope": "context",
         "note": "production-weighted across reported crops; not a comparable crop yield"},
        {"id": "national_seed", "label": "Improved seed use", "value": seed,
         "unit": "% of farmers", "period": period, "period_code": f.period_code,
         "source_id": "NISR_SAS_2024_2026_NATIONAL_INPUT_TRENDS", "scope": "context"},
    ]
    primary = [k for k in kpis if k["id"] in {"national_production", "national_area"}]
    return {
        "filters": {"period_code": f.period_code, "year": f.year, "season": f.season,
                    "crop": f.crop, "province": f.province, "district": f.district,
                    "benchmark_strategy": f.benchmark_strategy},
        "period": period,
        "period_code": f.period_code,
        "available_periods": available_periods(),
        "coverage": coverage,
        "coverage_level": level,
        "n_observations": 0,
        "kpis": kpis,
        "primary_kpis": primary,
        "secondary_kpis": [k for k in kpis if k not in primary],
        "effective_filters": {
            "period_code": f.period_code, "crop": f.crop,
            "province": f.province, "district": f.district,
            "benchmark_strategy": f.benchmark_strategy,
        },
        **_scope_payload(scope, snapshot_code),
        "provenance": {
            "source_id": source, "source_period": f.period_code or period,
            "method": "published national series; all-crop yield = total production / total harvested area",
            "limitations": ["national context only; no district estimates for this period"],
        },
    }


def overview(f: AnalyticsFilters) -> dict:
    all_coverage = meta_service.coverage()["coverage"]
    coverage = all_coverage.get("district_crop_productivity", {})
    panel_coverage = all_coverage.get("crop_productivity", {})

    scope = scope_of(f)

    # History scope means "all published periods": no release is selected, so the
    # district snapshot is pinned to the latest published district release and
    # named in the response. Shipping the legacy training table as an unlabelled
    # default is what made a single-release dashboard read as "all periods".
    snapshot_code: str | None = None
    if scope == SCOPE_HISTORY:
        try:
            snapshot_code = period_service.latest_district() or period_service.latest()
        except Exception:
            snapshot_code = None

    # The filters the district panels are computed from. In history scope this
    # pins the snapshot release and drops any derived year/season pair; in period
    # scope it is simply the request.
    frame_filters = (
        replace(f, period_code=snapshot_code, year=None, season=None)
        if scope == SCOPE_HISTORY and snapshot_code
        else f
    )

    selected = frame_filters.period_code or _period_key(f)
    if selected:
        # A period is district-level when either the multi-period panel or the
        # legacy pack genuinely carries district rows for it.
        if panel_coverage.get(selected) == "district":
            level = "district"
        elif coverage.get(selected) == "district":
            level = "district"
        elif any(selected in periods for periods in all_coverage.values()):
            level = "national"
        else:
            level = None
    else:
        level = _coverage_level(f, coverage)
    if level != "district":
        # A national overview has no district snapshot to name.
        return _national_overview(f, coverage, level, scope=scope)

    df = apply_filters(productivity_frame(frame_filters), frame_filters)
    g = gapped(df, f.benchmark_strategy)
    valid = g[g["yield_kg_ha"].fillna(0) > 0]
    period = period_of(g if not g.empty else df)

    factor_cols = [c for c in FACTOR_COLUMNS if c in valid.columns]
    adoption = float(valid[factor_cols].mean(axis=1).mean()) if factor_cols and not valid.empty else None

    gap_series = valid["gap_index"].dropna() if "gap_index" in valid else pd.Series(dtype=float)
    # A median benchmark makes median(gap_index) identically zero, so the
    # headline gap figure is the typical shortfall among districts that are
    # actually below benchmark (see analytics_service.gap_summary).
    gap_stats = gap_summary(gap_series)
    high_gap = int((gap_series >= HIGH_GAP_PCT).sum()) if not gap_series.empty else 0

    try:
        post = repo.postharvest_use()
        median_loss = float(post["post_harvest_losses_pct"].median())
    except Exception:
        median_loss = None

    try:
        cold = repo.cold_chain_context()
        storage_districts = int(cold["district"].nunique())
    except Exception:
        storage_districts = 0

    # Report the rows actually used: the panel carries its own per-period source
    # ids, so provenance cannot silently claim the legacy 2025B extract.
    productivity_source = frame_source_id(valid if not valid.empty else df)
    productivity_period = period
    # Canonical YYYYS code for the rows actually used ("2026B"), falling back to
    # the requested code so the response always names one period.
    productivity_code = frame_period_code(valid if not valid.empty else df) or f.period_code

    selection = {
        "period": productivity_period,
        "period_code": productivity_code,
        "source_id": productivity_source,
        "scope": "selection",
    }

    kpis: list[dict] = []
    # A raw yield may only be shown for one named crop: averaging across
    # biologically different crops is meaningless, so with no crop selected no
    # yield KPI exists at all. The headline strip then reports totals instead.
    if f.crop:
        kpis.append(
            {"id": "avg_yield", "label": f"Mean {f.crop} yield",
             "value": None if valid.empty else round(float(valid["yield_kg_ha"].mean()), 1),
             "unit": "kg/ha", "note": f"{f.crop} only", **selection}
        )
    kpis.extend(
        [
            {"id": "total_production", "label": "Total production in selection",
             "value": None if valid.empty else round(float(valid["production_mt"].sum()), 1),
             "unit": "metric tonnes", **selection},
            {"id": "total_harvested_area", "label": "Total harvested area",
             "value": None if valid.empty
             else round(float(valid["harvested_area_ha"].sum()), 1),
             "unit": "ha", **selection},
            {"id": "gap_shortfall", "label": "Typical yield gap",
             "value": None
             if gap_stats["typical_shortfall"] is None
             else round(gap_stats["typical_shortfall"], 1),
             "unit": "%",
             "note": (
                 f"median shortfall across the {gap_stats['districts_below']} "
                 "district-crops below benchmark"
                 if gap_stats["districts_below"]
                 else "nothing is below the benchmark for this selection"
             ),
             **selection},
            {"id": "below_benchmark_share", "label": "Below benchmark",
             "value": gap_stats["below_share_pct"], "unit": "%",
             "note": f"{gap_stats['districts_below']} of {gap_stats['total']} district-crops",
             **selection},
            {"id": "median_gap", "label": "Median productivity gap",
             "value": None if gap_stats["median_gap"] is None else round(gap_stats["median_gap"], 1),
             "unit": "%",
             "note": (
                 "0 by construction: the benchmark is itself a distribution median"
                 if gap_stats["median_is_degenerate"]
                 else f"{f.benchmark_strategy} benchmark"
             ),
             **selection},
            {"id": "high_gap", "label": "High productivity-gap observations",
             "value": high_gap, "unit": "district-crops",
             "note": f"gap index >= {HIGH_GAP_PCT:.0f}% below benchmark", **selection},
            {"id": "crops", "label": "Crops analysed",
             "value": int(valid["canonical_crop_name"].nunique()) if not valid.empty else 0,
             "unit": "crops", **selection},
            {"id": "districts", "label": "Districts covered",
             "value": int(valid["district"].nunique()) if not valid.empty else 0,
             "unit": "districts", **selection},
        ]
    )
    # Context figures come from other releases. They carry their own period and
    # scope="context" so no client can present them as part of this selection's
    # headline strip.
    kpis.extend(
        [
            {"id": "input_adoption", "label": "Average input adoption",
             "value": None if adoption is None else round(adoption, 1),
             "unit": "% of farmers", "period": "2025 Season B", "period_code": "2025B",
             "scope": "context", "source_id": "NISR_SAS_2025B_DISTRICT_FACTORS",
             "note": "district practice adoption is a 2025 Season B release"},
            {"id": "postharvest_loss", "label": "Median post-harvest loss share",
             "value": None if median_loss is None else round(median_loss, 2),
             "unit": "% of production", "period": "2025 Season B", "period_code": "2025B",
             "scope": "context", "source_id": "NISR_SAS_2025B_POSTHARVEST_USE",
             "note": "national crop-level values, 2025 Season B"},
            {"id": "storage_districts", "label": "Cold-chain program districts",
             "value": storage_districts, "unit": "districts", "period": "2026",
             "period_code": None, "scope": "context",
             "source_id": "MINAGRI_ACES_COLDCHAIN_2026",
             "note": "programme context for 2026; capacity not verified"},
        ]
    )

    primary_ids = (
        ["avg_yield", "total_production", "total_harvested_area", "gap_shortfall"]
        if f.crop
        else ["total_production", "total_harvested_area", "crops", "districts"]
    )
    primary, secondary = split_kpis(kpis, primary_ids)

    return {
        "filters": {
            "period_code": f.period_code,
            "year": f.year, "season": f.season, "crop": f.crop,
            "province": f.province, "district": f.district,
            "benchmark_strategy": f.benchmark_strategy,
        },
        "period": period,
        "period_code": productivity_code,
        "available_periods": available_periods(),
        "coverage": coverage,
        "coverage_level": level,
        "n_observations": int(len(valid)),
        "kpis": kpis,
        "primary_kpis": primary,
        "secondary_kpis": secondary,
        "effective_filters": {
            "period_code": frame_filters.period_code, "crop": frame_filters.crop,
            "province": frame_filters.province, "district": frame_filters.district,
            "benchmark_strategy": frame_filters.benchmark_strategy,
        },
        **_scope_payload(scope, snapshot_code if scope == SCOPE_HISTORY else None),
        "provenance": {
            "source_id": productivity_source,
            "source_period": f.period_code or frame_period_code(df) or period,
            "benchmark_strategy": f.benchmark_strategy,
            "method": "aggregation of processed district x crop table; PGI = 100*(benchmark-observed)/benchmark",
            "limitations": [
                "observational district aggregates, not plot-level evidence",
                "associations are not causation",
                # Derived from the period catalogue so the scope text cannot
                # describe a different calendar than the data it annotates.
                f"district productivity covers {period_service.district_range()}; "
                "district input/practice, irrigation and erosion tables cover "
                f"{period_service.single_release_scope()} only",
            ],
        },
    }
