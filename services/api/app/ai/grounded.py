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

from app.ai.schemas import RoutedRequest
from app.analytics.productivity_gap import compute_gaps
from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import (
    mobile_service,
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
    ) -> None:
        self.answer = answer
        self.grounded = grounded
        self.intent = intent
        self.evidence = evidence
        self.source = source
        self.period = period
        self.coverage = coverage
        self.limitations = list(limitations or [])


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
    return [f for f in figures if f.get("value") is not None]


def answer(routed: RoutedRequest) -> GroundedAnswer:
    """Produce the deterministic grounded answer for a routed request."""
    if routed.intent == "district_crop_gap" and routed.district and routed.crop:
        return district_crop_gap(routed.district, routed.crop, routed.requested_period)
    if routed.intent == "crop_national_context" and routed.crop:
        return crop_context(routed.crop, routed.requested_period)
    if routed.intent == "district_context" and routed.district:
        return district_context(routed.district, routed.requested_period)
    if routed.intent == "national_indicator" and routed.indicator_ids:
        return national_indicator(routed.indicator_ids)
    return _unsupported(
        "unsupported",
        **({"unsupported_topic": routed.unsupported_topic} if routed.unsupported_topic else {}),
    )
