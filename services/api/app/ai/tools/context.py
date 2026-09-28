"""Context tools: national crop context, district context, post-harvest shares.

These read published national totals and the single-release district tables. They
never aggregate districts into a national figure and never produce a cross-crop
yield mean, because both would be invented statistics.
"""

from __future__ import annotations

import pandas as pd

from app.ai.evidence import EvidenceItem, EvidenceKind
from app.ai.grounded import indicator_aggregate
from app.repositories import dataset_repository as repo
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import (
    mobile_service,
    postharvest_service,
    productivity_service,
    trend_service,
)
from app.services.analytics_service import frame_period_code, frame_source_id, productivity_frame

#: Adoption columns worth carrying as evidence, with the release they come from.
PRACTICE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("improved_seed_farmers_pct", "improved seed use"),
    ("inorganic_fertilizer_farmers_pct", "inorganic fertiliser use"),
    ("organic_fertilizer_farmers_pct", "organic fertiliser use"),
    ("pesticide_farmers_pct", "pesticide use"),
    ("erosion_protection_farmers_pct", "erosion protection"),
    ("mechanization_farmers_pct", "mechanization"),
    ("irrigation_farmers_pct", "irrigation"),
    ("agroforestry_farmers_pct", "agroforestry"),
)


def crop_context(*, crop: str, period_code: str | None = None) -> list[EvidenceItem]:
    """Published national totals for one crop in one period."""
    if period_code:
        try:
            result = productivity_service.crop_trend(crop=crop)
        except Exception:
            return []
        if result.get("missing"):
            return []
        point = next(
            (p for p in result.get("points", []) if p["period_code"] == period_code), None
        )
        if point is None:
            return []
        values = point.get("values") or {}
        resolved = period_code
        source_id = result.get("source_id") or None
        level = "national"
    else:
        try:
            points = trend_service.crop_trends(crop).get("points") or []
        except Exception:
            return []
        if not points:
            return []
        latest = points[-1]
        values = latest.get("values") or {}
        resolved = str(latest.get("period") or "") or None
        source_id = "NISR_SAS_2024_2026_NATIONAL_TRENDS"
        level = "national crop-level"

    items: list[EvidenceItem] = []
    for metric, unit, key in (
        ("production_mt", "metric tonnes", "production_mt"),
        ("harvested_area_ha", "ha", "harvested_area_ha"),
        ("yield_kg_ha", "kg/ha", "yield_kg_ha"),
        ("yield_mt_ha", "t/ha", "yield_mt_ha"),
    ):
        value = values.get(key)
        if value is None:
            continue
        items.append(
            EvidenceItem(
                evidence_id=f"crop:{crop}:{resolved}:{metric}",
                kind=EvidenceKind.OFFICIAL,
                metric=metric,
                value=round(float(value), 4),
                unit=unit,
                period_code=resolved,
                geography_level=level,
                crop=crop,
                source_id=source_id,
            )
        )
    return items


def district_context(*, district: str, period_code: str | None = None) -> list[EvidenceItem]:
    """Crops with published data in a district, plus the biggest by production."""
    filters = AnalyticsFilters(period_code=period_code, district=district)
    try:
        productive = apply_filters(productivity_frame(filters), filters)
    except Exception:
        return []

    rows = productive[productive["district"] == district]
    has_data = rows[rows[["production_mt", "harvested_area_ha"]].fillna(0).sum(axis=1) > 0]
    if has_data.empty:
        return []

    resolved = frame_period_code(productive) or period_code
    source_id = frame_source_id(productive)
    items = [
        EvidenceItem(
            evidence_id=f"district:{district}:n_crops_with_data:{resolved}",
            kind=EvidenceKind.DERIVED,
            metric="n_crops_with_data",
            value=int(has_data["canonical_crop_name"].nunique()),
            unit="crops",
            period_code=resolved,
            geography_level="district",
            district=district,
            source_id=source_id,
            method="count of crops carrying production or harvested area",
        )
    ]

    for _, row in (
        has_data.dropna(subset=["production_mt"])
        .sort_values("production_mt", ascending=False)
        .head(3)
        .iterrows()
    ):
        items.append(
            EvidenceItem(
                evidence_id=f"district:{district}:production:{row['canonical_crop_name']}:{resolved}",
                kind=EvidenceKind.OFFICIAL,
                metric="production_mt",
                value=round(float(row["production_mt"]), 4),
                unit="metric tonnes",
                period_code=resolved,
                geography_level="district",
                district=district,
                crop=str(row["canonical_crop_name"]),
                source_id=source_id,
            )
        )

    try:
        factors = repo.factors_dataset()
        factors = factors[factors["district"] == district]
        factor_row = factors.iloc[0] if not factors.empty else None
    except Exception:
        factor_row = None

    if factor_row is not None:
        for column, label in PRACTICE_COLUMNS:
            value = factor_row.get(column)
            if value is None or pd.isna(value):
                continue
            items.append(
                EvidenceItem(
                    evidence_id=f"district:{district}:{column}:2025B",
                    kind=EvidenceKind.OFFICIAL,
                    metric=column,
                    value=round(float(value), 4),
                    unit="% of farmers",
                    # The practice survey is a single release, so the period is
                    # stated as 2025B rather than borrowed from the selection.
                    period_code="2025B",
                    geography_level="district",
                    district=district,
                    source_id="NISR_SAS_2025B_DISTRICT_FACTORS",
                    note=f"{label}; 2025 Season B district practice survey",
                )
            )
    return items


def national_indicator(*, indicator_ids: list[str]) -> list[EvidenceItem]:
    """National mean of one or more indicators, from their published district rows.

    Only indicators the catalogue declares ``mean`` are aggregatable; a
    crop-required indicator (yield) is refused here rather than averaged across
    biologically different crops.
    """
    catalog = {item["id"]: item for item in mobile_service.indicator_catalog()}
    items: list[EvidenceItem] = []

    for indicator_id in indicator_ids[:3]:
        spec = catalog.get(indicator_id)
        if spec is None or not spec.get("available"):
            continue
        aggregate = indicator_aggregate(spec)
        if aggregate is None:
            continue

        base = {
            "period_code": aggregate.get("period"),
            "geography_level": aggregate.get("coverage_level"),
            "source_id": "NISR_SAS_2025B_DISTRICT_CROP",
        }
        items.append(
            EvidenceItem(
                evidence_id=f"indicator:{indicator_id}:mean",
                kind=EvidenceKind.DERIVED,
                metric=indicator_id,
                value=aggregate["mean"],
                unit=aggregate.get("unit"),
                method="unweighted mean of the published district rows",
                note=aggregate.get("label"),
                **base,
            )
        )
        items.append(
            EvidenceItem(
                evidence_id=f"indicator:{indicator_id}:n",
                kind=EvidenceKind.DERIVED,
                metric=f"{indicator_id}_n_observations",
                value=aggregate["n_observations"],
                unit="observations",
                method="count of published district rows behind the mean",
                **base,
            )
        )
        for bound in ("lowest", "highest"):
            value = aggregate.get(f"{bound}_value")
            if value is None:
                continue
            items.append(
                EvidenceItem(
                    evidence_id=f"indicator:{indicator_id}:{bound}",
                    kind=EvidenceKind.DERIVED,
                    metric=f"{indicator_id}_{bound}_district_value",
                    value=value,
                    unit=aggregate.get("unit"),
                    district=aggregate.get(f"{bound}_district"),
                    method="extreme district mean for this indicator",
                    **base,
                )
            )
    return items


def postharvest_profile(*, crop: str) -> list[EvidenceItem]:
    """National post-harvest use shares for one crop."""
    try:
        crops = postharvest_service.summary(crop=crop).get("crops") or []
    except Exception:
        return []
    if not crops:
        return []

    row = crops[0]
    resolved = str(row.get("period") or "2025B")
    items: list[EvidenceItem] = []
    for key, label in (
        ("sold_pct", "sold"),
        ("own_consumption_pct", "kept for household consumption"),
        ("stored_pct", "stored"),
        ("post_harvest_losses_pct", "reported as post-harvest loss"),
        ("seeds_pct", "kept as seed"),
        ("fodder_pct", "used as fodder"),
        ("other_usage_pct", "other use"),
    ):
        value = row.get(key)
        if value is None or pd.isna(value):
            continue
        items.append(
            EvidenceItem(
                evidence_id=f"postharvest:{crop}:{key}",
                kind=EvidenceKind.OFFICIAL,
                metric=key,
                value=round(float(value), 4),
                unit="% of production",
                period_code=resolved,
                geography_level="national crop-level",
                crop=crop,
                source_id="NISR_SAS_2025B_POSTHARVEST_USE",
                note=label,
            )
        )
    return items
