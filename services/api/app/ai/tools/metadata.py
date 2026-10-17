"""Metadata tools: what a figure came from, and which models actually exist.

These ground *statements about the platform* rather than about agriculture, so an
explanation can cite a real source id or a real model card instead of describing
provenance from memory.
"""

from __future__ import annotations

from app.ai.evidence import EvidenceItem, EvidenceKind
from app.repositories import dataset_repository as repo
from app.services import meta_service


def _note(*values: object) -> str | None:
    """Join the descriptive fields a registry row actually carries."""
    parts = [str(value).strip() for value in values if value]
    return "; ".join(parts) if parts else None


def source_metadata(*, source_id: str | None = None) -> list[EvidenceItem]:
    """Registered sources, optionally filtered to one dataset name.

    The registry keys a source by its *dataset* name, which is also the name an
    answer lists when it says where its figures come from. Reading a key the
    service does not produce (a ``source_id`` or ``title`` column) produced empty
    items and colliding evidence ids, so no provenance answer was actually
    grounded; the dataset name and its descriptive fields are what the registry
    has, and they are what is carried here.
    """
    try:
        rows = meta_service.sources()
    except Exception:
        rows = []

    items: list[EvidenceItem] = []
    for row in rows:
        identifier = str(row.get("dataset") or "").strip()
        if not identifier:
            continue
        if source_id and identifier != source_id:
            continue
        items.append(
            EvidenceItem(
                evidence_id=f"source:{identifier}",
                kind=EvidenceKind.CONTEXT,
                metric="source",
                value=identifier,
                source_id=identifier,
                note=_note(
                    row.get("owner"),
                    row.get("coverage"),
                    row.get("use"),
                    row.get("status_in_package") or row.get("access_status"),
                    row.get("limitations"),
                ),
                method="curated source registry entry",
            )
        )
    return items


def source_registry(*, query: str | None = None) -> list[EvidenceItem]:
    """The curated source registry (owner, type, access, limitations)."""
    try:
        frame = repo.curated_sources()
    except Exception:
        return []
    if frame.empty:
        return []

    items: list[EvidenceItem] = []
    for _, row in frame.iterrows():
        # The curated registry names its sources in a ``source`` column; reading a
        # ``dataset`` column that does not exist yielded empty entries.
        dataset = str(row.get("source") or "").strip()
        if not dataset:
            continue
        if query and query.lower() not in dataset.lower():
            continue
        items.append(
            EvidenceItem(
                evidence_id=f"registry:{dataset}",
                kind=EvidenceKind.CONTEXT,
                metric="source_registry_entry",
                value=dataset,
                source_id=dataset,
                note=_note(
                    row.get("owner"),
                    row.get("type"),
                    row.get("access_status"),
                    row.get("recommended_use"),
                    row.get("redistribution_note"),
                ),
                method="curated source registry entry",
            )
        )
    return items


def forecast_status(
    *, crop: str | None = None, season: str | None = None,
    district: str | None = None, period_code: str | None = None,
) -> list[EvidenceItem]:
    """Forecast evidence, including scope, publication verdict and real intervals."""
    status = meta_service.forecast_status(
        crop=crop, season=season, district=district, period_code=period_code,
    )
    scope_id = ":".join(str(value or "all") for value in (crop, season, district, period_code))
    items = [EvidenceItem(
        evidence_id=f"forecast:status:{scope_id}", kind=EvidenceKind.CONTEXT,
        metric="serves_forecast", value="yes" if status["serves_forecast"] else "no",
        source_id="ML_FORECAST_BACKTEST", note=status["note"],
        method=status.get("method_note"),
    )]
    for target in status["targets"]:
        identifier = f"{target['target_id']}:{target.get('district') or 'all'}"
        published = target["status"] == "ok"
        common = {
            "kind": EvidenceKind.MODELLED if published else EvidenceKind.CONTEXT,
            "unit": target.get("unit"), "period_code": target.get("next_period"),
            "source_id": "ML_FORECAST_BACKTEST", "crop": target.get("crop"),
            "district": target.get("district"), "geography_level": target.get("geography_level"),
            "method": f"chronological backtest; model {target.get('model')}",
            "note": (
                f"{target.get('label')}; published modelled estimate" if published
                else "; ".join(target.get("reasons") or [status["note"]])
            ),
        }
        items.append(EvidenceItem(
            evidence_id=f"forecast:{identifier}", metric="forecast_estimate",
            value=target.get("point_estimate"), **common,
        ))
        bounds = target.get("interval")
        if published and isinstance(bounds, list) and len(bounds) == 2:
            for metric, value in zip(("lower", "upper"), bounds, strict=True):
                if isinstance(value, int | float):
                    items.append(EvidenceItem(
                        evidence_id=f"forecast:{identifier}:interval:{metric}",
                        metric=f"forecast_interval_{metric}", value=value, **common,
                    ))
        level = target.get("interval_level")
        if published and isinstance(level, int | float):
            items.append(EvidenceItem(
                evidence_id=f"forecast:{identifier}:interval:level",
                metric="forecast_interval_level", value=level * 100,
                **{**common, "unit": "%"},
            ))
    return items


def model_metadata() -> list[EvidenceItem]:
    """Model cards that actually exist. Empty when nothing is registered."""
    try:
        cards = meta_service.models()
    except Exception:
        return []

    items: list[EvidenceItem] = []
    for card in cards:
        name = str(card.get("name") or "model")
        version = card.get("version")
        for metric in ("mae", "rmse", "r2"):
            value = card.get(metric)
            if value is None:
                continue
            items.append(
                EvidenceItem(
                    evidence_id=f"model:{name}:{metric}",
                    kind=EvidenceKind.MODELLED,
                    metric=f"model_{metric}",
                    value=round(float(value), 4),
                    unit=None,
                    source_id=name,
                    method=(
                        "registered model card; validation method "
                        f"{card.get('validation_method') or 'not stated'}"
                    ),
                    note=f"{name} {version or ''}".strip(),
                )
            )
    return items
