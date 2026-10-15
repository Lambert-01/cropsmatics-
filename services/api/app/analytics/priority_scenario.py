"""Priority-ranking scenarios.

The same pattern as the yield scenario, applied to the intervention planner: two
sets of reviewable assumptions are turned into two rankings, and the movement
between them is reported district by district.

Two differences from the yield scenario, both deliberate:

* the unit is a **district x crop candidate**, not a district, because the
  priority engine scores each crop in each district separately and collapsing
  that would hide which crop drove the score;
* "high priority" is a **band** (CRITICAL or HIGH) rather than a gap threshold,
  because that is how the planner communicates priority.

As with the yield scenario, this re-ranks published observations. It is not a
budget model, not a yield forecast, and not a statement that any district must
receive a particular intervention.
"""

from __future__ import annotations

import pandas as pd

from app.analytics.scenario import direction_for

#: Bands that count as "in the priority group" for movement reporting.
PRIORITY_BANDS = ("CRITICAL", "HIGH")

#: Anything below this score is not presented as a priority at all.
DEFAULT_MIN_SCORE = 0.0


class PriorityScenarioError(ValueError):
    """Raised for a priority scenario that cannot be honoured."""


def candidate_label(district: str, crop: str) -> str:
    """How a candidate is named in the UI.

    Crop-qualified because one district can hold several priorities, and a bare
    district name would make two different rows look like one.
    """
    return f"{district} · {crop}" if crop else str(district)


def _rank_rows(ranked: list[dict], *, top_n: int, min_score: float) -> list[dict]:
    """Ranked candidates reduced to the fields a comparison needs."""
    rows: list[dict] = []
    for index, row in enumerate(ranked):
        score = float(row.get("score", 0.0))
        if score < min_score:
            continue
        band = str(row.get("band") or "")
        rows.append(
            {
                "id": row["id"],
                "district": candidate_label(str(row.get("district", "")), str(row.get("crop", ""))),
                "raw_district": str(row.get("district", "")),
                "crop": row.get("crop"),
                "rank": index + 1,
                "score": round(score, 4),
                "band": band,
                "in_priority_group": band in PRIORITY_BANDS,
                "in_top_n": (index + 1) <= top_n,
            }
        )
    return rows


def build_view(
    ranked: list[dict],
    *,
    weights: dict,
    top_n: int = 10,
    min_score: float = DEFAULT_MIN_SCORE,
    label: str | None = None,
) -> dict:
    """One side of a planner comparison: a ranked candidate list plus its stats."""
    rows = _rank_rows(ranked, top_n=top_n, min_score=min_score)
    bands: dict[str, int] = {}
    for row in rows:
        bands[row["band"]] = bands.get(row["band"], 0) + 1

    return {
        "label": label,
        "weights": weights,
        "top_n": top_n,
        "rows": rows,
        "stats": {
            "n_candidates": len(rows),
            "n_priority_group": sum(1 for row in rows if row["in_priority_group"]),
            "n_top_n": sum(1 for row in rows if row["in_top_n"]),
            "band_counts": bands,
            "mean_score": (
                round(sum(row["score"] for row in rows) / len(rows), 4) if rows else None
            ),
        },
    }


def compare(baseline: dict, scenario: dict, *, top_n: int = 10) -> dict:
    """Movement between two priority rankings.

    Identity is the district x crop candidate. A candidate that appears on only
    one side is reported separately rather than counted as a fall: that happens
    when the *selection* differs, which is not a change in priority.
    """
    before = {row["id"]: row for row in baseline.get("rows", [])}
    after = {row["id"]: row for row in scenario.get("rows", [])}

    movement: list[dict] = []
    entered_group: list[str] = []
    left_group: list[str] = []
    entered_top_n: list[str] = []
    left_top_n: list[str] = []

    for identifier in sorted(set(before) | set(after)):
        b = before.get(identifier)
        s = after.get(identifier)
        if b is None:
            entered_group.append(s["district"])
        if s is None:
            left_group.append(b["district"])

        rank_before = b["rank"] if b else None
        rank_after = s["rank"] if s else None
        direction, delta = direction_for(rank_before, rank_after)

        if b is not None and s is not None:
            if s["in_top_n"] and not b["in_top_n"]:
                entered_top_n.append(s["district"])
            elif b["in_top_n"] and not s["in_top_n"]:
                left_top_n.append(b["district"])

        movement.append(
            {
                "district": (s or b)["district"],
                "rank_before": rank_before,
                "rank_after": rank_after,
                "movement": delta,
                "direction": direction,
                "score_before": b["score"] if b else None,
                "score_after": s["score"] if s else None,
                "band_before": b["band"] if b else None,
                "band_after": s["band"] if s else None,
                "in_top_n_before": b["in_top_n"] if b else None,
                "in_top_n_after": s["in_top_n"] if s else None,
            }
        )

    movement.sort(
        key=lambda row: (
            row["movement"] is None,
            -abs(row["movement"]) if row["movement"] is not None else 0,
            row["district"],
        )
    )

    return {
        "districts": movement,
        "n_compared": len(set(before) & set(after)),
        "n_moved": sum(1 for row in movement if row["direction"] in ("up", "down")),
        "n_unchanged": sum(1 for row in movement if row["direction"] == "unchanged"),
        "entered_group": entered_group,
        "left_group": left_group,
        # Reused field names so the same movement component renders both labs;
        # for the planner these are top-N entries rather than the priority band.
        "entered_priority": entered_top_n,
        "left_priority": left_top_n,
    }


def summarise_changes(baseline: dict, scenario: dict) -> list[dict]:
    """The assumption values that actually differ between the two sides.

    Weighting is deliberately absent: ``weight_deltas`` reports it per key, which
    is strictly more informative than a dict-to-dict row, so a weighting change
    never appears here as an opaque pair of objects.
    """
    changes: list[dict] = []
    for key, label in (
        ("period_code", "Period"),
        ("province", "Province group"),
        ("district", "District group"),
        ("crop", "Crop"),
        ("benchmark_strategy", "Benchmark strategy"),
        ("top_n", "Top-N threshold"),
        ("shortfall_threshold_pct", "Minimum shortfall (%)"),
    ):
        before, after = baseline.get(key), scenario.get(key)
        if before == after:
            continue
        changes.append({"parameter": key, "label": label, "before": before, "after": after})
    return changes


def weight_deltas(baseline_weights: dict, scenario_weights: dict) -> list[dict]:
    """Per-weight change, so a weighting scenario explains itself.

    Without this a user sees ranks move and cannot tell whether it was the gap
    weight or the readiness weight that caused it.
    """
    out: list[dict] = []
    for key in sorted(set(baseline_weights) | set(scenario_weights)):
        before = baseline_weights.get(key)
        after = scenario_weights.get(key)
        if before == after:
            continue
        out.append(
            {
                "key": key,
                "before": None if before is None else round(float(before), 4),
                "after": None if after is None else round(float(after), 4),
                "delta": (
                    None
                    if before is None or after is None
                    else round(float(after) - float(before), 4)
                ),
            }
        )
    return out


def coerce_weights(weights: dict | None) -> dict:
    """Validate a weighting is a usable simplex, and coerce to floats."""
    if not weights:
        return {}
    try:
        values = {str(key): float(value) for key, value in weights.items()}
    except (TypeError, ValueError) as exc:
        raise PriorityScenarioError(f"weights must be numeric: {exc}") from exc
    if any(value < 0 for value in values.values()):
        raise PriorityScenarioError("weights must not be negative")
    total = sum(values.values())
    if total <= 0:
        raise PriorityScenarioError("weights must not all be zero")
    # Normalise rather than reject on a rounding mismatch: the caller is stating
    # a relative preference, and the engine consumes a normalised simplex.
    return {key: value / total for key, value in values.items()}


def to_frame(rows: list[dict]) -> pd.DataFrame:
    """Convenience for callers that need to slice candidates before ranking."""
    return pd.DataFrame(rows)
