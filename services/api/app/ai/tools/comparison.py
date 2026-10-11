"""Comparison tools: several crops side by side, and same-season change.

Both delegate to the existing services. A comparison is never a new statistic: it
places verified national totals next to each other so the *same* published figures
that a crop page shows are what a comparison shows.

Same-season change obeys the platform rule that seasons are not comparable in
sequence. Only ``2026B`` vs ``2025B`` is a comparison; ``2026A`` vs ``2026B`` is
two different seasons and is not computed.
"""

from __future__ import annotations

from app.ai.evidence import EvidenceItem, EvidenceKind
from app.ai.tools import context as context_tools
from app.services import national_board_service as board

#: Hard cap on crops in one comparison. Beyond this the chart stops being readable
#: and the answer stops being useful, so the request is refused rather than served.
MAX_COMPARISON_CROPS = 4


def crop_comparison(*, crops: list[str], period_code: str | None = None) -> list[EvidenceItem]:
    """Published national totals for two to four crops in one period.

    Each crop's figures come from the same ``crop_context`` tool a single-crop
    question uses, so a comparison can never disagree with the individual crop
    answer it is made of.
    """
    selected = [crop for crop in crops if crop]
    if len(selected) < 2:
        return []

    items: list[EvidenceItem] = []
    for crop in selected[:MAX_COMPARISON_CROPS]:
        items.extend(context_tools.crop_context(crop=crop, period_code=period_code))
    return items


def period_change(
    *, crop: str, period_code: str | None = None, district: str | None = None
) -> list[EvidenceItem]:
    """Same-season, previous-year change for one crop's national series.

    ``district`` is accepted for interface symmetry but the national board carries
    no district dimension, so a district-specific comparison is not fabricated
    here; the caller is told there is no published observation for that selection.
    """
    if district:
        return []

    try:
        result = board.board([crop])
    except Exception:
        return []

    row = next(
        (item for item in result.get("crops", []) if str(item.get("crop", "")).lower() == crop.lower()),
        None,
    )
    if row is None:
        return []

    axis: list[str] = list(result.get("periods", []))
    if period_code and period_code in axis:
        axis = axis[: axis.index(period_code) + 1]

    units = result.get("metric_units", {})
    items: list[EvidenceItem] = []
    for metric, series in (row.get("series") or {}).items():
        if len(series) < len(axis):
            series = series[: len(axis)]
        change = board.same_season_change(list(series), axis, metric, units.get(metric))
        if not change.get("available"):
            continue
        unit = units.get(metric)
        period = change.get("period_code")
        previous = change.get("previous_period_code")

        items.append(
            EvidenceItem(
                evidence_id=f"change:{crop}:{metric}:{period}:current",
                kind=EvidenceKind.OFFICIAL,
                metric=metric,
                value=round(float(change["current_value"]), 4),
                unit=unit,
                period_code=period,
                geography_level="national",
                crop=crop,
                source_id="NISR_SAS_2024_2026_NATIONAL_TRENDS",
            )
        )
        items.append(
            EvidenceItem(
                evidence_id=f"change:{crop}:{metric}:{previous}:previous",
                kind=EvidenceKind.OFFICIAL,
                metric=metric,
                value=round(float(change["previous_value"]), 4),
                unit=unit,
                period_code=previous,
                geography_level="national",
                crop=crop,
                source_id="NISR_SAS_2024_2026_NATIONAL_TRENDS",
            )
        )
        items.append(
            EvidenceItem(
                evidence_id=f"change:{crop}:{metric}:{period}:pct",
                kind=EvidenceKind.DERIVED,
                metric=f"{metric}_change_pct",
                value=round(float(change["change_pct"]), 4),
                unit="%",
                period_code=period,
                geography_level="national",
                crop=crop,
                source_id="NISR_SAS_2024_2026_NATIONAL_TRENDS",
                method=(
                    f"same-season percentage change, {previous} to {period}, "
                    "100 * (current - previous) / |previous|"
                ),
            )
        )
    return items
