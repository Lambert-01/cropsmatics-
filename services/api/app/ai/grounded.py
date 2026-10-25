"""Deterministic grounded answers.

Moved out of ``assistant.py`` without changing a character of the produced prose,
so the existing grounding tests continue to pin the behaviour. This module is the
backbone of **fallback mode**: it needs no provider, no network and no key, and it
is what answers every question today.

It is also the reference implementation the LLM layer is measured against: an LLM
answer is only acceptable if a reader cannot tell whether it or this produced the
text, except that this one cannot be wrong about a number.
"""

from __future__ import annotations

import pandas as pd

from app.ai import knowledge_base
from app.ai.schemas import RoutedRequest
from app.analytics.productivity_gap import compute_gaps
from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import (
    analytics_service,
    meta_service,
    mobile_service,
    national_board_service,
    period_service,
    postharvest_service,
    productivity_service,
    trend_service,
)
from app.services.analytics_service import (
    frame_period_code,
    frame_source_id,
    productivity_frame,
    valid_yield,
)

NOT_GROUNDED = "Cropmatics does not currently have verified data to answer this question."
NOT_AVAILABLE = "Not available"


class GroundedAnswer:
    """A deterministic answer plus the evidence behind it.

    A plain object rather than a pydantic model because it is an internal value
    passed straight to the validator and then mapped onto the wire contract.
    """

    __slots__ = (
        "answer",
        "grounded",
        "intent",
        "evidence",
        "source",
        "period",
        "coverage",
        "limitations",
        "answer_mode",
    )

    def __init__(
        self,
        *,
        answer: str,
        grounded: bool,
        intent: str,
        evidence: dict,
        source: str | None = None,
        period: str | None = None,
        coverage: str | None = None,
        limitations: list[str] | None = None,
        answer_mode: str = "deterministic",
    ) -> None:
        self.answer = answer
        self.grounded = grounded
        self.intent = intent
        self.evidence = evidence
        self.source = source
        self.period = period
        self.coverage = coverage
        self.limitations = list(limitations or [])
        self.answer_mode = answer_mode


def _limitations(*extra: str) -> list[str]:
    base = [
        "aggregate district or national data; never farm-specific",
        "observed associations, not causal effects",
    ]
    return base + [item for item in extra if item]


def _unsupported(intent: str, **evidence: object) -> GroundedAnswer:
    return GroundedAnswer(
        answer=NOT_GROUNDED,
        grounded=False,
        intent=intent,
        evidence=dict(evidence),
        limitations=_limitations("question could not be grounded in the published data"),
    )


def greeting() -> GroundedAnswer:
    """Respond to small talk without pretending it is an observation."""
    return GroundedAnswer(
        answer=(
            "Hello! I’m the Cropmatics Assistant. I can help you explore Rwanda’s "
            "published crop productivity, district gaps, trends, practices, "
            "post-harvest use and data coverage. What would you like to investigate?"
        ),
        # This is a validated conversational response, not an agricultural claim.
        grounded=True,
        intent="greeting",
        evidence={},
        source="Cropmatics Assistant",
        coverage="conversational",
        answer_mode="conversational",
    )


def _list_phrase(parts: list[str]) -> str:
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def _share(label: str, value: float | None) -> str | None:
    return None if value is None else f"{value:.1f}% {label}"


def district_crop_gap(
    district: str, crop: str, period_code: str | None = None
) -> GroundedAnswer:
    """Compare a district's observed yield against the national crop median.

    The benchmark is computed across every district of the requested period (not
    on the single district row), and the frame is resolved through the canonical
    panel so the answer describes the period the caller asked about.
    """
    filters = AnalyticsFilters(period_code=period_code)
    try:
        frame = apply_filters(productivity_frame(filters), filters)
        gapped_frame = compute_gaps(valid_yield(frame), strategy="national_crop_median")
    except Exception:
        return _unsupported("district_crop_gap", district=district, crop=crop)

    rows = gapped_frame[
        (gapped_frame["district"] == district)
        & (gapped_frame["canonical_crop_name"] == crop)
    ]
    if rows.empty:
        return _unsupported(
            "district_crop_gap", district=district, crop=crop, period_code=period_code
        )

    r = rows.iloc[0]
    observed = float(r["yield_kg_ha"])
    benchmark = float(r["benchmark_yield_kg_ha"])
    gap = None if r["gap_index"] is None else float(r["gap_index"])
    period = (
        str(r.get("period") or "")
        or frame_period_code(rows)
        or period_code
        or mobile_service.latest_district_period()
        or ""
    )
    direction = "below" if gap is not None and gap > 0 else "above"

    answer = (
        f"In {mobile_service.format_period(period) or 'the latest period'}, {crop} yield in "
        f"{district} was {observed:,.0f} kg/ha, {direction} the national {crop} median of "
        f"{benchmark:,.0f} kg/ha"
    )
    if gap is not None:
        answer += f" (productivity gap index {gap:.1f})"
    answer += (
        ". That describes an association between the district's observed practices and its "
        "yield; it is not proof that changing any single factor would cause the difference."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="district_crop_gap",
        evidence={
            "district": district,
            "crop": crop,
            "period_code": frame_period_code(rows) or period_code,
            "observed_yield_kg_ha": observed,
            "benchmark_yield_kg_ha": benchmark,
            "benchmark_strategy": "national_crop_median",
            "gap_index": gap,
            "n_observations": int(len(gapped_frame["district"])),
        },
        source=frame_source_id(rows) or "NISR_SAS_2025B_DISTRICT_CROP",
        period=period or None,
        coverage="district",
        limitations=_limitations(
            "one district x crop observation per period",
            "the benchmark strategy materially changes the reported gap",
        ),
    )


def crop_context_for_period(crop: str, period_code: str) -> GroundedAnswer:
    """National context for one published period, from the canonical panel.

    ``crop_trend`` reads the panel's published NATIONAL rows, so this never sums
    district rows into a national figure.
    """
    try:
        result = productivity_service.crop_trend(crop=crop)
    except Exception:
        return _unsupported("crop_national_context", crop=crop, period_code=period_code)

    if result.get("missing"):
        return _unsupported("crop_national_context", crop=crop, period_code=period_code)

    point = next(
        (p for p in result.get("points", []) if p["period_code"] == period_code), None
    )
    if point is None:
        return _unsupported("crop_national_context", crop=crop, period_code=period_code)

    values = point["values"]
    production = values.get("production_mt")
    area = values.get("harvested_area_ha")
    yield_value = values.get("yield_kg_ha")
    if production is None and area is None:
        return _unsupported("crop_national_context", crop=crop, period_code=period_code)

    parts = []
    if production is not None:
        parts.append(f"production of {production:,.0f} metric tonnes")
    if area is not None:
        parts.append(f"harvested area of {area:,.0f} ha")
    if yield_value is not None:
        parts.append(f"yield of {yield_value:,.0f} kg/ha")

    answer = (
        f"In {period_service.label(period_code)}, the published national series for {crop} "
        f"reports {_list_phrase(parts)}. These are the published national totals for that "
        "period, not a sum of district rows; a crop-specific district yield is shown on the "
        "district ranking."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="crop_national_context",
        evidence={
            "crop": crop,
            "period_code": period_code,
            "production_mt": production,
            "harvested_area_ha": area,
            "yield_kg_ha": yield_value,
            "coverage_level": "national",
        },
        source=result.get("source_id") or "crop_productivity",
        period=period_code,
        coverage="national",
        limitations=_limitations(
            "published national totals for one period; never a sum of district rows",
            "yield is crop-specific, so it is never averaged or compared across crops",
        ),
    )


def crop_context(crop: str, period_code: str | None = None) -> GroundedAnswer:
    """National production context plus the official post-harvest use shares."""
    if period_code:
        return crop_context_for_period(crop, period_code)
    try:
        points = trend_service.crop_trends(crop).get("points") or []
    except Exception:
        return _unsupported("crop_national_context", crop=crop)
    if not points:
        return _unsupported("crop_national_context", crop=crop)

    latest = points[-1]
    values = latest.get("values") or {}
    period = str(latest.get("period") or "")

    production = values.get("production_mt")
    area = values.get("harvested_area_ha")
    yield_value = values.get("yield_mt_ha")
    if production is None and area is None:
        return _unsupported("crop_national_context", crop=crop, period=period)

    parts = []
    if production is not None:
        parts.append(f"production of {production:,.0f} metric tonnes")
    if area is not None:
        parts.append(f"harvested area of {area:,.0f} ha")
    if yield_value is not None:
        parts.append(f"yield of {yield_value:.2f} t/ha")
    answer = (
        f"In {mobile_service.format_period(period) or 'the latest period'}, Rwanda reported "
        f"{_list_phrase(parts)} of {crop}."
    )

    try:
        crops = postharvest_service.summary(crop=crop).get("crops") or []
        post_row: dict | None = crops[0] if crops else None
    except Exception:
        post_row = None

    evidence: dict = {
        "crop": crop,
        "period": period,
        "production_mt": production,
        "harvested_area_ha": area,
        "yield_mt_ha": yield_value,
        "coverage_level": "national",
    }

    if post_row:
        shares = [
            _share("sold", post_row.get("sold_pct")),
            _share("kept for household consumption", post_row.get("own_consumption_pct")),
            _share("stored", post_row.get("stored_pct")),
            _share("reported as post-harvest loss", post_row.get("post_harvest_losses_pct")),
        ]
        share_phrase = _list_phrase([item for item in shares if item])
        if share_phrase:
            answer += f" The national post-harvest use table records {share_phrase}."
        evidence["postharvest_use"] = {
            key: post_row.get(key)
            for key in (
                "sold_pct",
                "own_consumption_pct",
                "stored_pct",
                "post_harvest_losses_pct",
                "seeds_pct",
                "fodder_pct",
                "other_usage_pct",
            )
        }

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="crop_national_context",
        evidence=evidence,
        source="NISR_SAS_2024_2026_NATIONAL_TRENDS",
        period=period or None,
        coverage="national crop-level",
        limitations=_limitations(
            "national totals; these tables carry no district dimension for this crop",
            "post-harvest shares are national crop-level values for 2025 Season B",
        ),
    )


def district_context(district: str, period_code: str | None = None) -> GroundedAnswer:
    """District-level productivity and practice-adoption summary.

    Deliberately does **not** compute a mean yield across crops. Maize, beans,
    cassava, banana and potato have fundamentally different natural yield scales,
    so an "average district yield" would be a meaningless number dressed up as a
    statistic.
    """
    filters = AnalyticsFilters(period_code=period_code, district=district)
    try:
        productive = apply_filters(productivity_frame(filters), filters)
    except Exception:
        return _unsupported("district_context", district=district)

    rows = productive[productive["district"] == district]
    # A crop counts as having data when it carries production or harvested area.
    has_data = rows[
        rows[["production_mt", "harvested_area_ha"]].fillna(0).sum(axis=1) > 0
    ]
    if has_data.empty:
        return _unsupported("district_context", district=district)

    n_crops = int(has_data["canonical_crop_name"].nunique())
    period = (
        frame_period_code(productive)
        or period_code
        or mobile_service.latest_district_period()
    )
    period_label = mobile_service.format_period(period) or "the latest period"

    by_crop = (
        has_data.dropna(subset=["production_mt"])
        .sort_values("production_mt", ascending=False)
        .head(3)
    )
    top = by_crop.iloc[0] if not by_crop.empty else None

    answer = f"{district} has published observations for {n_crops} crops in {period_label}."
    if top is not None:
        answer += (
            f" {top['canonical_crop_name']} has the largest reported production "
            f"({top['production_mt']:,.0f} metric tonnes)."
        )
    answer += " Choose a crop to inspect crop-specific yield."

    try:
        matches = repo.factors_dataset()
        matches = matches[matches["district"] == district]
        factors = matches.iloc[0] if not matches.empty else None
    except Exception:
        factors = None

    evidence: dict = {
        "district": district,
        "n_crops_with_data": n_crops,
        "period": period,
        # Explicit: no cross-crop yield mean is available or meaningful.
        "cross_crop_yield_mean": None,
        "largest_production_crops": [
            {
                "crop": str(row["canonical_crop_name"]),
                "production_mt": (
                    None if row["production_mt"] is None else float(row["production_mt"])
                ),
            }
            for _, row in by_crop.iterrows()
        ],
    }

    if factors is not None:
        practices = [
            _share("improved seed use", factors.get("improved_seed_farmers_pct")),
            _share("inorganic fertilizer use", factors.get("inorganic_fertilizer_farmers_pct")),
            _share("erosion protection", factors.get("erosion_protection_farmers_pct")),
        ]
        phrase = _list_phrase([item for item in practices if item])
        if phrase:
            answer += f" Reported practice adoption: {phrase}."
            # The practice survey is a single release; never let it read as if it
            # belonged to the selected period.
            if period_code and period_code != "2025B":
                answer += (
                    " Those adoption figures come from the 2025 Season B district "
                    "practice survey, not from the selected period."
                )
        evidence["practice_adoption_pct"] = {
            key: (None if factors.get(key) is None else float(factors[key]))
            for key in (
                "improved_seed_farmers_pct",
                "organic_fertilizer_farmers_pct",
                "inorganic_fertilizer_farmers_pct",
                "pesticide_farmers_pct",
                "erosion_protection_farmers_pct",
                "mechanization_farmers_pct",
                "irrigation_farmers_pct",
                "agroforestry_farmers_pct",
            )
        }

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="district_context",
        evidence=evidence,
        source=frame_source_id(productive) or "NISR_SAS_2025B_DISTRICT_CROP",
        period=period,
        coverage="district",
        limitations=_limitations(
            "district aggregates only; practice adoption is a share of farmers, not of area",
            "no cross-crop average yield is computed because crops have different natural scales",
            "a district spans several agro-ecological conditions",
            "practice adoption comes from the 2025 Season B survey when another "
            "period is selected",
        ),
    )


def indicator_aggregate(spec: dict) -> dict | None:
    """National distribution of one indicator, from its published district rows.

    Honors the indicator aggregation policy: only indicators declared ``mean``
    (an unweighted mean of published district shares) are averaged. Anything
    declared ``crop_required`` is refused here - averaging yield across maize,
    beans, cassava and banana would produce a number that means nothing.
    """
    aggregation = spec.get("aggregation") or mobile_service.aggregation_for(spec["id"])
    if aggregation != "mean":
        return None

    loader = mobile_service.loader_for(spec["dataset"])
    if loader is None:
        return None
    try:
        frame = loader()
    except Exception:
        return None
    column = spec["column"]
    if frame.empty or column not in frame.columns:
        return None

    series = pd.to_numeric(frame[column], errors="coerce").dropna()
    if series.empty:
        return None

    aggregate: dict = {
        "id": spec["id"],
        "label": spec["label"],
        "unit": spec["unit"],
        "period": spec["period"],
        "coverage_level": spec["coverage_level"],
        "mean": round(float(series.mean()), 2),
        "n_observations": int(len(series)),
    }

    if "district" in frame.columns:
        numeric = frame.assign(_v=pd.to_numeric(frame[column], errors="coerce"))
        means = numeric.dropna(subset=["_v"]).groupby("district")["_v"].mean().dropna()
        if not means.empty:
            aggregate["lowest_district"] = str(means.idxmin())
            aggregate["lowest_value"] = round(float(means.min()), 2)
            aggregate["highest_district"] = str(means.idxmax())
            aggregate["highest_value"] = round(float(means.max()), 2)
    return aggregate


def national_indicator(indicator_ids: list[str]) -> GroundedAnswer:
    """Answer a question that names an indicator but no place or crop."""
    catalog = {item["id"]: item for item in mobile_service.indicator_catalog()}
    aggregates = []
    for indicator_id in indicator_ids[:3]:
        spec = catalog.get(indicator_id)
        if spec is None or not spec["available"]:
            continue
        aggregate = indicator_aggregate(spec)
        if aggregate is not None:
            aggregates.append(aggregate)

    if not aggregates:
        return _unsupported("national_indicator", matched_indicators=indicator_ids)

    period = aggregates[0].get("period")
    sentences: list[str] = []
    for item in aggregates:
        unit = item["unit"] or ""
        # "1.56% of water sources" reads correctly; "1.56 of water sources" does not.
        suffix = unit if unit.startswith("%") else (f" {unit}" if unit else "")
        sentence = (
            f"{item['label']} averages {item['mean']:,.2f}{suffix}"
            f" across {item['n_observations']} published observations"
        )
        if item.get("lowest_district"):
            sentence += (
                f", lowest in {item['lowest_district']} ({item['lowest_value']:,.2f}) and "
                f"highest in {item['highest_district']} ({item['highest_value']:,.2f})"
            )
        sentences.append(sentence + ".")

    answer = (
        f"In {mobile_service.format_period(period) or 'the latest period'}, "
        + " ".join(sentences)
        + " These are unweighted averages of the published rows, which is why they are "
        "reported with the number of observations behind them."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="national_indicator",
        evidence={"indicators": aggregates, "coverage_level": aggregates[0].get("coverage_level")},
        source="NISR_SAS_2025B_DISTRICT_CROP",
        period=period,
        coverage=aggregates[0].get("coverage_level"),
        limitations=_limitations(
            "unweighted mean of the published rows; not a population-weighted national value",
            "district-level indicators exist only for 2025 Season B",
        ),
    )


def _national_values(
    crop: str, period_code: str | None
) -> tuple[dict, str | None, str | None] | None:
    """Published national values for a crop, in a named period or the latest."""
    if period_code:
        try:
            result = productivity_service.crop_trend(crop=crop)
        except Exception:
            return None
        if result.get("missing"):
            return None
        point = next(
            (p for p in result.get("points", []) if p["period_code"] == period_code), None
        )
        if point is None:
            return None
        return point.get("values") or {}, period_code, result.get("source_id")

    try:
        points = trend_service.crop_trends(crop).get("points") or []
    except Exception:
        return None
    if not points:
        return None
    latest = points[-1]
    return (
        latest.get("values") or {},
        str(latest.get("period") or "") or None,
        "NISR_SAS_2024_2026_NATIONAL_TRENDS",
    )


def crop_comparison(
    crops: list[str], period_code: str | None = None
) -> GroundedAnswer:
    """Published national totals for two to four crops, side by side.

    Yield is deliberately not compared across crops: maize, beans, cassava and
    banana have different natural yield scales, so a cross-crop yield comparison
    would be misleading. Production and harvested area are comparable.
    """
    selected = [crop for crop in crops if crop][:4]
    segments: list[str] = []
    values_out: dict = {}
    resolved: str | None = None
    source: str | None = None

    for crop in selected:
        got = _national_values(crop, period_code)
        if not got:
            continue
        values, period, source_id = got
        resolved = resolved or period
        source = source or source_id
        production = values.get("production_mt")
        area = values.get("harvested_area_ha")
        if production is None and area is None:
            continue
        segment = f"{crop}: {production:,.0f} metric tonnes" if production is not None else f"{crop}: production not published"
        if area is not None:
            segment += f" on {area:,.0f} ha"
        segments.append(segment)
        values_out[crop] = {"production_mt": production, "harvested_area_ha": area}

    if len(segments) < 2:
        return _unsupported("crop_comparison", crops=selected)

    label = period_service.label(resolved) if resolved else "the latest period"
    answer = (
        f"In {label}, the published national figures are "
        + _list_phrase(segments)
        + ". These are published national totals placed side by side. Yield is not "
        "compared across crops here, because different crops have different natural "
        "yield scales."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="crop_comparison",
        evidence={
            "crops": list(values_out),
            "period_code": resolved,
            "values": values_out,
            "coverage_level": "national",
        },
        source=source,
        period=resolved,
        coverage="national",
        limitations=_limitations(
            "published national totals; a comparison is not a claim about relative efficiency",
            "yield is crop-specific, so it is never used as a cross-crop comparison",
        ),
    )


def period_comparison(
    crop: str, period_code: str | None = None, district: str | None = None
) -> GroundedAnswer:
    """Same-season, previous-year change for one crop's national series."""
    if district:
        return _unsupported("period_comparison", crop=crop, district=district)
    try:
        result = national_board_service.board([crop])
    except Exception:
        return _unsupported("period_comparison", crop=crop)

    row = next(
        (item for item in result.get("crops", []) if str(item.get("crop", "")).lower() == crop.lower()),
        None,
    )
    if row is None:
        return _unsupported("period_comparison", crop=crop)

    axis: list[str] = list(result.get("periods", []))
    if period_code and period_code in axis:
        axis = axis[: axis.index(period_code) + 1]
    units = result.get("metric_units", {})

    changes = {}
    for metric in ("production_mt", "yield_mt_ha"):
        series = list((row.get("series") or {}).get(metric, []))[: len(axis)]
        changes[metric] = national_board_service.same_season_change(series, axis, metric, units.get(metric))

    sentences: list[str] = []
    period_label: str | None = None
    for metric, label, unit in (
        ("production_mt", "production", "metric tonnes"),
        ("yield_mt_ha", "yield", "t/ha"),
    ):
        change = changes[metric]
        if not change.get("available"):
            continue
        period_label = period_label or change.get("period_code")
        direction = "up" if change["change_pct"] >= 0 else "down"
        sentences.append(
            f"{label} was {change['current_value']:,.2f} {unit} in "
            f"{period_service.label(change['period_code'])}, {direction} "
            f"{abs(change['change_pct']):.1f}% from {change['previous_value']:,.2f} {unit} in "
            f"{period_service.label(change['previous_period_code'])}"
        )

    if not sentences:
        return _unsupported("period_comparison", crop=crop, period_code=period_code)

    answer = (
        f"For {crop}: "
        + _list_phrase(sentences)
        + ". This is a same-season year-on-year comparison; seasons are not "
        "comparable in sequence because they differ agronomically."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="period_comparison",
        evidence={
            "crop": crop,
            "period_code": period_label,
            "changes": changes,
            "coverage_level": "national",
        },
        source="NISR_SAS_2024_2026_NATIONAL_TRENDS",
        period=period_label,
        coverage="national",
        limitations=_limitations(
            "same-season year-on-year comparison only; an A -> B step is not a time series",
            "compared only when both observations are published; a missing baseline is never a 0% change",
        ),
    )


def district_ranking(
    crop: str, period_code: str | None = None, limit: int = 5
) -> GroundedAnswer:
    """Districts with the largest observed yield gap for one crop."""
    filters = AnalyticsFilters(period_code=period_code, crop=crop)
    try:
        frame = apply_filters(productivity_frame(filters), filters)
        gapped = compute_gaps(valid_yield(frame), strategy="national_crop_median")
    except Exception:
        return _unsupported("district_ranking", crop=crop, period_code=period_code)
    if gapped.empty:
        return _unsupported("district_ranking", crop=crop, period_code=period_code)

    ranked = gapped.dropna(subset=["gap_index"]).sort_values("gap_index", ascending=False).head(limit)
    if ranked.empty:
        return _unsupported("district_ranking", crop=crop, period_code=period_code)

    resolved = frame_period_code(ranked) or period_code
    label = period_service.label(resolved) if resolved else "the latest period"
    entries = [f"{row['district']} (gap index {row['gap_index']:.1f})" for _, row in ranked.iterrows()]
    answer = (
        f"For {crop} in {label}, the largest observed productivity gaps are in "
        + _list_phrase(entries)
        + ". A higher gap index means observed yield sits further below the national "
        f"{crop} median, which is an association with local conditions and practices, "
        "not proof that any single change would close the gap."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="district_ranking",
        evidence={
            "crop": crop,
            "period_code": resolved,
            "ranking": [
                {"district": str(row["district"]), "gap_index": round(float(row["gap_index"]), 2)}
                for _, row in ranked.iterrows()
            ],
        },
        source=frame_source_id(ranked) or "NISR_SAS_2025B_DISTRICT_CROP",
        period=resolved,
        coverage="district",
        limitations=_limitations(
            "gap index is relative to the national crop median for this period",
            "associations only; the ranking is not a causal or investment recommendation",
        ),
    )


def crop_trend(crop: str, district: str | None = None, period_code: str | None = None) -> GroundedAnswer:
    """One crop across every published period."""
    try:
        result = productivity_service.crop_trend(crop=crop, district=district)
    except Exception:
        return _unsupported("crop_trend", crop=crop, district=district)
    if result.get("missing"):
        return _unsupported("crop_trend", crop=crop, district=district)

    points = [p for p in result.get("points", []) if (p.get("values") or {}).get("yield_kg_ha") is not None]
    if not points:
        return _unsupported("crop_trend", crop=crop, district=district)

    codes = [str(p["period_code"]) for p in points]
    latest = points[-1]
    answer = (
        f"{crop}" + (f" in {district}" if district else "") + " has published observations in "
        + _list_phrase(codes)
        + f". The latest, {period_service.label(codes[-1])}, reports a yield of "
        f"{latest['values']['yield_kg_ha']:,.0f} kg/ha. Seasons differ agronomically, "
        "so the periods are shown in sequence but not as a like-for-like time series."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="crop_trend",
        evidence={
            "crop": crop,
            "district": district,
            "periods": codes,
            "latest_period": codes[-1],
            "latest_yield_kg_ha": latest["values"]["yield_kg_ha"],
            "coverage_level": "district" if district else "national",
        },
        source=result.get("source_id") or "crop_productivity",
        period=codes[-1],
        coverage="district" if district else "national",
        limitations=_limitations(
            "seasonal periods are not a like-for-like time series",
            "a missing period is absent rather than zero",
        ),
    )


def practice_associations(crop: str, district: str | None = None) -> GroundedAnswer:
    """Observed district practice associations with yield for one crop."""
    try:
        result = analytics_service.factor_associations(AnalyticsFilters(crop=crop, district=district))
    except Exception:
        return _unsupported("practice_associations", crop=crop, district=district)

    factors = [f for f in result.get("factors", []) if f.get("correlation") is not None][:4]
    if not factors:
        return _unsupported("practice_associations", crop=crop, district=district)

    parts = []
    for factor in factors:
        corr = float(factor["correlation"])
        direction = "positive" if corr >= 0 else "negative"
        parts.append(f"{factor.get('label')} (magnitude {abs(corr):.2f}, {direction})")
    answer = (
        f"Across published district observations, {crop} yield is associated with "
        + _list_phrase(parts)
        + ". These are observed associations, not causal effects: districts that adopt "
        "more of a practice also tend to show a different yield, which is not evidence "
        "that changing one factor alone would change the outcome."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="practice_associations",
        evidence={
            "crop": crop,
            "district": district,
            "factors": factors,
            "coverage_level": "district",
        },
        source="NISR_SAS_2025B_DISTRICT_FACTORS",
        period="2025B",
        coverage="district",
        limitations=_limitations(
            "association, not causation",
            "practice adoption is a share of farmers, not of area, from the 2025 Season B survey",
            "small samples are indicative only",
        ),
    )


def postharvest_analysis(crop: str) -> GroundedAnswer:
    """National post-harvest use shares for one crop."""
    try:
        crops = postharvest_service.summary(crop=crop).get("crops") or []
    except Exception:
        return _unsupported("postharvest_analysis", crop=crop)
    if not crops:
        return _unsupported("postharvest_analysis", crop=crop)

    row = crops[0]
    shares = [
        _share("sold", row.get("sold_pct")),
        _share("kept for household consumption", row.get("own_consumption_pct")),
        _share("stored", row.get("stored_pct")),
        _share("reported as post-harvest loss", row.get("post_harvest_losses_pct")),
    ]
    phrase = _list_phrase([item for item in shares if item])
    if not phrase:
        return _unsupported("postharvest_analysis", crop=crop)

    period = str(row.get("period") or "2025B")
    answer = (
        f"For {crop}, the national post-harvest use table records {phrase}. "
        "These shares describe how the national crop output was used after harvest; "
        "they are percentages of production and are not additive with one another "
        "unless they sum to the full output."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="postharvest_analysis",
        evidence={
            "crop": crop,
            "postharvest_use": {
                key: row.get(key)
                for key in (
                    "sold_pct",
                    "own_consumption_pct",
                    "stored_pct",
                    "post_harvest_losses_pct",
                    "seeds_pct",
                    "fodder_pct",
                    "other_usage_pct",
                )
            },
            "coverage_level": "national crop-level",
        },
        source="NISR_SAS_2025B_POSTHARVEST_USE",
        period=period,
        coverage="national crop-level",
        limitations=_limitations(
            "national crop-level shares; these tables carry no district dimension",
            "post-harvest shares are a single 2025 Season B release",
        ),
    )


def data_coverage() -> GroundedAnswer:
    """Which periods the platform publishes, and at which coverage level."""
    try:
        catalog = period_service.catalog()
    except Exception:
        return _unsupported("data_coverage")
    periods = catalog.get("periods", [])
    if not periods:
        return _unsupported("data_coverage")

    codes = [str(entry["period_code"]) for entry in periods]
    practice_range = period_service.practice_period_range()
    postharvest_range = period_service.postharvest_period_range()
    legacy_scope = period_service.single_release_scope()
    answer = (
        f"Cropmatics currently publishes {len(codes)} periods, from "
        f"{period_service.label(codes[0])} through {period_service.label(codes[-1])}. "
        "District-level crop productivity rows exist for these periods."
    )
    if practice_range:
        answer += (
            " District agricultural practice observations (improved seed, fertiliser, "
            f"irrigation, water source, erosion control and severity) cover {practice_range}."
        )
    if postharvest_range:
        answer += (
            " Post-harvest use shares are national crop-level values covering "
            f"{postharvest_range}."
        )
    answer += (
        " The legacy single-release input, irrigation and erosion extracts cover "
        f"{legacy_scope} only, and an unpublished season such as 2026C does not "
        "appear at all."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="data_coverage",
        evidence={"periods": codes, "coverage_level": "period catalogue"},
        source="period catalogue",
        period=codes[-1],
        coverage="period catalogue",
        limitations=_limitations(
            "only periods present in the processed tables are listed",
            "a period with no district rows is reported as national-only",
            # Named per dataset: a single-release extract and the multi-period
            # practice observations are not the same coverage, and one sentence
            # covering both understated the second.
            f"the legacy input/practice, irrigation and erosion extracts cover "
            f"{legacy_scope} only; the practice observations cover "
            f"{practice_range or legacy_scope}",
        ),
    )


def forecast_status(
    *, crop: str | None = None, district: str | None = None,
    period_code: str | None = None,
) -> GroundedAnswer:
    """The forecast publication decision, read verbatim from the backtest.

    This is the only way an answer may speak about a forecast: it reports the
    gate's verdict and, for a target that passed, the period, unit, estimate and
    interval the backtest recorded. It never produces a forecast. When the gate
    withheld every target, the withholding and its reasons *are* the answer — an
    honest "no forecast is published, and here is why" is a complete result.
    """
    try:
        status = meta_service.forecast_status(crop=crop, district=district, period_code=period_code)
    except Exception:
        return _unsupported("forecast_status")

    if not status.get("report_available"):
        return GroundedAnswer(
            answer=(
                "No backtest report is present in this deployment, so no forecast is "
                "served. A forecast is published only from a chronological backtest that "
                "validated it — never generated on the fly."
            ),
            grounded=True,
            intent="forecast_status",
            evidence={"report_available": False},
            source="forecast backtest report",
            limitations=_limitations(
                "the backtest report was not built in this deployment",
                "no forecast is served and none is implied",
            ),
        )

    targets = status.get("targets") or []
    published = [t for t in targets if isinstance(t, dict) and t.get("status") == "ok"]

    if not status.get("serves_forecast"):
        # The blocking reasons are the content, not a footnote.
        reasons: list[str] = []
        for target in targets:
            if not isinstance(target, dict):
                continue
            for reason in target.get("reasons") or []:
                text = str(reason)
                if text not in reasons:
                    reasons.append(text)
        detail = " ".join(reasons[:2]) if reasons else str(status.get("note") or "")
        answer = (
            "No forecast is published for this selection. " + detail
        ).strip()
        return GroundedAnswer(
            answer=answer,
            grounded=True,
            intent="forecast_status",
            evidence={
                "serves_forecast": False,
                "targets": [t.get("target_id") for t in targets if isinstance(t, dict)],
                "generated": status.get("generated"),
            },
            source="forecast backtest report",
            limitations=_limitations(
                "this is an evidence verdict about the published record, not an outage",
                "no forecast value exists and none may be estimated",
            ),
        )

    parts = [
        (
            f"{t.get('label') or t.get('target_id')}: {t.get('point_estimate')} {t.get('unit') or ''} "
            f"for {t.get('next_period')}"
            + (
                f"; interval {t['interval'][0]} to {t['interval'][1]} {t.get('unit') or ''}"
                if isinstance(t.get("interval"), list) and len(t["interval"]) == 2
                else "; interval unavailable"
            )
        ).strip()
        for t in published
    ]
    answer = (
        "A validated forecast is published (modelled estimates, not observations): "
        + _list_phrase(parts[:4])
        + "."
    )
    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="forecast_status",
        evidence={
            "serves_forecast": True,
            "targets": [t.get("target_id") for t in published],
            "generated": status.get("generated"),
        },
        source="forecast backtest report",
        period=str(published[0].get("next_period")) if published else None,
        limitations=_limitations(
            "a forecast is a modelled estimate with an interval, not an observation",
            "an interval describes past model error, not a guarantee",
        ),
    )


def source_provenance(source_id: str | None = None) -> GroundedAnswer:
    """Where Cropmatics' figures come from."""
    try:
        rows = meta_service.sources()
    except Exception:
        rows = []
    datasets = [str(row.get("dataset")) for row in rows if row.get("dataset")]
    if source_id:
        datasets = [name for name in datasets if name == source_id]
    if not datasets:
        return _unsupported("source_provenance", source_id=source_id)

    answer = (
        "Cropmatics answers from registered sources: "
        + _list_phrase(datasets[:8])
        + ". Every figure carries the source id and the period it was published in, and "
        "each answer exposes its evidence so a number can be traced to its origin. No "
        "value in an answer is produced by a language model."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="source_provenance",
        evidence={"sources": datasets[:8], "coverage_level": "source registry"},
        source=datasets[0] if datasets else None,
        coverage="source registry",
        limitations=_limitations(
            "registered sources only; a dataset not registered here is not served",
        ),
    )


def methodology(indicator_ids: list[str] | None = None) -> GroundedAnswer:
    """How indicators are defined and aggregated.

    Answerable from the explanatory knowledge base as well as the indicator
    catalogue, so a methodology question works before any database is loaded.
    The prose is deliberately number-free: the figures, if any, come from the
    definition evidence the tool retrieved, and an answer that needs none cannot
    fabricate one.
    """
    try:
        catalog = mobile_service.indicator_catalog()
    except Exception:
        catalog = []
    available = [spec for spec in catalog if spec.get("available")]
    if indicator_ids:
        available = [spec for spec in available if spec.get("id") in set(indicator_ids)]

    documents = []
    try:
        documents = [
            doc
            for doc, _ in knowledge_base.search(
                "methodology indicator definition aggregation gap yield post-harvest", limit=3
            )
        ]
    except Exception:
        documents = []

    if not available and not documents:
        return _unsupported("methodology")

    answer = (
        "Cropmatics reports each indicator with its unit and its aggregation policy. "
        "Yield is crop-specific and is never averaged across crops, because maize, "
        "beans, cassava and banana have different natural yield scales. Indicators "
        "whose policy is 'mean' are unweighted means of the published district rows "
        "and are always reported with the number of observations behind them. A "
        "missing value is reported as missing, never as zero. These are explanatory "
        "notes about method; the figures themselves come from the published tables."
    )

    return GroundedAnswer(
        answer=answer,
        grounded=True,
        intent="methodology",
        evidence={
            "indicators": [spec.get("id") for spec in available][:20],
            "documents": [doc.id for doc in documents],
            "coverage_level": "data dictionary",
        },
        source="data dictionary",
        coverage="data dictionary",
        limitations=_limitations(
            "aggregation policy is per indicator and is published with the definition",
            # Per dataset, so a reviewer can tell which of the two series answered.
            "the legacy district indicator extracts are single-release "
            f"({period_service.single_release_scope()}); the multi-period practice "
            f"observations cover {period_service.practice_period_range() or 'no periods in this deployment'}",
        ),
    )


def key_figures(intent: str, evidence: dict) -> list[dict]:
    """Flatten the headline numbers of an answer into a language-neutral list."""
    figures: list[dict] = []
    if intent == "district_crop_gap":
        if evidence.get("observed_yield_kg_ha") is not None:
            figures.append(
                {"label": "observed yield", "value": evidence["observed_yield_kg_ha"],
                 "unit": "kg/ha"}
            )
        if evidence.get("benchmark_yield_kg_ha") is not None:
            figures.append(
                {"label": "national crop median",
                 "value": evidence["benchmark_yield_kg_ha"], "unit": "kg/ha"}
            )
    elif intent == "crop_national_context":
        for key, label, unit in (
            ("production_mt", "production", "metric tonnes"),
            ("harvested_area_ha", "harvested area", "ha"),
            ("yield_mt_ha", "yield", "t/ha"),
            ("yield_kg_ha", "yield", "kg/ha"),
        ):
            if evidence.get(key) is not None:
                figures.append({"label": label, "value": evidence[key], "unit": unit})
    elif intent == "national_indicator":
        for item in evidence.get("indicators", []):
            figures.append(
                {"label": item.get("label"), "value": item.get("mean"),
                 "unit": item.get("unit")}
            )
    elif intent == "district_context":
        figures.append(
            {"label": "crops with published data", "value": evidence.get("n_crops_with_data"),
             "unit": "crops"}
        )
    elif intent == "crop_comparison":
        for crop, values in (evidence.get("values") or {}).items():
            if values.get("production_mt") is not None:
                figures.append(
                    {"label": f"{crop} production", "value": values["production_mt"],
                     "unit": "metric tonnes"}
                )
    elif intent == "period_comparison":
        for metric, label in (
            ("production_mt", "production"),
            ("yield_mt_ha", "yield"),
        ):
            change = (evidence.get("changes") or {}).get(metric) or {}
            if change.get("available") and change.get("change_pct") is not None:
                figures.append(
                    {"label": f"{label} change", "value": change["change_pct"], "unit": "%"}
                )
    elif intent == "district_ranking":
        for item in evidence.get("ranking", [])[:3]:
            figures.append(
                {"label": f"{item.get('district')} gap index", "value": item.get("gap_index"),
                 "unit": "%"}
            )
    elif intent == "crop_trend":
        if evidence.get("latest_yield_kg_ha") is not None:
            figures.append(
                {"label": "latest yield", "value": evidence["latest_yield_kg_ha"], "unit": "kg/ha"}
            )
    elif intent == "postharvest_analysis":
        for key, label in (
            ("sold_pct", "sold"),
            ("own_consumption_pct", "household consumption"),
            ("stored_pct", "stored"),
            ("post_harvest_losses_pct", "post-harvest loss"),
        ):
            value = (evidence.get("postharvest_use") or {}).get(key)
            if value is not None:
                figures.append({"label": label, "value": value, "unit": "% of production"})
    return [f for f in figures if f.get("value") is not None]


def answer(routed: RoutedRequest) -> GroundedAnswer:
    """Produce the deterministic grounded answer for a routed request."""
    if routed.intent == "greeting":
        return greeting()
    if routed.intent == "district_crop_gap" and routed.district and routed.crop:
        return district_crop_gap(routed.district, routed.crop, routed.requested_period)
    if routed.intent == "crop_national_context" and routed.crop:
        return crop_context(routed.crop, routed.requested_period)
    if routed.intent == "district_context" and routed.district:
        return district_context(routed.district, routed.requested_period)
    if routed.intent == "national_indicator" and routed.indicator_ids:
        return national_indicator(routed.indicator_ids)
    if routed.intent == "crop_comparison" and routed.crops:
        return crop_comparison(routed.crops, routed.requested_period)
    if routed.intent == "period_comparison" and routed.crop:
        return period_comparison(routed.crop, routed.requested_period, routed.district)
    if routed.intent == "district_ranking" and routed.crop:
        return district_ranking(routed.crop, routed.requested_period)
    if routed.intent == "crop_trend" and routed.crop:
        return crop_trend(routed.crop, routed.district, routed.requested_period)
    if routed.intent == "practice_associations" and routed.crop:
        return practice_associations(routed.crop, routed.district)
    if routed.intent == "postharvest_analysis" and routed.crop:
        return postharvest_analysis(routed.crop)
    if routed.intent == "data_coverage":
        return data_coverage()
    if routed.intent == "source_provenance":
        return source_provenance()
    if routed.intent == "methodology":
        return methodology(routed.indicator_ids)
    if routed.intent == "forecast_status":
        return forecast_status(
            crop=routed.crop, district=routed.district, period_code=routed.requested_period,
        )
    return _unsupported(
        "unsupported",
        **({"unsupported_topic": routed.unsupported_topic} if routed.unsupported_topic else {}),
    )
