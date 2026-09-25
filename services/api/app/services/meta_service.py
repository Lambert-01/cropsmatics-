"""Metadata services: data coverage, source registry and model cards.

None of these invent values. Coverage is read from the pipeline's
``data_coverage.csv``; sources come from the registry; model metrics come from a
real model card if one exists, otherwise a clear "not yet trained" status.
"""

from __future__ import annotations

import json

import numpy as np

from app.core.config import REPO_ROOT
from app.repositories import dataset_repository as repo

MODELS_DIR = REPO_ROOT / "ml" / "reports"

COVERAGE_NOTES = [
    "District-level productivity, factors, irrigation and erosion are only available for 2025 Season B.",
    "2024B, 2025A and 2026A are national context series and are NOT district estimates.",
    "Post-harvest use shares are national crop-level values, not district values.",
    "Cold-chain context lists program districts; facility capacity is not verified.",
]


def coverage() -> dict:
    """Return the coverage matrix as {dataset: {period: level}} plus details."""
    try:
        df = repo.data_coverage()
    except Exception:
        return {"coverage": {}, "details": [], "notes": COVERAGE_NOTES}

    df = df.replace({np.nan: None})
    coverage: dict[str, dict[str, str]] = {}
    for _, row in df.iterrows():
        coverage.setdefault(str(row["dataset"]), {})[str(row["period"])] = str(row["coverage_level"])
    details = []
    for _, row in df.iterrows():
        details.append({
            "dataset": row["dataset"],
            "period": row["period"],
            "coverage_level": row["coverage_level"],
            "n_districts": int(row["n_districts"]) if row["n_districts"] is not None else 0,
            "n_crops": int(row["n_crops"]) if row["n_crops"] is not None else 0,
            "source_id": row.get("source_id"),
        })
    return {"coverage": coverage, "details": details, "notes": COVERAGE_NOTES}


def level_for(dataset: str, period: str | None) -> str | None:
    cov = coverage()["coverage"]
    return cov.get(dataset, {}).get(period) if period else None


def sources() -> list[dict]:
    """Merge the curated registry with the processed official source registry."""
    items: dict[str, dict] = {}

    try:
        reg = repo.data_sources().replace({np.nan: None})
        for _, row in reg.iterrows():
            key = str(row["dataset"])
            items[key] = {
                "dataset": key,
                "coverage": row.get("coverage"),
                "use": row.get("use"),
                "official_page": row.get("official_page"),
                "access_status": row.get("status_in_package"),
                "url": row.get("official_page"),
            }
    except Exception:
        pass

    try:
        curated = repo.curated_sources().replace({np.nan: None})
        for _, row in curated.iterrows():
            key = str(row["source"])
            entry = items.setdefault(key, {"dataset": key})
            entry.update({
                "owner": row.get("owner"),
                "type": row.get("type"),
                "access_status": row.get("access_status"),
                "use": entry.get("use") or row.get("recommended_use"),
                "url": row.get("url"),
                "redistribution_note": row.get("redistribution_note"),
            })
    except Exception:
        pass

    return list(items.values())


def _metric(metrics: dict, name: str) -> float | None:
    m = metrics.get(name)
    if not isinstance(m, dict):
        return None
    value = m.get("mae") if name == "mae" else m.get(name)
    return None if value is None else float(value)


def models() -> list[dict]:
    """Read real model cards. Never fabricates metrics."""
    if not MODELS_DIR.exists():
        return []
    out: list[dict] = []
    for path in sorted(MODELS_DIR.glob("*.json")):
        try:
            card = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        metrics = card.get("metrics", {})
        best = card.get("best_model") or next(
            iter(metrics), None
        )
        best_metrics = metrics.get(best, {}) if best else {}
        out.append({
            "name": card.get("name", path.stem),
            "version": card.get("version"),
            "target": card.get("target"),
            "mae": _metric(best_metrics, "mae"),
            "rmse": _metric(best_metrics, "rmse"),
            "r2": _metric(best_metrics, "r2"),
            "n_train": card.get("n_train"),
            "n_test": card.get("n_test"),
            "training_period": card.get("training_period") or card.get("source_period"),
            "validation_method": card.get("validation_split") or card.get("validation"),
            "status": "available",
            "note": card.get("causality_disclaimer"),
        })
    return out
