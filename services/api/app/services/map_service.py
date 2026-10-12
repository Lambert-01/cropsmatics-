"""District-level map metric service (period-aware).

Aggregates the filtered analytical frame to one value per district for the
selected choropleth metric, and returns the extra fields the map tooltip needs
(yield, benchmark, gap, input adoption, priority band, period). A district with
no valid observation is returned with ``value = None`` so the map can render it
as "no verified data" instead of a fabricated zero.

Period policy
-------------
The frame is resolved through ``analytics_service.productivity_frame``, so the
eight published periods (2024A-2026B) are answered from the canonical
``crop_productivity`` panel and 2025 Season B keeps reading the legacy joined
training table. Three rules follow from that:

1. ``yield`` is a raw crop yield. Averaging raw yields across biologically
   different crops is meaningless, so a crop selection is mandatory and no
   "all crops yield" choropleth is ever produced.
2. ``gap`` is a relative gap measured against each crop's own benchmark, so a
   district-median gap is valid without a crop. Its tooltip then reports *no*
   raw yield, so a cross-crop yield can never leak through the detail fields.
3. ``input_adoption``, ``irrigation`` and ``erosion`` exist only in
   single-release district tables (2025 Season B). A map is read as "this is the
   pattern for the selected period", so for any other period these layers are
   empty and the note names the release that does carry them. Reusing old-period
   colours silently is exactly the failure this avoids.

Why the priority score does not borrow the 2025 Season B survey
---------------------------------------------------------------
It previously did: readiness and cost were joined from the 2025 Season B district
practice/land survey onto any period's gap, and the blend was reported through
``reference_period``. That made the map and the ranking disagree - the ranking
excludes a component it cannot measure for the selected period, the map silently
scored one - and it put two releases inside one number. The single platform policy
is now: a component with no measured value for the selected period is excluded and
its weight is redistributed over the components that do have data
(``analytics_service.component_availability``). The map therefore reports
``components_unavailable`` instead of a blend, and ``available_period`` names the
release that does carry the missing component.
"""

from __future__ import annotations

from dataclasses import replace as dc_replace

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import period_service
from app.services.analytics_service import (
    FACTOR_COLUMNS,
    UNAVAILABLE,
    component_availability,
    frame_period_code,
    frame_source_id,
    gapped,
    period_of,
    priority_frame,
    productivity_frame,
    resolved_period,
)

METRICS = {
    "production": ("Production", "metric tonnes"),
    "harvested_area": ("Harvested area", "ha"),
    "yield": ("Yield", "kg/ha"),
    "gap": ("Productivity gap", "%"),
    "priority": ("Intervention priority", "score (0-1)"),
    "input_adoption": ("Input adoption", "% of farmers"),
    "irrigation": ("Irrigation adoption", "% of farmers"),
    "erosion": ("Erosion protection", "% of farmers"),
}

#: The metric a map opens on: additive quantities that are valid for *any* crop
#: selection (or none), so the default choropleth never needs a crop to render.
#: ``yield`` is a raw crop yield and is never aggregated across crops, so it stays
#: crop-gated; ``gap`` is relative to each crop's own benchmark and remains valid
#: district-wide (see the module docstring).
DEFAULT_METRIC = "production"

# Metrics whose value is a raw crop yield: a crop selection is mandatory.
CROP_REQUIRED_METRICS = frozenset({"yield"})

CROP_REQUIRED_MESSAGE = (
    "Select a crop to compare yield across districts. Raw yields from different "
    "crops share no natural scale, so district yield is never aggregated across "
    "crops."
)

# Metrics whose values live only in a single-release district table. The value is
# the logical dataset key used by ``data_coverage.csv``.
SINGLE_RELEASE_METRICS: dict[str, str] = {
    "input_adoption": "district_factors",
    "irrigation": "irrigation_water",
    "erosion": "erosion_control",
}

# Source ids for the single-release layers, so provenance never cites the
# productivity panel for an adoption map.
SOURCE_BY_METRIC: dict[str, str] = {
    "input_adoption": "NISR_SAS_2025B_DISTRICT_FACTORS",
    "irrigation": "NISR_SAS_2025B_IRRIGATION_WATER",
    "erosion": "NISR_SAS_2025B_EROSION",
}

# Priority-score components that only the single-release factor table carries.
# They are never joined onto another period's frame: the ranking excludes them and
# redistributes their weight instead (analytics_service.adjusted_weights), so the
# component names below are documentation of what a 2025B-only run adds - not a
# join key.
REFERENCE_COMPONENT_COLUMNS: tuple[str, ...] = (
    "erosion_protection_farmers_pct",
    "agricultural_land_000ha",
)


# --- period helpers ---------------------------------------------------------


def _factors() -> pd.DataFrame | None:
    try:
        return repo.factors_dataset()
    except Exception:
        return None


def reference_period() -> str | None:
    """The period of the single-release district factor survey (``2025B``)."""
    df = _factors()
    if df is None or df.empty or not {"year", "season"}.issubset(df.columns):
        return None
    try:
        return period_service.format_code(int(df["year"].iloc[0]), str(df["season"].iloc[0]))
    except (period_service.UnknownPeriodError, TypeError, ValueError):
        return None


def _covers_period(dataset: str, code: str | None) -> bool:
    """True when ``dataset`` genuinely carries ``code`` (or none is selected)."""
    if not code:
        return True
    return any(entry["dataset"] == dataset for entry in period_service.datasets_for(code))


def _single_release_message(metric: str, f: AnalyticsFilters, available: str | None) -> str:
    label = METRICS[metric][0].lower()
    selected = period_service.label(f.period_code) if f.period_code else "this period"
    latest = period_service.label(available) if available else "an earlier release"
    return (
        f"No verified district {label} data are available for {selected}. "
        f"Latest district release: {latest}."
    )


def effective_period_filters(f: AnalyticsFilters, metric: str) -> AnalyticsFilters:
    """Pin a map request to the release the requested layer actually reads.

    Only used when no release was selected. A period-aware layer then reads the
    latest published district release; a single-release layer reads the release
    that carries it. Both are named in the response, so the map can state the one
    period it depicts.

    Leaving this to "whichever table is the default" is how a 2025B adoption
    layer ended up on a page whose KPIs described 2026B - and how, once the
    default moved to the latest release, a 2025B-only layer would instead have
    rendered thirty empty districts under a 2026B label.

    An explicitly selected release is never overridden here: a layer that does
    not cover it returns its explanation plus ``available_period`` instead of
    silently substituting another release.
    """
    if f.period_key() or f.year:
        return f
    if metric in SINGLE_RELEASE_METRICS:
        target = reference_period()
    else:
        target = resolved_period(f)
    if not target:
        return f
    return dc_replace(f, period_code=target, year=None, season=None)


def priority_component_availability(frame: pd.DataFrame) -> tuple[list[str], list[dict]]:
    """Availability of the priority components for the frame about to be scored.

    Returns ``(unavailable, availability)``. The unavailable names are the ones
    whose weight ``priority_frame`` redistributes, and the caller reports both so
    the map never shows a score whose inputs are unexplained.
    """
    availability = component_availability(frame)
    unavailable = [c["component"] for c in availability if c["status"] == UNAVAILABLE]
    return unavailable, availability


# --- metric assembly --------------------------------------------------------


def _empty(
    metric: str,
    f: AnalyticsFilters,
    message: str | None = None,
    *,
    available_period: str | None = None,
    components_unavailable: list[str] | None = None,
) -> dict:
    label, unit = METRICS.get(metric, (metric, None))
    return {
        "metric": metric,
        "metric_label": label,
        "unit": unit,
        "period": period_service.label(f.period_code) if f.period_code else None,
        "period_code": f.period_code,
        "crop": f.crop,
        "min_value": None,
        "max_value": None,
        "districts": [],
        "requires_crop": metric in CROP_REQUIRED_METRICS,
        "message": message,
        "available_period": available_period,
        "reference_period": None,
        "components_unavailable": components_unavailable or [],
        "source_id": SOURCE_BY_METRIC.get(metric),
    }


def district_metrics(
    f: AnalyticsFilters, metric: str = DEFAULT_METRIC, weights: dict | None = None
) -> dict:
    if metric not in METRICS:
        raise ValueError(f"unknown metric {metric!r}; expected one of {list(METRICS)}")

    if metric in CROP_REQUIRED_METRICS and not f.crop:
        return _empty(metric, f, CROP_REQUIRED_MESSAGE)

    reference = reference_period()

    # Single-release layers are never coloured for a period they do not cover.
    dataset = SINGLE_RELEASE_METRICS.get(metric)
    if dataset and not _covers_period(dataset, f.period_code):
        return _empty(
            metric,
            f,
            _single_release_message(metric, f, reference),
            available_period=reference,
        )

    # Each layer is read from the release that actually carries it, so the map
    # never colours one period's districts under another period's label.
    effective = effective_period_filters(f, metric)
    frame = apply_filters(productivity_frame(effective), effective)

    unavailable: list[str] = []
    availability: list[dict] = []
    if metric == "priority":
        # Components this period cannot measure are excluded, not borrowed from
        # another release; the response says which ones and where they do exist.
        unavailable, availability = priority_component_availability(frame)

    g = gapped(frame, effective.benchmark_strategy)
    if g.empty:
        return _empty(
            metric,
            effective,
            "No verified district observations for this selection.",
            available_period=reference if dataset else None,
            components_unavailable=unavailable,
        )

    # Priority score needs the full component frame (normalized across districts).
    prio = priority_frame(frame, effective.benchmark_strategy, weights=weights)
    prio_by_district = (
        prio.groupby("district")["priority_score"].mean().to_dict() if not prio.empty else {}
    )
    band_by_district = (
        prio.groupby("district")["priority_band"].agg(
            lambda s: s.mode().iloc[0] if not s.mode().empty else None
        ).to_dict()
        if not prio.empty else {}
    )

    factors = [c for c in FACTOR_COLUMNS if c in g.columns]
    if factors:
        g["_input_adoption"] = g[factors].mean(axis=1)

    period_code = frame_period_code(g) or effective.period_code
    period = period_service.label(period_code) if period_code else period_of(g)

    # A raw yield may only be reported for one named crop. Without a crop the
    # tooltip must not fall back to a cross-crop median yield.
    raw_yield_ok = bool(f.crop)

    rows = []
    for district, grp in g.groupby("district", dropna=False):
        yield_med = (
            float(grp["yield_kg_ha"].median())
            if raw_yield_ok and grp["yield_kg_ha"].notna().any()
            else None
        )
        bench_med = (
            float(grp["benchmark_yield_kg_ha"].median())
            if raw_yield_ok and grp["benchmark_yield_kg_ha"].notna().any()
            else None
        )
        gap_med = float(grp["gap_index"].median()) if grp["gap_index"].notna().any() else None
        adoption = (
            float(grp["_input_adoption"].mean())
            if "_input_adoption" in grp and grp["_input_adoption"].notna().any()
            else None
        )
        irrigation = _first(grp, "irrigation_farmers_pct")
        erosion = _first(grp, "erosion_protection_farmers_pct")
        priority = prio_by_district.get(district)

        # Additive quantities, valid summed across crops for a district. A null
        # stays null (a district that published nothing is not a zero).
        production = (
            float(grp["production_mt"].sum())
            if "production_mt" in grp and grp["production_mt"].notna().any()
            else None
        )
        harvested_area = (
            float(grp["harvested_area_ha"].sum())
            if "harvested_area_ha" in grp and grp["harvested_area_ha"].notna().any()
            else None
        )

        value = {
            "production": production,
            "harvested_area": harvested_area,
            "yield": yield_med,
            "gap": gap_med,
            "priority": priority,
            "input_adoption": adoption,
            "irrigation": irrigation,
            "erosion": erosion,
        }[metric]

        rows.append({
            "district": str(district),
            "district_code": _first(grp, "district_code"),
            "province": _first(grp, "province"),
            "agro_ecological_zone": _first(grp, "agro_ecological_zone"),
            "value": None if value is None or (isinstance(value, float) and np.isnan(value)) else round(float(value), 3),
            "n_observations": int(grp["yield_kg_ha"].notna().sum()),
            "details": {
                "yield_kg_ha": _round(yield_med),
                "benchmark_yield_kg_ha": _round(bench_med),
                "gap_index": _round(gap_med),
                "production_mt": _round(production),
                "harvested_area_ha": _round(harvested_area),
                "input_adoption_pct": _round(adoption),
                "priority_band": band_by_district.get(district),
                "priority_score": _round(priority),
                "period": period,
                "period_code": period_code,
                "reference_period": None,
            },
        })

    values = [r["value"] for r in rows if r["value"] is not None]
    label, unit = METRICS[metric]

    source_id = SOURCE_BY_METRIC.get(metric) or frame_source_id(g)

    return {
        "metric": metric,
        "metric_label": label,
        "unit": unit,
        "period": period,
        "period_code": period_code,
        "crop": f.crop,
        "min_value": min(values) if values else None,
        "max_value": max(values) if values else None,
        "districts": rows,
        "requires_crop": metric in CROP_REQUIRED_METRICS,
        "message": None,
        # For the priority metric this names the release that carries the excluded
        # components, so the UI can point at 2025 Season B instead of blending it.
        "available_period": (reference if dataset or unavailable else None),
        "reference_period": None,
        "components_unavailable": unavailable,
        "component_availability": availability,
        "source_id": source_id,
    }


def _first(grp: pd.DataFrame, column: str):
    if column not in grp.columns:
        return None
    series = grp[column].dropna()
    if series.empty:
        return None
    val = series.iloc[0]
    return str(val) if isinstance(val, str) else (None if pd.isna(val) else val)


def _round(value: float | None) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(f) else round(f, 3)
