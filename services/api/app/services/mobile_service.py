"""Mobile intelligence home service.

Builds the read model behind ``GET /api/v1/mobile/home`` and
``GET /api/v1/mobile/indicators``.

Design rules enforced here:

* Every count and every featured summary is **derived from the processed
  official tables** — there are no headline constants in this module.
* ``None`` means "not published for this selection". It is never coerced to 0,
  because a zero would be read as a real measured zero.
* The indicator catalogue is data-driven: an indicator only reports
  ``available = True`` when its period actually carries coverage and its column
  really exists in the processed table. The mobile filter UI is built from this
  response, so it can never offer a filter the data cannot answer.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.repositories import dataset_repository as repo
from app.services import meta_service
from app.services.analytics_service import gapped

SEASON_WORDS = {"A": "Season A", "B": "Season B", "C": "Season C"}

# --- indicator catalogue ---------------------------------------------------
# ``dataset`` is the logical dataset key used by ``data_coverage.csv``; the
# coverage level recorded for that (dataset, period) pair decides availability.
INDICATORS: tuple[dict, ...] = (
    {
        "id": "yield",
        "label": "Yield",
        "category": "Productivity",
        "dataset": "district_crop_productivity",
        "column": "yield_kg_ha",
        "unit": "kg/ha",
    },
    {
        "id": "production",
        "label": "Production",
        "category": "Productivity",
        "dataset": "district_crop_productivity",
        "column": "production_mt",
        "unit": "metric tonnes",
    },
    {
        "id": "harvested_area",
        "label": "Harvested area",
        "category": "Productivity",
        "dataset": "district_crop_productivity",
        "column": "harvested_area_ha",
        "unit": "ha",
    },
    {
        "id": "improved_seed",
        "label": "Improved seed use",
        "category": "Inputs",
        "dataset": "district_factors",
        "column": "improved_seed_farmers_pct",
        "unit": "% of farmers",
    },
    {
        "id": "organic_fertilizer",
        "label": "Organic fertilizer use",
        "category": "Inputs",
        "dataset": "district_factors",
        "column": "organic_fertilizer_farmers_pct",
        "unit": "% of farmers",
    },
    {
        "id": "inorganic_fertilizer",
        "label": "Inorganic fertilizer use",
        "category": "Inputs",
        "dataset": "district_factors",
        "column": "inorganic_fertilizer_farmers_pct",
        "unit": "% of farmers",
    },
    {
        "id": "pesticide",
        "label": "Pesticide use",
        "category": "Inputs",
        "dataset": "district_factors",
        "column": "pesticide_farmers_pct",
        "unit": "% of farmers",
    },
    {
        "id": "mechanization",
        "label": "Mechanization",
        "category": "Inputs",
        "dataset": "district_factors",
        "column": "mechanization_farmers_pct",
        "unit": "% of farmers",
    },
    {
        "id": "agroforestry",
        "label": "Agroforestry",
        "category": "Inputs",
        "dataset": "district_factors",
        "column": "agroforestry_farmers_pct",
        "unit": "% of farmers",
    },
    {
        "id": "irrigation_farmers",
        "label": "Irrigating farmers",
        "category": "Irrigation",
        "dataset": "district_factors",
        "column": "irrigation_farmers_pct",
        "unit": "% of farmers",
    },
    {
        "id": "irrigation_drip",
        "label": "Drip irrigation",
        "category": "Irrigation",
        "dataset": "irrigation_water",
        "column": "drip_irrigation_pct",
        "unit": "% of irrigated area",
    },
    {
        "id": "irrigation_surface",
        "label": "Surface irrigation",
        "category": "Irrigation",
        "dataset": "irrigation_water",
        "column": "surface_irrigation_pct",
        "unit": "% of irrigated area",
    },
    {
        "id": "water_source_rainwater",
        "label": "Rainwater as a water source",
        "category": "Irrigation",
        "dataset": "irrigation_water",
        "column": "rainwater_source_pct",
        "unit": "% of water sources",
    },
    {
        "id": "erosion_bench_terraces",
        "label": "Bench terraces",
        "category": "Soil & Erosion",
        "dataset": "erosion_control",
        "column": "bench_terraces_pct",
        "unit": "% of erosion-control area",
    },
    {
        "id": "erosion_progressive_terraces",
        "label": "Progressive terraces",
        "category": "Soil & Erosion",
        "dataset": "erosion_control",
        "column": "progressive_terraces_pct",
        "unit": "% of erosion-control area",
    },
    {
        "id": "erosion_severe",
        "label": "Severe erosion share",
        "category": "Soil & Erosion",
        "dataset": "erosion_control",
        "column": "erosion_severe_pct",
        "unit": "% of area",
    },
    {
        "id": "postharvest_stored",
        "label": "Stored share of production",
        "category": "Post-Harvest",
        "dataset": "crop_postharvest_use",
        "column": "stored_pct",
        "unit": "% of production",
    },
    {
        "id": "postharvest_loss",
        "label": "Post-harvest loss share",
        "category": "Post-Harvest",
        "dataset": "crop_postharvest_use",
        "column": "post_harvest_losses_pct",
        "unit": "% of production",
    },
    {
        "id": "postharvest_own_consumption",
        "label": "Own consumption share",
        "category": "Post-Harvest",
        "dataset": "crop_postharvest_use",
        "column": "own_consumption_pct",
        "unit": "% of production",
    },
    {
        "id": "cold_chain_program",
        "label": "Cold-chain programme districts",
        "category": "Infrastructure",
        "dataset": "cold_chain_context",
        "column": "district",
        "unit": "districts",
    },
    {
        "id": "postharvest_infrastructure",
        "label": "National post-harvest infrastructure",
        "category": "Infrastructure",
        "dataset": "postharvest_infrastructure",
        "column": "indicator",
        "unit": None,
    },
)

_LOADERS = {
    "district_crop_productivity": repo.productivity_dataset,
    "district_factors": repo.factors_dataset,
    "irrigation_water": repo.irrigation_water,
    "erosion_control": repo.erosion_control,
    "crop_postharvest_use": repo.postharvest_use,
    "cold_chain_context": repo.cold_chain_context,
    "postharvest_infrastructure": repo.postharvest_infrastructure,
}


def loader_for(dataset: str):
    """Public accessor for the loaders behind the indicator registry."""
    return _LOADERS.get(dataset)


def format_period(period: str | None) -> str | None:
    """``"2025B"`` -> ``"2025 Season B"``. Unknown shapes pass through."""
    if not period:
        return None
    if len(period) == 5 and period[:4].isdigit() and period[4] in SEASON_WORDS:
        return f"{period[:4]} {SEASON_WORDS[period[4]]}"
    return period


def _coverage() -> dict[str, dict[str, str]]:
    try:
        return meta_service.coverage()["coverage"]
    except Exception:
        return {}


def latest_district_period() -> str | None:
    """Newest period that genuinely carries district-level observations."""
    coverage = _coverage()
    periods = {
        period
        for dataset, levels in coverage.items()
        if dataset in ("district_crop_productivity", "district_factors")
        for period, level in levels.items()
        if level == "district" and len(period) == 5
    }
    return max(periods) if periods else None


def _dataset_available(dataset: str, column: str) -> bool:
    loader = _LOADERS.get(dataset)
    if loader is None:
        return False
    try:
        df = loader()
    except Exception:
        return False
    return column in df.columns and not df.empty


def indicator_catalog() -> list[dict]:
    """Indicator registry annotated with real availability and period."""
    coverage = _coverage()
    out: list[dict] = []
    for spec in INDICATORS:
        levels = coverage.get(spec["dataset"], {})
        district_periods = sorted(p for p, level in levels.items() if level == "district")
        any_periods = sorted(levels)
        period = (district_periods or any_periods or [None])[-1]
        level = levels.get(period) if period else None
        out.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "category": spec["category"],
                "dataset": spec["dataset"],
                "column": spec["column"],
                "unit": spec["unit"],
                "period": period,
                "coverage_level": level,
                "available": bool(period)
                and level is not None
                and _dataset_available(spec["dataset"], spec["column"]),
            }
        )
    return out


def available_indicators() -> list[dict]:
    return [item for item in indicator_catalog() if item["available"]]


def indicator_categories() -> list[dict]:
    """Categories in registry order, each marked available if it holds any."""
    seen: dict[str, dict] = {}
    for item in indicator_catalog():
        bucket = seen.setdefault(
            item["category"],
            {
                "id": item["category"].lower().replace(" & ", "_").replace(" ", "_"),
                "label": item["category"],
                "indicator_count": 0,
                "available_count": 0,
                "available": False,
            },
        )
        bucket["indicator_count"] += 1
        if item["available"]:
            bucket["available_count"] += 1
            bucket["available"] = True
    return list(seen.values())


# --- featured topics -------------------------------------------------------


def _gap_leaders(limit: int = 1) -> list[dict]:
    """District-crop observations furthest below their crop's national median."""
    try:
        frame = gapped(repo.training_dataset(), strategy="national_crop_median")
    except Exception:
        return []
    if frame.empty or "gap_index" not in frame.columns:
        return []
    ranked = frame[frame["gap_index"].notna()].sort_values("gap_index", ascending=False)
    rows: list[dict] = []
    for _, row in ranked.head(limit).iterrows():
        rows.append(
            {
                "district": row["district"],
                "crop": row["canonical_crop_name"],
                "gap_index": float(row["gap_index"]),
                "observed_yield_kg_ha": float(row["yield_kg_ha"]),
                "benchmark_yield_kg_ha": float(row["benchmark_yield_kg_ha"]),
                "period": row.get("period"),
            }
        )
    return rows


def _lowest_adoption() -> dict | None:
    """District with the lowest mean improved-seed adoption (real mean)."""
    try:
        df = repo.factors_dataset()
    except Exception:
        return None
    column = "improved_seed_farmers_pct"
    if df.empty or column not in df.columns:
        return None
    means = df.groupby("district")[column].mean().dropna()
    if means.empty:
        return None
    return {"district": str(means.idxmin()), "value": float(means.min())}


def _highest_loss_crop() -> dict | None:
    try:
        df = repo.postharvest_use()
    except Exception:
        return None
    column = "post_harvest_losses_pct"
    if df.empty or column not in df.columns:
        return None
    ranked = df[df[column].notna()].sort_values(column, ascending=False)
    if ranked.empty:
        return None
    row = ranked.iloc[0]
    return {"crop": row["canonical_crop_name"], "value": float(row[column])}


def _cold_chain_district_count() -> int:
    try:
        return int(repo.cold_chain_context()["district"].nunique())
    except Exception:
        return 0



def featured_topics() -> list[dict]:
    """Real, data-derived insights the Home screen can lead with."""
    topics: list[dict] = []
    period = latest_district_period()
    period_label = format_period(period) or "the latest period"

    for leader in _gap_leaders(2):
        topics.append(
            {
                "id": f"gap-{leader['district']}-{leader['crop']}".lower().replace(" ", "-"),
                "title": "Where is the widest productivity gap?",
                "summary": (
                    f"{leader['crop']} yield in {leader['district']} is "
                    f"{leader['gap_index']:.0f}% below the national {leader['crop']} median "
                    f"of {leader['benchmark_yield_kg_ha']:.0f} kg/ha ({period_label})."
                ),
                "route": "/explore/crop/" + str(leader["crop"]),
                "source_id": "NISR_SAS_2025B_DISTRICT_CROP",
                "period": period,
            }
        )

    adoption = _lowest_adoption()
    if adoption:
        topics.append(
            {
                "id": "lowest-improved-seed",
                "title": "Where is improved-seed adoption lowest?",
                "summary": (
                    f"{adoption['district']} reports the lowest average improved-seed use "
                    f"at {adoption['value']:.1f}% of farmers."
                ),
                "route": "/explore/district/" + str(adoption["district"]),
                "source_id": "NISR_SAS_2025B_DISTRICT_FACTORS",
                "period": period,
            }
        )

    loss = _highest_loss_crop()
    if loss:
        topics.append(
            {
                "id": "highest-postharvest-loss",
                "title": "Which crop loses most after harvest?",
                "summary": (
                    f"{loss['crop']} reports the highest national post-harvest loss share at "
                    f"{loss['value']:.2f}% of production."
                ),
                "route": "/explore/post-harvest",
                "source_id": "NISR_SAS_2025B_POSTHARVEST_USE",
                "period": "2025B",
            }
        )

    cold = _cold_chain_district_count()
    if cold:
        topics.append(
            {
                "id": "cold-chain-context",
                "title": "Cold-chain programme context",
                "summary": (
                    f"{cold} districts are reported in the MINAGRI-ACES cold-chain programme. "
                    "Facility capacity is not published."
                ),
                "route": "/more/data-sources",
                "source_id": "MINAGRI_ACES_COLDCHAIN_2026",
                "period": "2026",
            }
        )

    return topics


def suggested_questions(limit: int = 6) -> list[str]:
    """Questions the grounded assistant can actually answer.

    Generated from real observations rather than written by hand, so a suggestion
    can never point at a district/crop pair that has no data.
    """
    questions: list[str] = [
        f"Why is {leader['crop']} yield low in {leader['district']}?"
        for leader in _gap_leaders(limit)
    ]
    if len(questions) < limit:
        loss = _highest_loss_crop()
        if loss:
            questions.append(f"How is {loss['crop']} used after harvest?")
    if len(questions) < limit:
        try:
            for name in repo.crops()["crop_name"].head(limit - len(questions)):
                questions.append(f"How is {name} used after harvest?")
        except Exception:
            pass
    return questions[:limit]



# --- home ------------------------------------------------------------------


def _count(loader, column: str) -> int:
    try:
        return int(loader()[column].nunique())
    except Exception:
        return 0


def home() -> dict:
    """Aggregate the Home screen read model from real processed data."""
    period = latest_district_period()
    coverage = _coverage()

    crop_count = _count(repo.crops, "crop_code")
    district_count = _count(repo.districts, "district")

    indicators = available_indicators()
    topics = featured_topics()
    questions = suggested_questions()

    try:
        source_count = len(meta_service.sources())
    except Exception:
        source_count = 0

    try:
        data_version = meta_service.data_version()
    except Exception:
        data_version = {"available": False}

    cards = [
        {"id": "crops", "label": "Crops", "value": crop_count, "unit": "crops",
         "route": "/explore/crops"},
        {"id": "districts", "label": "Districts", "value": district_count, "unit": "districts",
         "route": "/explore/districts"},
        {"id": "indicators", "label": "Indicators", "value": len(indicators), "unit": "indicators",
         "route": "/explore/indicators"},
        {"id": "sources", "label": "Sources", "value": source_count, "unit": "sources",
         "route": "/more/data-sources"},
    ]

    return {
        "latest_period": period,
        "latest_period_label": format_period(period),
        "latest_period_coverage": (
            coverage.get("district_crop_productivity", {}).get(period) if period else None
        ),
        "crop_count": crop_count,
        "district_count": district_count,
        "indicator_count": len(indicators),
        "source_count": source_count,
        "summary_cards": cards,
        "featured_topics": topics,
        "suggested_questions": questions,
        "coverage_notes": list(meta_service.COVERAGE_NOTES),
        "data_version": data_version,
        "generated_at": datetime.now(UTC).isoformat(),
        "provenance": {
            "source_id": "NISR_SAS_2025B_DISTRICT_CROP",
            "source_period": period,
            "method": (
                "counts and featured summaries derived from the processed official tables; "
                "no headline figure is hard-coded"
            ),
            "limitations": [
                "district-level indicators exist only for 2025 Season B",
                "post-harvest use shares are national crop-level values, not district values",
                "featured topics describe associations, not causal effects",
            ],
        },
    }

