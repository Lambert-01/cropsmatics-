"""Metadata services: data coverage, source registry and model cards.

None of these invent values. Coverage is read from the pipeline's
``data_coverage.csv``; sources come from the registry; model metrics come from a
real model card if one exists, otherwise a clear "not yet trained" status.
"""

from __future__ import annotations

import json

import numpy as np

from app.core.config import REPO_ROOT, get_settings
from app.repositories import dataset_repository as repo

MODELS_DIR = REPO_ROOT / "ml" / "reports"

# Processed tables the public analytical endpoints depend on.
# Keyed by the same logical dataset names the data manifest uses, so readiness
# and the manifest can be compared directly.
REQUIRED_DATASETS: dict[str, str] = {
    "training": "training_district_crop.csv",
    "district_crop_productivity": "district_crop_productivity.csv",
    "district_factors": "district_productivity_factors.csv",
    "irrigation_water": "irrigation_water.csv",
    "erosion_control": "erosion_control.csv",
    "crop_postharvest_use": "crop_postharvest_use.csv",
    "national_crop_trends": "national_crop_trends.csv",
    "national_input_trends": "national_input_trends.csv",
    "cold_chain_context": "cold_chain_context.csv",
    "postharvest_infrastructure": "national_postharvest_infrastructure.csv",
    "cold_chain_network_summary": "cold_chain_network_summary.csv",
    "dashboard_overview": "dashboard_overview.csv",
    "data_coverage": "data_coverage.csv",
    "data_sources": "data_sources.csv",
}

REQUIRED_DICTIONARIES = ["districts.csv", "crops.csv"]

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


def _database_status() -> str:
    """Report DB connectivity without making readiness depend on it.

    The public analytical endpoints read processed CSVs, so the service is
    usable without a database. A missing database is therefore reported as
    ``optional/unavailable``, never as a failure.
    """
    try:
        from sqlalchemy import create_engine, text

        from app.core.config import get_settings

        engine = create_engine(
            get_settings().database_url, connect_args={"connect_timeout": 2}
        )
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return "connected"
    except Exception:
        return "optional/unavailable"


def readiness() -> dict:
    """Data-readiness probe used by deployment health checks."""
    processed = get_settings().processed_dir
    dictionaries = REPO_ROOT / "data" / "dictionaries"

    datasets: dict[str, bool] = {}
    row_counts: dict[str, int | None] = {}
    checks: list[dict] = []

    for key, filename in REQUIRED_DATASETS.items():
        path = processed / filename
        exists = path.exists()
        datasets[key] = exists
        rows: int | None = None
        if exists:
            try:
                with open(path, "rb") as fh:
                    rows = max(sum(1 for _ in fh) - 1, 0)
            except OSError:
                rows = None
        row_counts[key] = rows
        if not exists:
            checks.append({"check": f"dataset:{key}", "status": "missing"})
        elif rows == 0:
            checks.append({"check": f"dataset:{key}", "status": "empty"})

    dict_ok = all((dictionaries / name).exists() for name in REQUIRED_DICTIONARIES)
    if not dict_ok:
        checks.append({"check": "dictionaries", "status": "missing"})

    model_cards = models()
    model_status = "available" if model_cards else "unavailable"
    if not model_cards:
        checks.append({"check": "model_card", "status": "unavailable"})

    database = _database_status()

    hard_missing = [c for c in checks if c["status"] in ("missing", "empty")]
    status = "ready" if not hard_missing else "degraded"
    return {
        "status": status,
        "version": get_settings().version,
        "datasets": datasets,
        "row_counts": row_counts,
        "dictionaries": dict_ok,
        "database": database,
        "model": model_status,
        "checks": checks,
    }


def data_version() -> dict:
    """Safe projection of the processed-data manifest.

    Deliberately excludes file hashes and filesystem paths: the endpoint is
    public and only needs to answer "which build of the data is serving this?"
    """
    try:
        manifest = repo.data_manifest()
    except Exception:
        return {"available": False}

    validation = manifest.get("validation") or {}
    return {
        "available": True,
        "pipeline_version": manifest.get("pipeline_version"),
        "git_sha": manifest.get("git_sha"),
        "build_timestamp": manifest.get("build_timestamp"),
        "row_counts": {
            str(k): int(v) for k, v in (manifest.get("row_counts") or {}).items()
        },
        "validation": {
            "status": validation.get("status"),
            "errors": validation.get("errors", 0),
            "warnings": validation.get("warnings", 0),
            "issues": validation.get("issues", []),
        },
        "dataset_count": len(manifest.get("outputs") or {}),
    }


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
