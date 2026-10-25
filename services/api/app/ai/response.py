"""The structured response contract.

A single giant Markdown blob forces the frontend to parse prose to find a number,
a citation or an action. This module builds a validated structure instead, so the
web and mobile clients render *the same* answer from typed fields:

    {
      "answer_id", "conversation_id", "language", "depth", "audience", "intent",
      "title", "summary", "key_findings", "figures", "comparison", "trend",
      "interpretation", "limitations", "methodology",
      "evidence", "sources", "suggested_followups", "actions",
      "resolved_context", "data_version", "warnings"
    }

Two rules the builder exists to enforce:

* **depth changes volume, not truth.** ``quick`` carries the summary and a few
  figures; ``standard`` adds findings and sources; ``deep`` adds comparison,
  trend, interpretation and methodology. The *figures and evidence are identical
  at every depth* - only how much of them is surfaced changes.
* **audience changes presentation, not evidence.** A farmer and a researcher get
  byte-for-byte the same figures, evidence and sources; the text around them is
  worded differently and the researcher sees methodology up front.

The structure is assembled from the pieces the engine already produced - the
deterministic grounded answer, the validated prose, the retrieved evidence bundle
and the routed plan - so it cannot introduce a fact that the engine did not.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.ai.evidence import EvidenceBundle, EvidenceItem
from app.ai.grounded import GroundedAnswer, key_figures
from app.ai.schemas import RoutedRequest
from app.services import meta_service

#: Human labels for the metrics the tools emit. A metric without an entry falls
#: back to its own name, never to a guess.
METRIC_LABELS: dict[str, str] = {
    "yield_kg_ha": "Yield",
    "yield_mt_ha": "Yield",
    "production_mt": "Production",
    "harvested_area_ha": "Harvested area",
    "cultivated_area_ha": "Cultivated area",
    "benchmark_yield_kg_ha": "National crop median yield",
    "gap_index": "Productivity gap index",
    "district_rank_by_gap_index": "Productivity gap rank",
    "n_crops_with_data": "Crops with published data",
    "sold_pct": "Sold",
    "own_consumption_pct": "Household consumption",
    "stored_pct": "Stored",
    "post_harvest_losses_pct": "Post-harvest loss",
    "seeds_pct": "Kept as seed",
    "fodder_pct": "Used as fodder",
    "other_usage_pct": "Other use",
}

INTENT_TITLES: dict[str, str] = {
    "greeting": "Cropmatics Assistant",
    "district_crop_gap": "District crop productivity",
    "crop_national_context": "National crop context",
    "district_context": "District overview",
    "national_indicator": "National indicator",
    "crop_comparison": "Crop comparison",
    "period_comparison": "Same-season change",
    "district_ranking": "District ranking",
    "crop_trend": "Crop trend",
    "practice_associations": "Practice associations",
    "postharvest_analysis": "Post-harvest use",
    "data_coverage": "Data coverage",
    "source_provenance": "Data sources",
    "methodology": "Methodology",
    "unsupported": "Not available from the data",
}

#: Honest methodology statements per intent, used to fill out the methodology
#: list when the retrieved evidence items do not each carry their own ``method``.
#: These describe the *published* derivation; they introduce no new figure.
INTENT_METHODOLOGY: dict[str, tuple[str, ...]] = {
    "district_crop_gap": (
        "the benchmark is the national crop median for the same period, not a target",
        "gap index = 100 * (national median yield - observed yield) / median yield",
    ),
    "district_ranking": (
        "districts are ranked by gap index, descending",
        "gap index is relative to the national crop median for the period",
    ),
    "crop_comparison": (
        "production and harvested area are published national totals, never a sum of district rows",
        "yield is crop-specific, so it is not compared across crops",
    ),
    "period_comparison": (
        "comparison is same season one year earlier, which is the only season-to-season comparison supported",
        "a missing baseline is reported as unavailable, never as a 0% change",
    ),
    "crop_national_context": (
        "published national totals for the period; a national figure is never a sum of district rows",
    ),
    "crop_trend": (
        "each point is a published seasonal observation; seasons are not a like-for-like time series",
    ),
    "practice_associations": (
        "association is a Pearson correlation across published district observations",
        "association is not causation",
    ),
    "postharvest_analysis": (
        "shares are national crop-level percentages of production from the post-harvest use table",
    ),
    "national_indicator": (
        "value is an unweighted mean of the published district rows, reported with its observation count",
    ),
    "data_coverage": (
        "only periods present in the processed tables are listed",
    ),
    "source_provenance": (
        "sources are the registered datasets that answer questions; no value is model-generated",
    ),
    "methodology": (
        "aggregation policy is per indicator and is published with its definition",
    ),
}

#: How many evidence items are surfaced at each depth. The evidence that is
#: *retrieved* is the same; only the number shown in the structured payload
#: changes, to keep the browser payload bounded.
_EVIDENCE_LIMIT = {"quick": 8, "standard": 25, "deep": 60}


class Figure(BaseModel):
    """One headline number, traceable to its origin."""

    label: str
    value: float | int
    unit: str | None = None
    period_code: str | None = None
    district: str | None = None
    crop: str | None = None
    indicator: str | None = None
    source_id: str | None = None


class EvidenceRef(BaseModel):
    """One retrieved value with its full provenance."""

    evidence_id: str
    kind: str
    metric: str
    label: str | None = None
    value: float | int | str | None = None
    unit: str | None = None
    period_code: str | None = None
    district: str | None = None
    crop: str | None = None
    source_id: str | None = None
    method: str | None = None


class SourceRef(BaseModel):
    source_id: str
    name: str | None = None
    period: str | None = None


class ActionRef(BaseModel):
    """A navigation the client can offer next to the answer."""

    type: str
    label: str
    crop: str | None = None
    district: str | None = None
    crops: list[str] | None = None
    layer: str | None = None


class StructuredAnswer(BaseModel):
    answer_id: str
    conversation_id: str | None = None
    language: str = "en"
    depth: str = "standard"
    audience: str = "planner"
    intent: str

    title: str
    summary: str
    key_findings: list[str] = Field(default_factory=list)
    figures: list[Figure] = Field(default_factory=list)
    comparison: dict = Field(default_factory=dict)
    trend: dict = Field(default_factory=dict)
    interpretation: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    methodology: list[str] = Field(default_factory=list)

    evidence: list[EvidenceRef] = Field(default_factory=list)
    sources: list[SourceRef] = Field(default_factory=list)
    suggested_followups: list[str] = Field(default_factory=list)
    actions: list[ActionRef] = Field(default_factory=list)
    resolved_context: dict = Field(default_factory=dict)
    data_version: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


def _metric_label(item: EvidenceItem) -> str:
    return METRIC_LABELS.get(item.metric) or item.note or item.metric


def _figure_from_evidence(item: EvidenceItem) -> Figure | None:
    if item.value is None or isinstance(item.value, str):
        return None
    return Figure(
        label=_metric_label(item),
        value=round(item.value, 4) if isinstance(item.value, float) else item.value,
        unit=item.unit,
        period_code=item.period_code,
        district=item.district,
        crop=item.crop,
        indicator=item.metric,
        source_id=item.source_id,
    )


def _figures(reference: GroundedAnswer, bundle: EvidenceBundle, limit: int) -> list[Figure]:
    """Headline figures for the answer, enriched with provenance.

    The deterministic ``key_figures`` give the labels the answer already uses; the
    bundle supplies the period and source so each figure is traceable. A figure
    the bundle cannot match keeps its label and leaves provenance empty rather
    than borrowing a neighbouring item's.
    """
    wanted = key_figures(reference.intent, reference.evidence)
    by_label = {_metric_label(item): item for item in bundle.items}
    figures: list[Figure] = []
    for entry in wanted[:limit]:
        label = str(entry.get("label") or "")
        match = by_label.get(label)
        figures.append(
            Figure(
                label=label or "value",
                value=entry["value"],
                unit=entry.get("unit"),
                period_code=match.period_code if match else reference.period,
                district=match.district if match else None,
                crop=match.crop if match else None,
                indicator=match.metric if match else None,
                source_id=match.source_id if match else reference.source,
            )
        )
    if figures:
        return figures
    # Fall back to the first attributable evidence items when an intent has no
    # curated headline list, so the structure is never silently empty.
    for item in bundle.items:
        figure = _figure_from_evidence(item)
        if figure is not None:
            figures.append(figure)
        if len(figures) >= limit:
            break
    return figures


def _evidence(bundle: EvidenceBundle, limit: int) -> list[EvidenceRef]:
    return [
        EvidenceRef(
            evidence_id=item.evidence_id,
            kind=item.kind.value,
            metric=item.metric,
            label=item.note,
            value=item.value,
            unit=item.unit,
            period_code=item.period_code,
            district=item.district,
            crop=item.crop,
            source_id=item.source_id,
            method=item.method,
        )
        for item in bundle.items[:limit]
    ]


def _methodology(bundle: EvidenceBundle, intent: str, limit: int = 6) -> list[str]:
    """How the retrieved values were produced.

    Evidence-level methods come first (they are specific to the values shown); any
    remaining slots are filled with the intent's published methodology so the list
    is never empty when the items themselves carry no method.
    """
    seen: list[str] = []
    for item in bundle.items:
        if item.method and item.method not in seen:
            seen.append(item.method)
        if len(seen) >= limit:
            break
    for statement in INTENT_METHODOLOGY.get(intent, ()):
        if len(seen) >= limit:
            break
        if statement not in seen:
            seen.append(statement)
    return seen


def _sources(bundle: EvidenceBundle) -> list[SourceRef]:
    try:
        registry = {str(row.get("dataset")): row for row in meta_service.sources()}
    except Exception:
        registry = {}
    refs: list[SourceRef] = []
    for source_id in bundle.sources:
        row = registry.get(source_id) or {}
        refs.append(
            SourceRef(
                source_id=source_id,
                name=row.get("use") or row.get("owner") or None,
                period=None,
            )
        )
    return refs


def _data_version() -> dict:
    try:
        version = meta_service.data_version()
    except Exception:
        return {}
    return {
        key: version.get(key)
        for key in ("dataset_version", "generated_at", "periods", "row_counts")
        if version.get(key) is not None
    }


def _key_findings(routed: RoutedRequest, reference: GroundedAnswer) -> list[str]:
    """Concise findings, derived from the intent's evidence - never new numbers."""
    intent = reference.intent
    evidence = reference.evidence
    findings: list[str] = []
    if intent == "district_ranking":
        for item in (evidence.get("ranking") or [])[:3]:
            findings.append(f"{item.get('district')}: gap index {item.get('gap_index')}")
    elif intent == "crop_comparison":
        for crop, values in (evidence.get("values") or {}).items():
            if values.get("production_mt") is not None:
                findings.append(f"{crop}: {values['production_mt']:,.0f} metric tonnes")
    elif intent == "period_comparison":
        for metric, change in (evidence.get("changes") or {}).items():
            if change.get("available"):
                findings.append(
                    f"{metric}: {change['change_pct']:+.1f}% vs {change.get('previous_period_code')}"
                )
    elif intent == "practice_associations":
        for factor in (evidence.get("factors") or [])[:3]:
            findings.append(f"{factor.get('label')}: {factor.get('interpretation')}")
    elif intent == "district_context":
        for item in (evidence.get("largest_production_crops") or [])[:3]:
            findings.append(f"{item.get('crop')}: {item.get('production_mt')}")
    return findings


def _suggested_followups(routed: RoutedRequest) -> list[str]:
    """Questions that the platform can actually ground, given the entities."""
    if routed.intent == "greeting":
        return [
            "Which districts have the largest maize productivity gaps?",
            "Which periods are covered?",
            "Which crops have the highest post-harvest loss shares?",
        ]
    crops = routed.crops or ([routed.crop] if routed.crop else [])
    district = routed.districts[0] if routed.districts else routed.district
    questions: list[str] = []
    crop = crops[0] if crops else None

    if crop and len(crops) >= 2:
        questions.append(f"Compare {crops[0]} and {crops[1]} in the same period")
    elif crop:
        questions.append(f"Which districts have the largest {crop} productivity gaps?")
    if crop:
        questions.append(f"Which practices are associated with {crop} yield?")
        questions.append(f"Show the {crop} yield trend over time")
        questions.append(f"How is {crop} used after harvest?")
    if district:
        questions.append(f"Tell me about {district}")
    questions.append("Which periods are covered?")
    return questions[:5]


def _actions(routed: RoutedRequest) -> list[ActionRef]:
    crops = routed.crops or ([routed.crop] if routed.crop else [])
    districts = routed.districts or ([routed.district] if routed.district else [])
    actions: list[ActionRef] = []
    for crop in crops[:2]:
        actions.append(ActionRef(type="open_crop", label=f"Open {crop}", crop=crop))
    for district in districts[:2]:
        actions.append(
            ActionRef(type="open_district", label=f"Open {district}", district=district)
        )
    if crops and districts:
        actions.append(
            ActionRef(
                type="open_map",
                label="Open on the map",
                crop=crops[0],
                district=districts[0],
                layer="productivity_gap",
            )
        )
    if len(crops) >= 2:
        actions.append(ActionRef(type="compare", label="Compare crops", crops=crops[:4]))
    actions.append(ActionRef(type="view_evidence", label="View evidence"))
    return actions


def _warnings(
    bundle: EvidenceBundle, reference: GroundedAnswer, provider_failed: bool, used_fallback: bool
) -> list[str]:
    warnings = list(bundle.missing_data)
    if provider_failed:
        warnings.append(
            "the language model provider was unavailable; the verified answer was returned instead"
        )
    elif used_fallback:
        warnings.append(
            "the generated wording was rejected against the evidence; the verified answer was returned"
        )
    if not reference.grounded:
        warnings.append("no verified observation was found for this selection")
    return warnings


def build(
    *,
    answer_id: str,
    conversation_id: str | None,
    routed: RoutedRequest,
    reference: GroundedAnswer,
    bundle: EvidenceBundle,
    validation: dict | None = None,
) -> StructuredAnswer:
    """Assemble the structured payload for one answer."""
    depth = routed.depth if routed.depth in _EVIDENCE_LIMIT else "standard"
    audience = routed.audience if routed.audience in ("farmer", "planner", "analyst") else "planner"
    evidence_limit = _EVIDENCE_LIMIT[depth]
    validation = validation or {}
    provider_failed = bool(validation.get("provider_failed"))
    used_fallback = bool(validation.get("used_fallback"))

    structured = StructuredAnswer(
        answer_id=answer_id,
        conversation_id=conversation_id,
        language=routed.language,
        depth=depth,
        audience=audience,
        intent=reference.intent,
        title=INTENT_TITLES.get(reference.intent, "Cropmatics"),
        summary=reference.answer,
        figures=_figures(reference, bundle, limit=6 if depth == "deep" else 4),
        limitations=list(reference.limitations),
        evidence=_evidence(bundle, evidence_limit),
        sources=_sources(bundle),
        actions=_actions(routed),
        resolved_context={
            "crops": list(routed.crops or ([routed.crop] if routed.crop else [])),
            "districts": list(routed.districts or ([routed.district] if routed.district else [])),
            "period_code": routed.requested_period,
            "metric": routed.metric,
            "language": routed.language,
            "depth": depth,
            "audience": audience,
        },
        data_version=_data_version(),
        warnings=_warnings(bundle, reference, provider_failed, used_fallback),
    )

    # Depth controls how much is surfaced. Figures and evidence are unchanged in
    # substance at every depth - only the volume of the payload changes.
    if depth in ("standard", "deep"):
        structured.key_findings = _key_findings(routed, reference)
        structured.suggested_followups = _suggested_followups(routed)
        if audience == "analyst":
            structured.methodology = _methodology(bundle, reference.intent)
    if depth == "deep":
        structured.interpretation = list(reference.limitations)
        structured.methodology = _methodology(bundle, reference.intent)
        if reference.intent == "crop_comparison":
            structured.comparison = {"values": reference.evidence.get("values", {})}
        elif reference.intent == "period_comparison":
            structured.comparison = {"changes": reference.evidence.get("changes", {})}
        elif reference.intent == "district_ranking":
            structured.comparison = {"ranking": reference.evidence.get("ranking", [])}
        if reference.intent == "crop_trend":
            structured.trend = {
                "periods": reference.evidence.get("periods", []),
                "latest_period": reference.evidence.get("latest_period"),
                "latest_yield_kg_ha": reference.evidence.get("latest_yield_kg_ha"),
            }

    return structured
