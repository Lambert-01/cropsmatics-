"""Productivity tools: observations, gap, ranking and gap distribution.

Every function delegates to the existing service or analytics module. None of
them computes a new statistic, and none of them fills a gap in the published
data: a district a release did not tabulate simply produces no evidence item.
"""

from __future__ import annotations

import pandas as pd

from app.ai.evidence import EvidenceItem, EvidenceKind
from app.analytics.productivity_gap import compute_gaps
from app.schemas.filters import AnalyticsFilters, apply_filters
from app.services import analytics_service, period_service, productivity_service
from app.services.analytics_service import frame_period_code, frame_source_id, productivity_frame


def _selection(period_code: str | None, crop: str) -> pd.DataFrame:
    """The exact frame the grounded builders read for this selection.

    Deliberately routed through ``productivity_frame``/``apply_filters`` rather
    than reading the canonical panel directly. The builder resolves the legacy
    release for a period the training table covers and the panel for the others;
    if the evidence were gathered from a different table it could disagree with
    the answer, and the numeric guard would rightly reject a correct figure.
    """
    filters = AnalyticsFilters(period_code=period_code, crop=crop)
    frame = apply_filters(productivity_frame(filters), filters)
    if frame.empty:
        return frame
    return frame[frame["yield_kg_ha"].fillna(0) > 0].copy()


def _district_frame(period_code: str | None, crop: str) -> pd.DataFrame:
    """Published district rows for one crop, benchmarked across every district."""
    frame = _selection(period_code, crop)
    if frame.empty:
        return frame
    return compute_gaps(frame, strategy="national_crop_median")


def observations(*, period_code: str | None = None, crop: str, district: str | None = None) -> list[EvidenceItem]:
    """Published area/harvest/production/yield for a district x crop selection."""
    rows = _selection(period_code, crop)
    if district:
        rows = rows[rows["district"].astype(str).str.lower() == district.strip().lower()]
    if rows.empty:
        return []

    resolved = frame_period_code(rows) or period_code
    source_id = frame_source_id(rows)
    items: list[EvidenceItem] = []

    for _, row in rows.iterrows():
        name = str(row["district"])
        for metric, unit in (
            ("yield_kg_ha", "kg/ha"),
            ("harvested_area_ha", "ha"),
            ("production_mt", "metric tonnes"),
        ):
            value = row.get(metric)
            if value is None or pd.isna(value):
                continue
            items.append(
                EvidenceItem(
                    evidence_id=f"obs:{name}:{metric}:{resolved}",
                    kind=EvidenceKind.OFFICIAL,
                    metric=metric,
                    # Rounded only for presentation; the published cell is unchanged.
                    value=round(float(value), 4),
                    unit=unit,
                    period_code=resolved,
                    geography_level="district",
                    district=name,
                    province=None if pd.isna(row.get("province")) else str(row.get("province")),
                    crop=str(row.get("canonical_crop_name") or crop),
                    source_id=source_id,
                )
            )
    return items


def yield_gap(
    *, period_code: str | None = None, crop: str, district: str | None = None
) -> list[EvidenceItem]:
    """Observed yield against the national crop median for the same period."""
    frame = _district_frame(period_code, crop)
    if frame.empty:
        return []
    if district:
        frame = frame[frame["district"].astype(str).str.lower() == district.strip().lower()]
    if frame.empty:
        return []

    resolved = frame_period_code(frame) or period_code
    source_id = frame_source_id(frame)
    items: list[EvidenceItem] = []
    for _, row in frame.iterrows():
        name = str(row["district"])
        benchmark = row.get("benchmark_yield_kg_ha")
        gap = row.get("gap_index")
        if benchmark is not None and not pd.isna(benchmark):
            items.append(
                EvidenceItem(
                    evidence_id=f"benchmark:{name}:{resolved}",
                    kind=EvidenceKind.DERIVED,
                    metric="benchmark_yield_kg_ha",
                    value=round(float(benchmark), 4),
                    unit="kg/ha",
                    period_code=resolved,
                    geography_level="district",
                    district=name,
                    crop=crop,
                    source_id=source_id,
                    method="median of every published district for the crop in this period",
                )
            )
        if gap is not None and not pd.isna(gap):
            items.append(
                EvidenceItem(
                    evidence_id=f"gap:{name}:{resolved}",
                    kind=EvidenceKind.DERIVED,
                    metric="gap_index",
                    value=round(float(gap), 4),
                    unit="%",
                    period_code=resolved,
                    geography_level="district",
                    district=name,
                    crop=crop,
                    source_id=source_id,
                    method="100 * (benchmark - observed) / benchmark",
                )
            )
    return items


def district_ranking(
    *, period_code: str | None = None, crop: str, limit: int = 30
) -> list[EvidenceItem]:
    """Districts ranked by productivity gap for one crop and period."""
    frame = _district_frame(period_code, crop)
    if frame.empty:
        return []
    frame = frame.dropna(subset=["gap_index"]).sort_values("gap_index", ascending=False)
    frame = frame.head(limit)

    resolved = frame_period_code(frame) or period_code
    source_id = frame_source_id(frame)
    return [
        EvidenceItem(
            evidence_id=f"rank:{row['district']}:{resolved}",
            kind=EvidenceKind.DERIVED,
            metric="district_rank_by_gap_index",
            value=index + 1,
            unit="rank",
            period_code=resolved,
            geography_level="district",
            district=str(row["district"]),
            crop=crop,
            source_id=source_id,
            method="rank by yield gap index, descending",
            note=f"gap index {round(float(row['gap_index']), 2)}",
        )
        for index, (_, row) in enumerate(frame.iterrows())
    ]


def district_yield_ranking(
    *, period_code: str | None = None, crop: str, limit: int = 30
) -> list[EvidenceItem]:
    """Districts ranked by their observed yield, highest first."""
    frame = _selection(period_code, crop)
    if frame.empty:
        return []
    frame = frame.dropna(subset=["yield_kg_ha"]).sort_values(
        ["yield_kg_ha", "district"], ascending=[False, True]
    )
    frame = frame.head(limit)

    resolved = frame_period_code(frame) or period_code
    source_id = frame_source_id(frame)
    return [
        EvidenceItem(
            evidence_id=f"yield_rank:{row['district']}:{resolved}",
            kind=EvidenceKind.DERIVED,
            metric="district_rank_by_yield",
            value=round(float(row["yield_kg_ha"]), 4),
            unit="kg/ha",
            period_code=resolved,
            geography_level="district",
            district=str(row["district"]),
            crop=crop,
            source_id=source_id,
            method="rank by observed yield, descending",
            note=f"observed yield rank {index + 1}",
        )
        for index, (_, row) in enumerate(frame.iterrows())
    ]


def yield_distribution(*, period_code: str | None = None, crop: str) -> list[EvidenceItem]:
    """How many districts fall into each documented yield-gap band."""
    frame = _district_frame(period_code, crop)
    if frame.empty:
        return []
    resolved = frame_period_code(frame) or period_code
    source_id = frame_source_id(frame)
    ranks = frame[["district", "gap_index"]].dropna()
    bands = analytics_service.gap_distribution(ranks)
    return [
        EvidenceItem(
            evidence_id=f"band:{band['id']}:{resolved}",
            kind=EvidenceKind.DERIVED,
            metric=f"districts_in_{band['id']}",
            value=int(band["count"]),
            unit="districts",
            period_code=resolved,
            geography_level="district",
            crop=crop,
            source_id=source_id,
            method="count of districts whose median gap index falls in the band",
            note=f"{band['label']}; share {band['share_pct']}%",
        )
        for band in bands
    ]


def trend(*, crop: str, district: str | None = None, season: str | None = None) -> list[EvidenceItem]:
    """One crop across every published period, national or district."""
    try:
        result = productivity_service.crop_trend(crop=crop, district=district, season=season)
    except period_service.UnknownPeriodError:
        return []
    if result.get("missing"):
        return []

    source_id = result.get("source_id") or None
    items: list[EvidenceItem] = []
    for point in result.get("points", []):
        for metric, unit in (
            ("production_mt", "metric tonnes"),
            ("harvested_area_ha", "ha"),
            ("yield_kg_ha", "kg/ha"),
        ):
            value = (point.get("values") or {}).get(metric)
            if value is None:
                continue
            items.append(
                EvidenceItem(
                    evidence_id=f"trend:{crop}:{district or 'national'}:{point['period_code']}:{metric}",
                    kind=EvidenceKind.OFFICIAL,
                    metric=metric,
                    value=round(float(value), 4),
                    unit=unit,
                    period_code=point["period_code"],
                    geography_level="district" if district else "national",
                    district=district,
                    crop=crop,
                    source_id=source_id,
                )
            )
    return items


def legacy_observations(*, crop: str, district: str | None = None) -> list[EvidenceItem]:
    """The joined training table, used when no period is named.

    Kept because the default (no period) behaviour of the assistant reads this
    table, and changing that would silently change existing answers.
    """
    filters = AnalyticsFilters(crop=crop, district=district)
    frame = apply_filters(productivity_frame(filters), filters)
    frame = frame[frame["yield_kg_ha"].fillna(0) > 0]
    if frame.empty:
        return []
    period = frame_period_code(frame)
    source_id = frame_source_id(frame)
    return [
        EvidenceItem(
            evidence_id=f"legacy:{row['district']}:yield_kg_ha:{period}",
            kind=EvidenceKind.OFFICIAL,
            metric="yield_kg_ha",
            value=round(float(row["yield_kg_ha"]), 4),
            unit="kg/ha",
            period_code=period,
            geography_level="district",
            district=str(row["district"]),
            crop=str(row["canonical_crop_name"]),
            source_id=source_id,
        )
        for _, row in frame.iterrows()
    ]
