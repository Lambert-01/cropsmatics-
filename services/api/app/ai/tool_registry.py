"""The allow-listed tool registry.

This is the *only* surface available to a model. There is no ``eval``, no shell,
no SQL, no filesystem write and no dynamic import reachable from here - a model
chooses from a fixed set of functions, each with a strict Pydantic parameter
schema, and anything else is rejected.

``extra="forbid"`` on every parameter model is deliberate. A model that invents a
parameter gets a validation error rather than a silently altered query, which is
the difference between "the tool ignored you" and "the tool refused you".
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from app.ai.evidence import EvidenceItem
from app.ai.tools import analysis as analysis_tools
from app.ai.tools import comparison as comparison_tools
from app.ai.tools import context as context_tools
from app.ai.tools import knowledge as knowledge_tools
from app.ai.tools import metadata as metadata_tools
from app.ai.tools import productivity as productivity_tools


class _StrictParams(BaseModel):
    """Base for tool parameters: unknown keys are an error, not a no-op."""

    model_config = ConfigDict(extra="forbid")


class PeriodCropParams(_StrictParams):
    period_code: str | None = Field(None, description="published period, e.g. 2026B")
    crop: str = Field(min_length=1, max_length=80)


class PeriodCropDistrictParams(PeriodCropParams):
    district: str | None = Field(None, max_length=80)


class RankingParams(PeriodCropParams):
    limit: int = Field(30, ge=1, le=120)


class CropParams(_StrictParams):
    crop: str = Field(min_length=1, max_length=80)


class DistrictParams(_StrictParams):
    district: str = Field(min_length=1, max_length=80)
    period_code: str | None = None


class DistrictComparisonParams(_StrictParams):
    """Two to four districts compared in one published period."""

    districts: list[str] = Field(min_length=2, max_length=4)
    crop: str | None = Field(None, max_length=80)
    period_code: str | None = None


class TrendParams(_StrictParams):
    crop: str = Field(min_length=1, max_length=80)
    district: str | None = None
    season: str | None = Field(None, pattern="^[ABCabc]$")


class SourceParams(_StrictParams):
    source_id: str | None = None


class ForecastParams(_StrictParams):
    crop: str | None = Field(None, max_length=80)
    district: str | None = Field(None, max_length=80)
    season: str | None = Field(None, pattern="^[ABCabc]$")
    period_code: str | None = Field(None, pattern=r"^\d{4}[ABCabc]$")


class RegistryQueryParams(_StrictParams):
    query: str | None = None


class IndicatorParams(_StrictParams):
    indicator_ids: list[str] = Field(min_length=1, max_length=3)


class CropsParams(_StrictParams):
    """Two to four crops compared in one period."""

    crops: list[str] = Field(min_length=2, max_length=4)
    period_code: str | None = Field(None, description="published period, e.g. 2026B")


class FactorParams(_StrictParams):
    crop: str = Field(min_length=1, max_length=80)
    district: str | None = Field(None, max_length=80)


class OptionalIndicatorParams(_StrictParams):
    indicator_ids: list[str] | None = Field(None, max_length=3)


class KnowledgeParams(_StrictParams):
    query: str = Field(min_length=2, max_length=300)
    limit: int = Field(4, ge=1, le=8)


class NoParams(_StrictParams):
    """A tool that takes no parameters at all."""


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    params_model: type[BaseModel]
    fn: Callable[..., list[EvidenceItem]]
    #: Whether calling the tool reaches the network. All are local today.
    network: bool = False


TOOL_REGISTRY: dict[str, ToolSpec] = {
    spec.name: spec
    for spec in (
        ToolSpec(
            name="get_productivity_observations",
            description=(
                "Published area, harvest, production and yield for one crop, optionally "
                "one district, in one published period."
            ),
            params_model=PeriodCropDistrictParams,
            fn=productivity_tools.observations,
        ),
        ToolSpec(
            name="get_yield_gap",
            description=(
                "Observed yield against the national crop median for the same period, "
                "with the productivity gap index."
            ),
            params_model=PeriodCropDistrictParams,
            fn=productivity_tools.yield_gap,
        ),
        ToolSpec(
            name="get_district_ranking",
            description="Districts ranked by productivity gap for one crop and period.",
            params_model=RankingParams,
            fn=productivity_tools.district_ranking,
        ),
        ToolSpec(
            name="get_district_yield_ranking",
            description="Districts ranked by observed yield, highest first, for one crop and period.",
            params_model=RankingParams,
            fn=productivity_tools.district_yield_ranking,
        ),
        ToolSpec(
            name="get_yield_distribution",
            description="How many districts fall into each documented yield-gap band.",
            params_model=PeriodCropParams,
            fn=productivity_tools.yield_distribution,
        ),
        ToolSpec(
            name="get_crop_trend",
            description="One crop across every published period, national or district.",
            params_model=TrendParams,
            fn=productivity_tools.trend,
        ),
        ToolSpec(
            name="get_crop_context",
            description=(
                "Published national totals for one crop in one period. Never a sum of "
                "district rows."
            ),
            params_model=PeriodCropParams,
            fn=context_tools.crop_context,
        ),
        ToolSpec(
            name="get_district_context",
            description=(
                "Crops with published data in a district, the largest by production, and "
                "reported practice adoption."
            ),
            params_model=DistrictParams,
            fn=context_tools.district_context,
        ),
        ToolSpec(
            name="get_district_comparison",
            description=(
                "Side-by-side published context for two to four districts. With a crop, "
                "returns that crop's observed yield, benchmark and gap for each district."
            ),
            params_model=DistrictComparisonParams,
            fn=context_tools.district_comparison,
        ),
        ToolSpec(
            name="get_postharvest_profile",
            description="National post-harvest use shares for one crop.",
            params_model=CropParams,
            fn=context_tools.postharvest_profile,
        ),
        ToolSpec(
            name="get_national_indicator",
            description=(
                "National mean of an indicator whose published rows can be averaged, "
                "with its observation count. Refuses indicators that cannot be averaged."
            ),
            params_model=IndicatorParams,
            fn=context_tools.national_indicator,
        ),
        ToolSpec(
            name="get_source_metadata",
            description="Registered sources, so a provenance statement cites a real source.",
            params_model=SourceParams,
            fn=metadata_tools.source_metadata,
        ),
        ToolSpec(
            name="get_model_metadata",
            description=(
                "Registered model cards with their validation metrics. Empty when no model "
                "is registered."
            ),
            params_model=NoParams,
            fn=metadata_tools.model_metadata,
        ),
        ToolSpec(
            name="get_forecast_status",
            description=(
                "The forecast publication decision: whether a validated next-season forecast "
                "exists, and for a published target its period, unit, estimate and interval. "
                "Returns the backtest's verdict verbatim and never produces a forecast."
            ),
            params_model=ForecastParams,
            fn=metadata_tools.forecast_status,
        ),
        ToolSpec(
            name="get_crop_comparison",
            description=(
                "Published national totals for two to four crops in the same period, for a "
                "side-by-side comparison."
            ),
            params_model=CropsParams,
            fn=comparison_tools.crop_comparison,
        ),
        ToolSpec(
            name="get_period_change",
            description=(
                "Same-season, previous-year change for one crop (2026B vs 2025B). Never "
                "compares two different seasons."
            ),
            params_model=PeriodCropDistrictParams,
            fn=comparison_tools.period_change,
        ),
        ToolSpec(
            name="get_factor_associations",
            description=(
                "Correlation between district practice adoption and observed yield for one "
                "crop. An association, never a causal effect."
            ),
            params_model=FactorParams,
            fn=analysis_tools.factor_associations,
        ),
        ToolSpec(
            name="get_data_coverage",
            description="Published periods, their coverage level and how many districts they carry.",
            params_model=NoParams,
            fn=analysis_tools.data_coverage,
        ),
        ToolSpec(
            name="get_indicator_definitions",
            description="Indicator definitions: what each indicator means, its unit and its aggregation policy.",
            params_model=OptionalIndicatorParams,
            fn=analysis_tools.indicator_definitions,
        ),
        ToolSpec(
            name="search_knowledge_base",
            description=(
                "Retrieve explanatory Cropmatics documents (methodology, glossary, "
                "season rules, data policy, FAQ). Explanatory only - it never returns "
                "a numerical observation."
            ),
            params_model=KnowledgeParams,
            fn=knowledge_tools.search_knowledge_base,
        ),
    )
}

#: Tools the orchestrator may call for a given intent. This is the allow-list.
INTENT_TOOLS: dict[str, tuple[str, ...]] = {
    "district_crop_gap": (
        "get_productivity_observations",
        "get_yield_gap",
        "get_district_ranking",
        "get_yield_distribution",
    ),
    "crop_national_context": ("get_crop_context", "get_postharvest_profile", "get_crop_trend"),
    "district_context": ("get_district_context",),
    "district_comparison": ("get_district_comparison",),
    "national_indicator": ("get_national_indicator",),
    "crop_comparison": ("get_crop_comparison",),
    "period_comparison": ("get_period_change", "get_crop_context"),
    "district_ranking": ("get_district_ranking", "get_yield_gap"),
    "district_yield_ranking": ("get_district_yield_ranking",),
    "crop_trend": ("get_crop_trend",),
    "practice_associations": ("get_factor_associations", "get_productivity_observations"),
    "postharvest_analysis": ("get_postharvest_profile",),
    "data_coverage": ("get_data_coverage", "get_source_metadata"),
    "source_provenance": ("get_source_metadata", "search_knowledge_base"),
    "methodology": (
        "get_indicator_definitions",
        "get_source_metadata",
        "get_model_metadata",
        "search_knowledge_base",
    ),
    # A forecast question is answerable *only* through the publication gate. The
    # model may explain a published forecast, or explain why none is published —
    # it can never supply one, because no other tool returns a future value.
    "forecast_status": ("get_forecast_status", "get_source_metadata"),
    "unsupported": (),
}


class UnknownToolError(KeyError):
    """Raised when a tool name is not in the allow-list."""


def get(name: str) -> ToolSpec:
    if name not in TOOL_REGISTRY:
        raise UnknownToolError(
            f"tool {name!r} is not registered; available: {sorted(TOOL_REGISTRY)}"
        )
    return TOOL_REGISTRY[name]


def describe() -> list[dict]:
    """The catalogue a model would be shown: names, descriptions, parameters."""
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.params_model.model_json_schema(),
            "network": spec.network,
        }
        for spec in TOOL_REGISTRY.values()
    ]


def openai_tool_schemas() -> list[dict]:
    """The allow-listed tools in OpenAI function-calling form.

    This is the *only* way a model is told what it may call, and it is derived
    from the same registry the executor validates against - so the catalogue a
    model sees and the set of functions that can actually run cannot drift.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": spec.name,
                "description": spec.description,
                "parameters": spec.params_model.model_json_schema(),
            },
        }
        for spec in TOOL_REGISTRY.values()
    ]


def validate_params(name: str, params: dict) -> BaseModel:
    """Validate parameters against the tool's strict schema.

    Raises ``pydantic.ValidationError`` for an unknown key, a wrong type or an
    out-of-range value, so a hallucinated parameter cannot reach a service.
    """
    return get(name).params_model(**params)


def call(name: str, params: dict) -> list[EvidenceItem]:
    """Validate then execute one tool. The only way a tool is ever invoked."""
    validated = validate_params(name, params)
    return get(name).fn(**validated.model_dump())
