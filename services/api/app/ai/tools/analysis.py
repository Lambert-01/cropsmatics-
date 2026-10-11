"""Analytical and explanatory tools.

Three groups:

* ``factor_associations`` - observed correlation between district practice
  adoption and yield. Emitted only as an **association**, never as causation;
  ``method`` records the estimator so a reader can audit the claim.
* ``data_coverage`` - which periods exist and at which geographic level, so
  "what data do you have?" is answerable from the catalogue rather than from a
  hard-coded list.
* ``indicator_definitions`` - the data dictionary: what an indicator means, its
  unit and how (if at all) it may be aggregated.

None of these reads a value that another tool would compute differently.
"""

from __future__ import annotations

from app.ai.evidence import EvidenceItem, EvidenceKind
from app.schemas.filters import AnalyticsFilters
from app.services import analytics_service, mobile_service, period_service


def factor_associations(*, crop: str, district: str | None = None) -> list[EvidenceItem]:
    """Correlation of district practice adoption with observed yield for a crop."""
    filters = AnalyticsFilters(crop=crop, district=district)
    try:
        result = analytics_service.factor_associations(filters)
    except Exception:
        return []

    items: list[EvidenceItem] = []
    for factor in result.get("factors", []):
        correlation = factor.get("correlation")
        if correlation is None:
            continue
        column = str(factor.get("factor"))
        items.append(
            EvidenceItem(
                evidence_id=f"association:{crop}:{column}:corr",
                kind=EvidenceKind.DERIVED,
                metric=f"association_{column}",
                value=round(abs(float(correlation)), 4),
                unit="correlation",
                geography_level="district",
                district=district,
                crop=crop,
                source_id="NISR_SAS_2025B_DISTRICT_FACTORS",
                method=(
                    "Pearson correlation between observed district yield and reported "
                    "practice adoption; an association, not a causal effect"
                ),
                note=str(factor.get("label") or column),
            )
        )
        items.append(
            EvidenceItem(
                evidence_id=f"association:{crop}:{column}:n",
                kind=EvidenceKind.DERIVED,
                metric=f"association_{column}_n",
                value=int(factor.get("n_observations") or 0),
                unit="observations",
                geography_level="district",
                crop=crop,
                source_id="NISR_SAS_2025B_DISTRICT_FACTORS",
                method="count of district observations behind the correlation",
            )
        )
    return items


def data_coverage() -> list[EvidenceItem]:
    """Published periods, their coverage level, and how much they carry."""
    try:
        catalog = period_service.catalog()
    except Exception:
        return []

    items: list[EvidenceItem] = []
    for entry in catalog.get("periods", []):
        code = str(entry.get("period_code"))
        items.append(
            EvidenceItem(
                evidence_id=f"coverage:{code}",
                kind=EvidenceKind.CONTEXT,
                metric="n_districts",
                value=int(entry.get("n_districts") or 0),
                unit="districts",
                period_code=code,
                geography_level=str(entry.get("coverage_level") or "") or None,
                source_id=None,
                method="district count present in the published period panel",
                note=f"{entry.get('label')}; {entry.get('n_crops')} crops",
            )
        )
    return items


def indicator_definitions(*, indicator_ids: list[str] | None = None) -> list[EvidenceItem]:
    """The definitions and units behind the platform's indicators."""
    try:
        catalog = mobile_service.indicator_catalog()
    except Exception:
        return []

    wanted = set(indicator_ids or [])
    items: list[EvidenceItem] = []
    for spec in catalog:
        identifier = str(spec.get("id"))
        if wanted and identifier not in wanted:
            continue
        if not spec.get("available"):
            continue
        items.append(
            EvidenceItem(
                evidence_id=f"definition:{identifier}",
                kind=EvidenceKind.CONTEXT,
                metric="indicator_definition",
                value=identifier,
                unit=spec.get("unit"),
                period_code=spec.get("period"),
                geography_level=spec.get("coverage_level"),
                source_id=spec.get("source_id"),
                method=f"aggregation policy: {spec.get('aggregation')}",
                note=f"{spec.get('label')} ({spec.get('category')})",
            )
        )
    return items
