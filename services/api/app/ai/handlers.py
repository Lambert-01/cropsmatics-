"""Map a routed request onto each tool's parameters.

Kept separate from ``evidence_builder`` so the builder is about assembly only, and
so this mapping can be read on its own when asking "what would this question
actually retrieve?".

A handler returns ``None`` when the tool is genuinely not applicable - for example
a period-benchmarked tool when the question named no crop. Returning ``None`` is
preferable to inventing a parameter, because a tool that runs with a fabricated
argument produces evidence nobody asked for.
"""

from __future__ import annotations

from app.ai.schemas import RoutedRequest

#: Default cap on ranked districts, so one question cannot pull the whole panel.
DEFAULT_RANK_LIMIT = 30


def _period_crop(routed: RoutedRequest) -> dict | None:
    if not routed.crop:
        return None
    return {"period_code": routed.requested_period, "crop": routed.crop}


def _period_crop_district(routed: RoutedRequest) -> dict | None:
    if not routed.crop:
        return None
    return {
        "period_code": routed.requested_period,
        "crop": routed.crop,
        "district": routed.district,
    }


def _trend(routed: RoutedRequest) -> dict | None:
    """`get_crop_trend` spans every published period, so it takes no period argument.

    Forwarding the routed period here was an invented parameter: `TrendParams`
    declares only ``crop``, ``district`` and ``season``, and its strict schema
    refuses unknown keys, so *every* planned trend retrieval failed validation and
    its evidence was dropped. The trend intent therefore retrieved nothing at all.
    Only the arguments the tool actually declares are passed on.
    """
    if not routed.crop:
        return None
    return {"crop": routed.crop, "district": routed.district}


def _period_crop_rank(routed: RoutedRequest) -> dict | None:
    if not routed.crop:
        return None
    return {
        "period_code": routed.requested_period,
        "crop": routed.crop,
        "limit": DEFAULT_RANK_LIMIT,
    }


def _crop(routed: RoutedRequest) -> dict | None:
    return {"crop": routed.crop} if routed.crop else None


def _district(routed: RoutedRequest) -> dict | None:
    if not routed.district:
        return None
    return {"district": routed.district, "period_code": routed.requested_period}


def _districts(routed: RoutedRequest) -> dict | None:
    districts = [district for district in routed.districts if district]
    if len(districts) < 2:
        return None
    return {
        "districts": districts[:4],
        "crop": routed.crop,
        "period_code": routed.requested_period,
    }


def _indicators(routed: RoutedRequest) -> dict | None:
    return {"indicator_ids": routed.indicator_ids} if routed.indicator_ids else None


def _crops(routed: RoutedRequest) -> dict | None:
    crops = [crop for crop in (routed.crops or ([routed.crop] if routed.crop else [])) if crop]
    if len(crops) < 2:
        return None
    return {"crops": crops[:4], "period_code": routed.requested_period}


def _period_change(routed: RoutedRequest) -> dict | None:
    if not routed.crop:
        return None
    return {
        "crop": routed.crop,
        "period_code": routed.requested_period,
        "district": routed.district,
    }


def _factor(routed: RoutedRequest) -> dict | None:
    if not routed.crop:
        return None
    return {"crop": routed.crop, "district": routed.district}


def _optional_indicators(routed: RoutedRequest) -> dict:
    return {"indicator_ids": routed.indicator_ids or None}


def _knowledge(routed: RoutedRequest) -> dict:
    return {"query": routed.question, "limit": 4}


def _no_params(routed: RoutedRequest) -> dict:
    return {}


def _forecast(routed: RoutedRequest) -> dict:
    return {
        "crop": routed.crop, "district": routed.district,
        "period_code": routed.requested_period,
    }


HANDLERS: dict[str, callable] = {
    "get_productivity_observations": _period_crop_district,
    "get_yield_gap": _period_crop_district,
    "get_district_ranking": _period_crop_rank,
    "get_district_yield_ranking": _period_crop_rank,
    "get_yield_distribution": _period_crop,
    "get_crop_trend": _trend,
    "get_crop_context": _period_crop,
    "get_district_context": _district,
    "get_district_comparison": _districts,
    "get_postharvest_profile": _crop,
    "get_national_indicator": _indicators,
    "get_source_metadata": _no_params,
    "get_model_metadata": _no_params,
    "get_crop_comparison": _crops,
    "get_period_change": _period_change,
    "get_factor_associations": _factor,
    "get_data_coverage": _no_params,
    "get_indicator_definitions": _optional_indicators,
    "search_knowledge_base": _knowledge,
    "get_forecast_status": _forecast,
}
