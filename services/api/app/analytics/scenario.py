"""Descriptive (analytical) scenario comparison over district yield rankings.

An **analytical scenario** re-runs the existing published-data analytics under a
different set of *reviewable assumptions* — benchmark strategy, comparison
period, gap threshold, district group or ranking criterion — and reports exactly
what changes.

It is deliberately **not** a prediction and not an intervention model:

* every value it reports is a published observation or a deterministic transform
  of published observations; nothing is invented, imputed or forecast;
* it never estimates the effect of an intervention, because observational
  district aggregates cannot support that;
* the baseline view is computed from its own parameters and returned *alongside*
  the scenario, so a scenario can never overwrite it.

Rank movement is *relative position within the selected district group*, not an
absolute improvement. A district can climb because it improved, because a peer
fell, or because the district group itself changed — the caller is told which
group was ranked so that is never ambiguous.
"""

from __future__ import annotations

import pandas as pd

from app.analytics.productivity_gap import STRATEGIES, compute_gaps

DEFAULT_GAP_THRESHOLD_PCT = 25.0
DEFAULT_RANKING_CRITERION = "gap_index"

# How a district's position is decided. ``order`` is the sort direction, so
# ``desc`` always puts the most notable district at rank 1: the widest gap for
# the gap criterion, the highest observed yield for the yield criterion.
RANKING_CRITERIA: dict[str, dict] = {
    "gap_index": {
        "label": "Yield gap index",
        "unit": "%",
        "order": "desc",
        "note": "highest gap first — furthest below the benchmark",
    },
    "yield_kg_ha": {
        "label": "Observed yield",
        "unit": "kg/ha",
        "order": "desc",
        "note": "highest observed yield first",
    },
    "production_mt": {
        "label": "Production",
        "unit": "metric tonnes",
        "order": "desc",
        "note": "largest reported production first",
    },
    "harvested_area_ha": {
        "label": "Harvested area",
        "unit": "ha",
        "order": "desc",
        "note": "largest harvested area first",
    },
}

#: District-level columns the view carries through from the published panel.
_VIEW_COLUMNS = (
    "district_code",
    "province",
    "yield_kg_ha",
    "benchmark_yield_kg_ha",
    "gap_index",
    "harvested_area_ha",
    "production_mt",
)

#: What each strategy measures its benchmark over. Returned with every view so a
#: narrower district group can never be mistaken for a different reference level.
BENCHMARK_SCOPE: dict[str, str] = {
    "national_crop_median": (
        "median of every published district for the crop in this period"
    ),
    "national_crop_season_median": (
        "median of every published district for the crop and season in this period"
    ),
    "top_quartile_comparable_districts": (
        "median of the top quartile of every published district for the crop and season"
    ),
    "agro_ecological_peer_group": (
        "median within the agro-ecological zone, across every published district"
    ),
}


class ScenarioError(ValueError):
    """Raised for a scenario request that cannot be honoured honestly."""


def validate_criterion(criterion: str) -> str:
    if criterion not in RANKING_CRITERIA:
        raise ScenarioError(
            f"unknown ranking criterion {criterion!r}; "
            f"expected one of {tuple(RANKING_CRITERIA)}"
        )
    return criterion


def validate_strategy(strategy: str) -> str:
    if strategy not in STRATEGIES:
        raise ScenarioError(
            f"unknown benchmark strategy {strategy!r}; expected one of {STRATEGIES}"
        )
    return strategy


def valid_yield(df: pd.DataFrame) -> pd.DataFrame:
    """Rows with a published, positive yield — the only rows a yield view uses."""
    return df[df["yield_kg_ha"].fillna(0) > 0].copy()


def district_frame(frame: pd.DataFrame, strategy: str) -> pd.DataFrame:
    """One row per district, with benchmark and gap attached.

    Rates (yield, benchmark, gap) are the district median and extensive
    quantities (area, production) are summed, matching ``analytics_service`` so a
    scenario and the page it came from cannot disagree.
    """
    gapped = compute_gaps(valid_yield(frame), strategy=strategy)
    if gapped.empty:
        return gapped
    return (
        gapped.groupby("district", dropna=False)
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
    )


def _round(value: object, digits: int = 2) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), digits)


def apply_group(
    districts: pd.DataFrame, *, province: str | None = None, district: str | None = None
) -> pd.DataFrame:
    """Restrict a district frame for display. Never used to compute a benchmark.

    A named district wins over a province: combining them would silently return
    nothing whenever the district sits outside that province.
    """
    if districts.empty:
        return districts
    out = districts
    if district:
        needle = district.strip().lower()
        out = out[out["district"].astype(str).str.lower() == needle]
    elif province:
        needle = province.strip().lower()
        if "province" in out.columns:
            out = out[out["province"].astype(str).str.lower() == needle]
    return out


def build_view(
    frame: pd.DataFrame,
    *,
    strategy: str,
    gap_threshold_pct: float = DEFAULT_GAP_THRESHOLD_PCT,
    ranking_criterion: str = DEFAULT_RANKING_CRITERION,
    province: str | None = None,
    district: str | None = None,
) -> dict:
    """Rank the districts of one selection under one set of assumptions.

    ``frame`` must carry **every** district the crop published for the period.
    The benchmark is computed over all of them, and only then is the district
    group applied. Narrowing the group therefore changes which districts you see,
    never the reference level they are measured against - otherwise choosing a
    high-performing province would mechanically shrink every district's gap.

    Ranking and the high-priority flag stay *within* the group, because the
    question "which of these districts is worst" is relative to the group.

    Returns ``{"rows": [...], "stats": {...}}``. A district with no published
    value for the ranking criterion is returned with ``rank: None`` rather than
    being dropped or defaulted to a number: it is *not comparable*, which is a
    different statement from "it ranked last".
    """
    validate_strategy(strategy)
    criterion = validate_criterion(ranking_criterion)

    all_districts = district_frame(frame, strategy)
    n_benchmark_districts = (
        int(all_districts["district"].nunique()) if not all_districts.empty else 0
    )
    scope = BENCHMARK_SCOPE.get(strategy)

    empty_stats = {
        "n_districts": 0,
        "n_below_benchmark": 0,
        "n_below_threshold": 0,
        "ranked_districts": 0,
        "unranked_districts": 0,
        "mean_gap_index": None,
        "mean_yield_kg_ha": None,
        "total_production_mt": None,
        "total_harvested_area_ha": None,
        # How many districts the benchmark was measured over, which is the whole
        # published set and not the displayed group.
        "n_benchmark_districts": n_benchmark_districts,
        "benchmark_scope": scope,
    }

    districts = apply_group(all_districts, province=province, district=district)
    if districts.empty:
        return {"rows": [], "stats": empty_stats}

    districts = districts.copy()
    districts["benchmark_strategy"] = strategy
    order_ascending = RANKING_CRITERIA[criterion]["order"] == "asc"
    ranked = districts[districts[criterion].notna()].sort_values(
        criterion, ascending=order_ascending, kind="stable"
    )
    rank_map = {str(d): i + 1 for i, d in enumerate(ranked["district"])}
    districts["rank"] = districts["district"].map(lambda d: rank_map.get(str(d)))

    districts["below_benchmark"] = districts["gap_index"] > 0
    districts["below_threshold"] = districts["gap_index"] >= float(gap_threshold_pct)

    rows: list[dict] = []
    ordered = districts.sort_values(
        "rank", ascending=True, kind="stable", na_position="last"
    )
    for _, row in ordered.iterrows():
        rows.append(
            {
                "district": str(row["district"]),
                "rank": None if pd.isna(row["rank"]) else int(row["rank"]),
                "district_code": None if pd.isna(row.get("district_code")) else str(row["district_code"]),
                "province": None if pd.isna(row.get("province")) else str(row["province"]),
                "yield_kg_ha": _round(row.get("yield_kg_ha"), 1),
                "benchmark_yield_kg_ha": _round(row.get("benchmark_yield_kg_ha"), 1),
                "gap_index": _round(row.get("gap_index"), 2),
                "harvested_area_ha": _round(row.get("harvested_area_ha"), 1),
                "production_mt": _round(row.get("production_mt"), 1),
                "below_benchmark": bool(row["below_benchmark"]),
                "below_threshold": bool(row["below_threshold"]),
            }
        )

    mean_gap = districts["gap_index"].dropna()
    mean_yield = districts["yield_kg_ha"].dropna()
    total_production = districts["production_mt"].dropna()
    total_area = districts["harvested_area_ha"].dropna()

    return {
        "rows": rows,
        "stats": {
            "n_districts": int(len(districts)),
            "n_below_benchmark": int(districts["below_benchmark"].sum()),
            "n_below_threshold": int(districts["below_threshold"].sum()),
            "ranked_districts": int(len(ranked)),
            "unranked_districts": int(districts[criterion].isna().sum()),
            "mean_gap_index": _round(mean_gap.mean(), 2) if not mean_gap.empty else None,
            "mean_yield_kg_ha": _round(mean_yield.mean(), 1) if not mean_yield.empty else None,
            "total_production_mt": (
                _round(total_production.sum(), 1) if not total_production.empty else None
            ),
            "total_harvested_area_ha": (
                _round(total_area.sum(), 1) if not total_area.empty else None
            ),
            "n_benchmark_districts": n_benchmark_districts,
            "benchmark_scope": scope,
        },
    }


def _direction(rank_before: int | None, rank_after: int | None) -> tuple[str, int | None]:
    """``(direction, movement)`` where a positive movement means it moved up.

    ``movement`` is ``rank_before - rank_after``: rank 5 -> rank 2 is +3.
    """
    if rank_before is None and rank_after is None:
        return "unranked", None
    if rank_before is None:
        return "new", None
    if rank_after is None:
        return "dropped", None
    movement = rank_before - rank_after
    if movement > 0:
        return "up", movement
    if movement < 0:
        return "down", movement
    return "unchanged", 0


def compare_views(
    baseline_rows: list[dict], scenario_rows: list[dict]
) -> dict:
    """District-by-district rank movement between two views.

    Only districts present in the baseline are assessed for *movement*; a
    district that enters because the district group itself changed is reported
    separately, so a group change is never misread as a performance change.
    """
    before = {row["district"]: row for row in baseline_rows}
    after = {row["district"]: row for row in scenario_rows}

    movement: list[dict] = []
    entered_group: list[str] = []
    left_group: list[str] = []
    entered_priority: list[str] = []
    left_priority: list[str] = []

    for district in sorted(set(before) | set(after)):
        b = before.get(district)
        s = after.get(district)
        if b is None:
            entered_group.append(district)
        if s is None:
            left_group.append(district)

        rank_before = b["rank"] if b else None
        rank_after = s["rank"] if s else None
        direction, delta = _direction(rank_before, rank_after)

        # Priority movement is only meaningful when the district is in both
        # views; a district outside the group is not "no longer a priority".
        if b is not None and s is not None:
            if s["below_threshold"] and not b["below_threshold"]:
                entered_priority.append(district)
            elif b["below_threshold"] and not s["below_threshold"]:
                left_priority.append(district)

        movement.append(
            {
                "district": district,
                "rank_before": rank_before,
                "rank_after": rank_after,
                "movement": delta,
                "direction": direction,
                "gap_before": b["gap_index"] if b else None,
                "gap_after": s["gap_index"] if s else None,
                "yield_before": b["yield_kg_ha"] if b else None,
                "yield_after": s["yield_kg_ha"] if s else None,
                "below_threshold_before": bool(b["below_threshold"]) if b else None,
                "below_threshold_after": bool(s["below_threshold"]) if s else None,
            }
        )

    movement.sort(
        key=lambda m: (
            m["movement"] is None,
            -abs(m["movement"]) if m["movement"] is not None else 0,
            m["district"],
        )
    )

    return {
        "districts": movement,
        "n_compared": len(set(before) & set(after)),
        "entered_group": entered_group,
        "left_group": left_group,
        "entered_priority": entered_priority,
        "left_priority": left_priority,
        "n_moved": sum(1 for m in movement if m["direction"] in ("up", "down")),
        "n_unchanged": sum(1 for m in movement if m["direction"] == "unchanged"),
    }


def summarise_changes(
    baseline: dict, scenario: dict
) -> list[dict]:
    """Human-readable list of the assumption values that actually differ.

    Returned explicitly so the UI can state *what was simulated* instead of
    implying a modelled intervention took place.
    """
    changes: list[dict] = []
    for key, label in (
        ("period_code", "Comparison period"),
        ("benchmark_strategy", "Benchmark strategy"),
        ("gap_threshold_pct", "Gap threshold"),
        ("province", "Province group"),
        ("district", "District group"),
        ("ranking_criterion", "Ranking criterion"),
    ):
        before, after = baseline.get(key), scenario.get(key)
        if before == after:
            continue
        changes.append({"parameter": key, "label": label, "before": before, "after": after})
    return changes
