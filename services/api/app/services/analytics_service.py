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

# Columns that only the 2025B joined training table carries. When a frame comes
# from the canonical panel (any other period) these columns are absent, so the
# components that depend on them are explicitly unavailable rather than filled
# with a neutral constant that would look like measured data.
_READINESS_COL = "erosion_protection_farmers_pct"
_COST_COL = "agricultural_land_000ha"

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

# --- component availability policy (v2) -------------------------------------
#
# The priority score is a weighted sum over five components. Three of them come
# from the productivity rows of the *selected period*; two - readiness
# (erosion-protection adoption) and cost constraint (agricultural-land share) -
# exist only in the 2025 Season B district practice/land survey.
#
# Policy: a component that has no measured value for the selected period is
# **excluded**, and its weight is redistributed proportionally over the
# components that do have data. It is never filled with a neutral constant and
# never borrowed from another release inside the same score, because both would
# put a number on screen that the selected period did not produce. Every surface
# therefore reports, per component, whether it is measured, a documented proxy,
# unavailable or undetermined - and an unavailable component is reported as
# ``null``, never as ``0`` or ``0.5``.
#
# See docs/11_INTERVENTION_ENGINE.md for the worked example and the alternative
# (join the 2025B survey in as a labelled reference period) that was rejected.
COMPONENT_ORDER: tuple[str, ...] = (
    "gap_index",
    "vulnerability",
    "affected_scale",
    "readiness",
    "cost_constraint",
)

COMPONENT_LABELS: dict[str, str] = {
    "gap_index": "Productivity gap",
    "vulnerability": "Vulnerability / exposure",
    "affected_scale": "Affected scale",
    "readiness": "Readiness",
    "cost_constraint": "Cost constraint",
}

#: Component status vocabulary, used verbatim in API responses and the UI.
MEASURED = "measured"
PROXY = "proxy"
UNAVAILABLE = "unavailable"
UNDETERMINED = "undetermined"

#: The release that carries the two single-release components.
REFERENCE_FACTOR_PERIOD = "2025B"

_GAP_NOTE = (
    "gap is computed from this period's published district yield against the "
    "selected benchmark strategy"
)
_VULNERABILITY_NOTE = (
    "vulnerability uses crop perishability as a proxy (no verified post-harvest "
    "loss join per district yet)"
)
_AFFECTED_SCALE_NOTE = (
    "affected scale uses harvested area as a proxy for the number of farmers exposed"
)

_READINESS_MEASURED_NOTE = (
    "readiness uses measured erosion-protection adoption "
    f"({REFERENCE_FACTOR_PERIOD}) as a proxy for existing practice uptake"
)
_COST_MEASURED_NOTE = (
    "cost constraint uses measured agricultural-land share "
    f"({REFERENCE_FACTOR_PERIOD}) as an inverse cost proxy"
)
_READINESS_UNAVAILABLE_NOTE = (
    "readiness is unavailable for this period: district erosion-protection data are "
    f"{REFERENCE_FACTOR_PERIOD} only, so the readiness weight is redistributed over "
    "the components that do have data instead of being filled with a constant"
)
_COST_UNAVAILABLE_NOTE = (
    "cost constraint is unavailable for this period: district agricultural-land data "
    f"are {REFERENCE_FACTOR_PERIOD} only, so the cost weight is redistributed over "
    "the components that do have data instead of being filled with a constant"
)
_UNDETERMINED_NOTE = (
    "no rows for this selection, so whether this component carries measured data "
    "cannot be determined"
)

# Legacy constant kept for callers that import it directly (the 2025B release,
# where both single-release components are measured).
PROXY_NOTES = [
    _VULNERABILITY_NOTE,
    _AFFECTED_SCALE_NOTE,
    _READINESS_MEASURED_NOTE,
    _COST_MEASURED_NOTE,
]


def has_readiness(df: pd.DataFrame) -> bool:
    """True when the frame carries measured erosion-protection adoption values."""
    return _READINESS_COL in df.columns and df[_READINESS_COL].notna().any()


def has_cost(df: pd.DataFrame) -> bool:
    """True when the frame carries measured agricultural-land area values."""
    return _COST_COL in df.columns and df[_COST_COL].notna().any()


def _single_release_status(df: pd.DataFrame, present: bool) -> str:
    """Status of a 2025B-only component, given whether its column is populated."""
    if present:
        return MEASURED
    return UNDETERMINED if df.empty else UNAVAILABLE


def component_availability(df: pd.DataFrame | None = None) -> list[dict]:
    """Per-component status for a frame, in the engine's component order.

    One entry per component: ``{component, label, status, source_period, note}``
    where ``status`` is one of ``measured`` / ``proxy`` / ``unavailable`` /
    ``undetermined``. This is the single source of truth for the "what is this
    number made of" question, so no surface has to infer availability from the
    presence of a column - or, worse, from a component value that happened to be
    filled with a constant.
    """
    frame = df if df is not None else pd.DataFrame()
    readiness = _single_release_status(frame, has_readiness(frame))
    cost = _single_release_status(frame, has_cost(frame))
    readiness_note = {
        MEASURED: _READINESS_MEASURED_NOTE,
        UNAVAILABLE: _READINESS_UNAVAILABLE_NOTE,
        UNDETERMINED: _UNDETERMINED_NOTE,
    }[readiness]
    cost_note = {
        MEASURED: _COST_MEASURED_NOTE,
        UNAVAILABLE: _COST_UNAVAILABLE_NOTE,
        UNDETERMINED: _UNDETERMINED_NOTE,
    }[cost]
    empty_status = UNDETERMINED if frame.empty else None

    return [
        {
            "component": "gap_index",
            "label": COMPONENT_LABELS["gap_index"],
            "status": empty_status or MEASURED,
            "source_period": None,
            "note": _UNDETERMINED_NOTE if frame.empty else _GAP_NOTE,
        },
        {
            "component": "vulnerability",
            "label": COMPONENT_LABELS["vulnerability"],
            "status": empty_status or PROXY,
            "source_period": None,
            "note": _UNDETERMINED_NOTE if frame.empty else _VULNERABILITY_NOTE,
        },
        {
            "component": "affected_scale",
            "label": COMPONENT_LABELS["affected_scale"],
            "status": empty_status or PROXY,
            "source_period": None,
            "note": _UNDETERMINED_NOTE if frame.empty else _AFFECTED_SCALE_NOTE,
        },
        {
            "component": "readiness",
            "label": COMPONENT_LABELS["readiness"],
            "status": readiness,
            "source_period": REFERENCE_FACTOR_PERIOD if readiness == MEASURED else None,
            "note": readiness_note,
        },
        {
            "component": "cost_constraint",
            "label": COMPONENT_LABELS["cost_constraint"],
            "status": cost,
            "source_period": REFERENCE_FACTOR_PERIOD if cost == MEASURED else None,
            "note": cost_note,
        },
    ]


def components_unavailable(df: pd.DataFrame) -> list[str]:
    """Names of priority components that have no measured data in this frame."""
    return [c["component"] for c in component_availability(df) if c["status"] == UNAVAILABLE]


def proxy_notes_for(df: pd.DataFrame) -> list[str]:
    """Period-aware proxy notes: only mention components that are actually present."""
    return [_VULNERABILITY_NOTE, _AFFECTED_SCALE_NOTE] + [
        entry["note"]
        for entry in component_availability(df)
        if entry["component"] in ("readiness", "cost_constraint")
    ]


def adjusted_weights(
    weights: dict | None, unavailable: list[str] | tuple[str, ...],
    *, purpose: str = ip.DEFAULT_PURPOSE,
) -> dict:
    """Redistribute excluded component weights proportionally to the rest.

    Delegates to the engine so there is exactly one redistribution rule. When a
    component has no measured data - or carries no discriminating information for
    the population - its weight is not silently applied to a neutral constant.
    Instead it is distributed proportionally across the components that do have
    data, so the score remains a weighted sum of verified inputs and the total
    still sums to 1.

    The component -> engine-key mapping lives in
    ``app.analytics.intervention_priority``.
    """
    return ip.effective_weights(weights, tuple(unavailable), purpose=purpose)


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


def resolved_source_id(result: dict, f: AnalyticsFilters) -> str | None:
    """The source id for a result, never a fabricated identifier.

    A result whose frame names no source falls back to the legacy 2025 Season B
    identifier (``LEGACY_SOURCE_ID``). When the caller selected a different
    release that is a false attribution, so the release's own registered
    canonical source is used instead. When neither exists the field stays null
    rather than inventing ``NISR_SAS_<period>``, which is not registered.
    """
    source = result.get("source_id")
    if (
        f.period_code
        and source in (None, LEGACY_SOURCE_ID)
        and f.period_code not in legacy_periods()
    ):
        return period_service.source_id(f.period_code) or source
    return source or None


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


def resolved_period(f: AnalyticsFilters | None) -> str | None:
    """The release a period-dependent district query actually reads.

    An explicit selection wins. With nothing selected the answer is the **latest
    published district release**, and callers report it - never a silent default
    table. Reading the legacy 2025B pack whenever no period was named is what let
    every page label one release's figures as "all published periods", and let a
    district map colour 2025B while the KPIs beside it described 2026B.
    """
    explicit = f.period_key() if f is not None else None
    if explicit:
        return explicit
    try:
        return period_service.latest_district() or period_service.latest()
    except Exception:
        return None


def productivity_frame(f: AnalyticsFilters | None = None) -> pd.DataFrame:
    """The productivity rows a filter should read.

    The canonical multi-period panel answers every published period that carries
    district rows. The release the joined training table actually *is* (2025B)
    still reads that table, because it uniquely carries the factor columns - so
    the factor analytics keep measured columns instead of silently becoming
    redistributed weights.

    With no period selected the frame is the latest published district release,
    resolved by :func:`resolved_period` rather than by whichever table happened
    to be the default.

    An **explicitly** requested period is never answered from a different
    release. Reading the 2025 Season B training table for a 2022A request is what
    let empty 2022/2023 results carry 2025B provenance and figures. When the
    serving layer cannot carry the requested period, this raises
    :class:`PeriodNotServable` instead of substituting another release.
    """
    if f is None:
        return repo.training_dataset()

    explicit = bool(f.period_key())
    key = resolved_period(f)
    if not key:
        return repo.training_dataset()

    # 2025 Season B is the release the joined training table *is* and the only
    # table carrying the district factor columns, so it is read there.
    if key in legacy_periods():
        return repo.training_dataset()

    # Fall through only for a period the canonical panel owns. Any failure here
    # (unreachable, out of sync) is propagated, never masked by the training
    # table.
    panel = repo.crop_productivity()
    if "period_code" not in panel.columns:
        # The canonical panel is the only layer that can answer a non-legacy
        # period. A panel without ``period_code`` is a contract failure, not a
        # reason to answer a 2022/2023 request from the 2025B training table: an
        # explicit historical request must fail honestly instead of silently
        # returning another release's figures.
        raise repo.CanonicalDataUnavailable(
            "the canonical productivity panel carries no 'period_code' column, so "
            f"{period_service.label(key)} cannot be answered; no other release is "
            "substituted"
        )
    frame = panel[panel["period_code"].astype(str) == key]
    if "geography_level" in frame.columns:
        frame = frame[frame["geography_level"] == "DISTRICT"]
    if frame.empty:
        raise repo.PeriodNotServable(
            key,
            expected_periods=list(panel["period_code"].astype(str).unique()),
            message=(
                f"{period_service.label(key)} has no district rows in the serving "
                f"dataset, so it cannot be answered{' (explicitly requested)' if explicit else ''}; "
                "no other release is substituted"
            ),
        )
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


def _candidate_id(row: pd.Series) -> str:
    """The stable district x crop identity the engine scores."""
    district = row.get("district_code") or row.get("district")
    return f"{district}::{row['canonical_crop_name']}"


def _component_columns(frame: pd.DataFrame) -> pd.DataFrame:
    """Attach the engine's raw component columns to a gapped frame.

    A component with no measured value for this release is carried as a
    placeholder and flagged through ``components_unavailable``; the caller zeroes
    its weight, so the placeholder can never change a score. It is never returned
    to a client as a component value.
    """
    g = frame.copy()
    perish = g.get("perishability", pd.Series(index=g.index, dtype=object))
    g["vulnerability"] = perish.map(_PERISHABILITY).fillna(0.5)
    g["affected_scale"] = g.get("harvested_area_ha", pd.Series(0.0, index=g.index)).fillna(0.0)

    # Readiness: measured values when present; 0.0 otherwise (excluded below).
    if has_readiness(g):
        g["readiness"] = g[_READINESS_COL].fillna(g[_READINESS_COL].median()) / 100.0
    else:
        g["readiness"] = 0.0

    # Cost constraint: measured values when present; 0.0 otherwise (excluded below).
    land = g.get(_COST_COL, pd.Series(dtype=float))
    if has_cost(g):
        g["cost_constraint"] = 1.0 - (land / land.max())
    else:
        g["cost_constraint"] = 0.0
    return g


def candidate_dicts(frame: pd.DataFrame) -> list[dict]:
    """The engine's candidate dicts, built from a component frame.

    One builder, so the ranking endpoint, the map, the scenario comparison and
    the sensitivity sweep score exactly the same inputs.
    """
    out: list[dict] = []
    for _, row in frame.iterrows():
        area = row.get("harvested_area_ha")
        out.append(
            {
                "id": _candidate_id(row),
                "district": row["district"],
                "crop": row["canonical_crop_name"],
                "harvested_area_ha": None if pd.isna(area) else float(area),
                "gap": None if pd.isna(row.get("gap_index")) else float(row["gap_index"]),
                "vulnerability": float(row["vulnerability"]),
                "affected_scale": float(row["affected_scale"]),
                "readiness": float(row["readiness"]),
                "cost_constraint": float(row["cost_constraint"]),
            }
        )
    return out


def priority_population(
    f: AnalyticsFilters | None = None,
    *,
    purpose: str = ip.DEFAULT_PURPOSE,
    threshold_pct: float = ip.DEFAULT_SHORTFALL_THRESHOLD_PCT,
) -> tuple[ip.Population, pd.DataFrame, list[dict]]:
    """The stated reference population for a selection, normalized once.

    The population is the **reference scope**: the same crop, period, benchmark
    and province, with every district in it. A district inspection narrows what
    is *displayed*; it never narrows the population, so selecting a district
    cannot redefine its own benchmark or move its score.
    """
    frame = candidate_frame(f)
    if frame.empty:
        return (
            ip.Population(purpose=purpose, threshold_pct=threshold_pct),
            frame,
            [],
        )
    candidates = candidate_dicts(frame)
    unavailable = tuple(components_unavailable(frame))
    population = ip.build_population(
        candidates,
        purpose=purpose,
        threshold_pct=threshold_pct,
        unavailable=unavailable,
        reference_note=reference_population_note(f, purpose=purpose),
    )
    return population, frame, candidates


def reference_population_note(f: AnalyticsFilters | None, *, purpose: str) -> str:
    """Name the comparison group the scores are relative to."""
    scope = " · ".join(
        part for part in (getattr(f, "crop", None), getattr(f, "period_code", None)) if part
    )
    where = scope or "all published crops and periods"
    base = (
        f"Scores are relative to every eligible district x crop candidate at {where}"
        if scope
        else "Scores are relative to every eligible district x crop candidate in the scope"
    )
    if getattr(f, "province", None):
        base += f" within {f.province}"
    if purpose == ip.PURPOSE_PRODUCTIVITY_SUPPORT:
        base += "; inspecting one district does not change that population or its score."
    else:
        base += "."
    return base


def priority_frame(
    df: pd.DataFrame,
    strategy: str = "national_crop_median",
    weights: dict | None = None,
    *,
    purpose: str = ip.DEFAULT_PURPOSE,
    threshold_pct: float = ip.DEFAULT_SHORTFALL_THRESHOLD_PCT,
) -> pd.DataFrame:
    """Attach priority components and an eligibility-aware score/band per row.

    Delegates to the shared engine population, so a map coloured by priority and
    the ranking endpoint agree about who is a priority. A candidate that is not
    eligible for the purpose has ``priority_score`` ``NaN`` and
    ``priority_eligible`` False - it is not given a low score that would render as
    a priority of some degree.
    """
    g = compute_gaps(valid_yield(df), strategy=strategy)
    if g.empty:
        return g
    g = _component_columns(g)

    candidates = candidate_dicts(g)
    population = ip.build_population(
        candidates,
        purpose=purpose,
        threshold_pct=threshold_pct,
        unavailable=tuple(components_unavailable(g)),
    )
    effective_weights = ip.effective_weights(weights, population.unavailable, purpose=purpose)
    by_id = {str(c["id"]): c for c in candidates}
    eligible_ids = set(population.eligible_ids)

    scores: list[float] = []
    bands: list[str | None] = []
    eligible_flags: list[bool] = []
    reasons: list[str | None] = []
    shortfalls: list[float | None] = []
    for _, row in g.iterrows():
        cid = _candidate_id(row)
        shortfalls.append(ip.shortfall_pct(None if pd.isna(row.get("gap_index")) else float(row["gap_index"])))
        if cid in eligible_ids:
            scored = ip.score_candidate(by_id[cid], population, weights=effective_weights)
            scores.append(scored.score)
            bands.append(scored.band)
            eligible_flags.append(True)
            reasons.append(None)
        else:
            scores.append(float("nan"))
            bands.append(None)
            eligible_flags.append(False)
            reasons.append(population.ineligible.get(cid, "ineligible for this purpose"))

    g["priority_score"] = scores
    g["priority_band"] = bands
    g["priority_eligible"] = eligible_flags
    g["priority_ineligible_reason"] = reasons
    g["shortfall_pct"] = shortfalls
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


def unavailable_productivity(f: AnalyticsFilters, exc: Exception) -> dict:
    """A structured "not available" result, never manufactured zeros.

    No KPI is returned at all: a ``0 districts`` / ``0 crops`` / ``0 high-gap``
    card would read as a measured zero when in fact nothing was served. The
    reason and the out-of-sync detail travel with the response instead.
    """
    return {
        "period": None,
        "period_code": f.period_code,
        "source_id": None,
        "kpis": [],
        "primary_kpis": [],
        "secondary_kpis": [],
        "yoy": None,
        "gap_bands": [],
        "gap_summary": gap_summary(pd.Series(dtype=float)),
        "rows": [],
        "n_observations": 0,
        "available": False,
        "unavailable_reason": str(exc),
        "availability": {
            "code": getattr(exc, "code", "DATASET_OUT_OF_SYNC"),
            "reason": getattr(exc, "reason", "period_not_servable"),
            "period_code": getattr(exc, "period_code", f.period_code),
            "expected_periods": getattr(exc, "expected_periods", None),
            "retryable": getattr(exc, "retryable", True),
        },
    }


def productivity(f: AnalyticsFilters) -> dict:
    """KPI + district ranking for the Productivity Intelligence page."""
    try:
        frame = productivity_frame(f)
    except repo.PeriodNotServable as exc:
        # An explicitly requested period the serving layer cannot carry is
        # reported as unavailable, never answered from another release.
        return unavailable_productivity(f, exc)

    df = apply_filters(frame, f)
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
            "available": True,
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
        "available": True,
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


# --- multi-period SAS indicator domains -------------------------------------
# Practice, irrigation, water-source, erosion and post-harvest observations were
# ingested with full lineage long before anything exposed them. These helpers are
# the exposure layer. They read the long processed tables, honour the shared
# period/district/crop filter, and report indicator availability from the
# *unfiltered* table so a screen can state what exists instead of guessing.
#
# The legacy wide tables (``irrigation_water.csv`` and friends) are left exactly
# as they are: they are the 2025 Season B single-release extract existing clients
# already read, and replacing them would change live answers.

PRACTICE_DOMAINS: tuple[str, ...] = (
    "practice",
    "irrigation",
    "water_source",
    "erosion_control",
    "erosion_severity",
)


def _availability(df: pd.DataFrame, group_keys: list[str]) -> list[dict]:
    """Per-indicator availability: unit, scopes, periods and observation count."""
    if df.empty:
        return []
    out: list[dict] = []
    for key, group in df.groupby(group_keys, dropna=False):
        key = key if isinstance(key, tuple) else (key,)
        record = dict(zip(group_keys, (None if pd.isna(k) else k for k in key), strict=False))
        record["unit"] = (
            group["unit"].dropna().iloc[0] if "unit" in group and group["unit"].notna().any() else None
        )
        record["periods"] = sorted(group["period_code"].dropna().astype(str).unique().tolist())
        if "geography_level" in group.columns:
            record["geography_levels"] = sorted(
                group["geography_level"].dropna().astype(str).unique().tolist()
            )
        record["n_observations"] = int(group["value"].notna().sum()) if "value" in group else 0
        record["n_null"] = int(group["value"].isna().sum()) if "value" in group else 0
        out.append(record)
    return out


def practice_indicator_history(f: AnalyticsFilters, domain: str | None = None) -> dict:
    """Multi-period district practice/irrigation/erosion observations (2024A-2026B).

    Honest by construction: the returned ``periods``, ``domains`` and
    ``indicators`` describe what the processed table actually carries, while
    ``observations`` is the filtered slice. A period or indicator with no rows is
    absent rather than reported as zero, and a published null stays null.
    """
    try:
        df = repo.agricultural_practice_observation()
    except Exception as exc:  # noqa: BLE001 - report unavailability, do not 500
        return {
            "available": False,
            "domains": [],
            "indicators": [],
            "periods": [],
            "observations": [],
            "period": f.period_code,
            "note": f"the multi-period practice dataset is not built: {exc}",
        }

    domains = sorted(df["domain"].dropna().astype(str).unique().tolist())
    if domain and domain not in domains:
        return {
            "available": False,
            "domains": domains,
            "indicators": [],
            "periods": [],
            "observations": [],
            "period": f.period_code,
            "note": (
                f"domain {domain!r} is not one of the published domains: "
                f"{', '.join(domains)}"
            ),
        }

    scoped = df[df["domain"].astype(str) == domain] if domain else df
    periods = sorted(scoped["period_code"].dropna().astype(str).unique().tolist())

    observations = apply_filters(scoped, f, crop_column="district")
    observations = observations[observations["value"].notna() | observations["value"].isna()]
    note = None
    if f.period_code and f.period_code not in periods:
        note = (
            f"the practice/irrigation/erosion domain is published for "
            f"{', '.join(periods)}; {f.period_code} therefore has no rows"
        )

    return {
        "available": True,
        "domain": domain,
        "domains": domains,
        "indicators": _availability(scoped, ["domain", "indicator_code"]),
        "periods": periods,
        "observations": records(observations.head(f.limit)),
        "n_observations": int(len(observations)),
        "period": f.period_code or (periods[-1] if periods else None),
        "note": note,
    }


def postharvest_history(f: AnalyticsFilters) -> dict:
    """Multi-period crop post-harvest use shares (2024A-2026B).

    Published shares of a crop's use are meant to total 100 per crop and period.
    Where they do not, the group is reported by ``shares_off_total`` - the
    published shares are never rescaled to force a total.
    """
    try:
        df = repo.postharvest_use_multi_period()
    except Exception as exc:  # noqa: BLE001
        return {
            "available": False,
            "crops": [],
            "indicators": [],
            "periods": [],
            "observations": [],
            "period": f.period_code,
            "note": f"the multi-period post-harvest dataset is not built: {exc}",
        }

    periods = sorted(df["period_code"].dropna().astype(str).unique().tolist())
    observations = apply_filters(df, f, crop_column="crop")

    flagged = 0
    if "shares_sum_ok" in df.columns:
        groups = df.groupby(["period_code", "crop"], dropna=False)["shares_sum_ok"].first()
        flagged = int((~groups.astype(bool)).sum())

    groups = (
        df.groupby(["period_code", "crop"], dropna=False)
        .agg(
            shares_sum_pct=("shares_sum_pct", "first") if "shares_sum_pct" in df else ("value", "sum"),
            shares_sum_ok=("shares_sum_ok", "first") if "shares_sum_ok" in df else ("value", "first"),
        )
        .reset_index()
    )

    return {
        "available": True,
        "crops": sorted(df["crop"].dropna().astype(str).unique().tolist()),
        "indicators": _availability(df, ["indicator_code"]),
        "periods": periods,
        "observations": records(observations.head(f.limit)),
        "n_observations": int(len(observations)),
        "share_totals": records(groups),
        "shares_off_total": flagged,
        "period": f.period_code or (periods[-1] if periods else None),
        "note": (
            "published shares of a crop's total use; they are meant to total 100 "
            "per crop and period, and any group outside the +/-1 point rounding "
            "tolerance is flagged, never rescaled"
        ),
    }


def normalise_weights(weights: dict | None) -> dict:
    """The fully-specified weighting actually used, defaults filled in."""
    return {**ip.DEFAULT_WEIGHTS, **(weights or {})}


def reference_filters(f: AnalyticsFilters | None) -> AnalyticsFilters | None:
    """The *reference* scope behind a selection.

    Drops the district inspection and keeps everything that defines a comparison
    group: crop, period, benchmark and province. This is what makes a score
    stable - inspecting Nyagatare must not re-normalize the components over the
    single candidate Nyagatare, which would replace every real component with a
    neutral constant and can turn a district above its benchmark into a HIGH
    priority.
    """
    if f is None:
        return None
    if not getattr(f, "district", None):
        return f
    return dc_replace(f, district=None)


def candidate_frame(f: AnalyticsFilters | None) -> pd.DataFrame:
    """Rows carrying the **raw** priority components, before any weighting.

    Kept as the single source for the candidate set, and computed over the
    *reference* scope (see :func:`reference_filters`), so the population a score
    is normalized against does not change when the display is narrowed to one
    district. Callers that need to display only the inspected district filter the
    already-scored rows instead.

    The sensitivity sweep needs the un-normalized components, because it
    re-normalizes and re-weights the same candidates many times; feeding it the
    already-normalized values the API exposes would normalize twice and silently
    change every score.

    When the 2025B factor columns are absent the readiness and cost components
    are carried as 0.0 **as an engine placeholder only** and flagged via
    ``components_unavailable``. The ranking and sweep callers then exclude those
    weights, so the placeholder can never change a score - and the API never
    reports it as a component value (it is returned as ``None``).
    """
    ref = reference_filters(f)
    df = (
        apply_filters(productivity_frame(ref), ref)
        if ref is not None
        else repo.training_dataset()
    )
    gapped_df = _threshold_gap(df, ref.benchmark_strategy if ref else "national_crop_median")
    gapped_df = gapped_df[gapped_df["yield_kg_ha"].fillna(0) > 0].copy()
    if gapped_df.empty:
        return gapped_df
    return _component_columns(gapped_df)


def priority_candidates_with_source(
    f: AnalyticsFilters | None = None,
    *,
    purpose: str = ip.DEFAULT_PURPOSE,
    threshold_pct: float = ip.DEFAULT_SHORTFALL_THRESHOLD_PCT,
) -> tuple[list[dict], str | None, list[str], ip.Population]:
    """The **eligible** candidates, the source id, the excluded components, and
    the stated reference population they were normalized against.

    Eligibility is applied here, once, so every consumer of this function - the
    ranking endpoint, the scenario comparison and the sensitivity sweep - cannot
    disagree about who is a candidate. An above-benchmark district is simply not
    in the list; its reason travels in ``population.ineligible``.

    The source is read from the frame that actually produced the candidates, so a
    ranking's provenance can never name a different dataset than the one ranked.
    """
    population, gapped_df, candidates = priority_population(
        f, purpose=purpose, threshold_pct=threshold_pct
    )
    if not candidates:
        return [], None, list(population.unavailable), population

    eligible_ids = set(population.eligible_ids)
    by_id = {_candidate_id(row): row for _, row in gapped_df.iterrows()}
    eligible: list[dict] = []
    for candidate in candidates:
        if str(candidate["id"]) not in eligible_ids:
            continue
        row = by_id.get(str(candidate["id"]))
        if row is not None:
            # The published values travel with the candidate so a client can show
            # what the score is about without a second request.
            candidate["yield_kg_ha"] = (
                None if pd.isna(row["yield_kg_ha"]) else round(float(row["yield_kg_ha"]), 1)
            )
            candidate["benchmark_yield_kg_ha"] = (
                None
                if pd.isna(row["benchmark_yield_kg_ha"])
                else round(float(row["benchmark_yield_kg_ha"]), 1)
            )
            if candidate["harvested_area_ha"] is not None:
                candidate["harvested_area_ha"] = round(candidate["harvested_area_ha"], 1)
        eligible.append(candidate)
    return eligible, frame_source_id(gapped_df), list(population.unavailable), population


def priority_candidates(
    f: AnalyticsFilters | None = None,
    *,
    purpose: str = ip.DEFAULT_PURPOSE,
) -> list[dict]:
    """The eligible district x crop candidates, with raw (un-normalized) components."""
    return priority_candidates_with_source(f, purpose=purpose)[0]


def priorities(
    limit: int = 50,
    weights: dict | None = None,
    f: AnalyticsFilters | None = None,
    *,
    purpose: str = ip.DEFAULT_PURPOSE,
    threshold_pct: float = ip.DEFAULT_SHORTFALL_THRESHOLD_PCT,
) -> dict:
    """The ranked productivity-support (or harvest-coordination) shortlist.

    Only eligible candidates can appear. A candidate at or above its benchmark is
    reported through ``n_ineligible`` and ``ineligible`` with its reason, never as
    a LOW priority - "not a shortfall" and "a small shortfall" are different
    facts and must not be presented as one scale.
    """
    candidates, source_id, unavailable, population = priority_candidates_with_source(
        f, purpose=purpose, threshold_pct=threshold_pct
    )
    effective_weights = ip.effective_weights(weights, tuple(unavailable), purpose=purpose)
    df_for_notes = candidate_frame(f)
    availability = component_availability(df_for_notes)
    unavailable_set = set(unavailable)

    base = {
        "weights": effective_weights,
        "purpose": purpose,
        "purpose_label": ip.PURPOSE_LABELS.get(purpose, purpose),
        "purpose_note": ip.PURPOSE_NOTES.get(purpose),
        "methodology_version": ip.METHODOLOGY_VERSION,
        "shortfall_threshold_pct": threshold_pct,
        "reference_population": population.as_dict(),
        "reference_population_note": population.reference_note,
        "n_eligible": population.n_reference,
        "n_ineligible": len(population.ineligible),
        "ineligible": [
            {"id": cid, "reason": reason}
            for cid, reason in sorted(population.ineligible.items())
        ][:200],
        "proxy_notes": proxy_notes_for(df_for_notes),
        "components_unavailable": unavailable,
        "component_availability": availability,
        "source_id": source_id,
        "period_code": frame_period_code(df_for_notes) or resolved_period(f),
        "rows": [],
    }
    if not candidates:
        return base

    # Scored against the reference population, then narrowed to the requested
    # display scope. Narrowing cannot change a score.
    ranked = ip.rank(
        candidates,
        weights=effective_weights,
        purpose=purpose,
        threshold_pct=threshold_pct,
        unavailable=tuple(unavailable),
    )
    if f is not None and getattr(f, "district", None):
        wanted = str(f.district).strip().lower()
        ranked = [r for r in ranked if str(r["district"]).strip().lower() == wanted]
    ranked = ranked[:limit]

    rows = [
        {
            "id": r["id"],
            "district": r["district"],
            "crop": r["crop"],
            "score": r["score"],
            "band": r["band"],
            "yield_kg_ha": r.get("yield_kg_ha"),
            "benchmark_yield_kg_ha": r.get("benchmark_yield_kg_ha"),
            "harvested_area_ha": r.get("harvested_area_ha"),
            # `gap` is the signed published gap in its own units; the score's gap
            # component is built from the non-negative shortfall, and both are
            # reported so a reader can see the difference.
            "gap": round(r["gap"], 4),
            "shortfall_pct": r.get("shortfall_pct"),
            "eligible": True,
            "eligibility_reason": None,
            "purpose": purpose,
            "reference_n": r.get("reference_n"),
            "vulnerability": r["vulnerability_component"],
            "affected_scale": r["affected_scale_component"],
            # An excluded component is reported as None - the engine placeholder
            # (0.0, normalized to a constant) must never reach a client as a value.
            "readiness": None if "readiness" in unavailable_set else r["readiness_component"],
            "cost_constraint": (None if "cost_constraint" in unavailable_set else r["cost_component"]),
        }
        for r in ranked
    ]

    return {**base, "rows": rows, "source_id": source_id}


def _threshold_gap(df: pd.DataFrame, strategy: str) -> pd.DataFrame:
    """Compute gaps on all valid rows using the selected benchmark."""
    valid = df[df["yield_kg_ha"].fillna(0) > 0].copy()
    return compute_gaps(valid, strategy=strategy)
