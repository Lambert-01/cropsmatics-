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
# The chronological backtest's publication decision. Deliberately one level
# below MODELS_DIR (which the model registry globs) so it can never be
# registered as a model card; it is the *gate*, not a model.
FORECAST_REPORT = MODELS_DIR / "forecast" / "backtest.json"

# Processed tables the public analytical endpoints depend on.
# Keyed by the same logical dataset names the data manifest uses, so readiness
# and the manifest can be compared directly.
REQUIRED_DATASETS: dict[str, str] = {
    "training": "training_district_crop.csv",
    "crop_productivity": "crop_productivity.csv",
    "market_prices": "market_price_observation.csv",
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


def coverage_notes() -> list[str]:
    """Coverage notes derived from the period catalogue (never a literal).

    Built on demand rather than at import: the counts and the range must describe
    the data that is actually loaded, and importing the module must not depend on
    the processed tables existing.
    """
    from app.services import period_service

    codes = period_service.period_codes()
    return [
        "District productivity (area, harvested area, production, yield) is "
        f"available for all {len(codes)} published periods "
        f"({period_service.district_range()}) in the multi-period panel; "
        "2026 Season C has not been published.",
        "District input/practice, irrigation and erosion tables are still "
        f"single-release ({period_service.single_release_scope()}). See "
        "/api/v1/meta/periods for which datasets each period covers.",
        "2024B, 2025A and 2026A national trend rows are context series and are NOT "
        "district estimates.",
        "Post-harvest use shares are national crop-level values, not district values.",
        "Cold-chain context lists program districts; facility capacity is not verified.",
    ]


def coverage() -> dict:
    """Return the coverage matrix as {dataset: {period: level}} plus details."""
    try:
        df = repo.data_coverage()
    except Exception:
        return {"coverage": {}, "details": [], "notes": coverage_notes()}

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
    return {"coverage": coverage, "details": details, "notes": coverage_notes()}


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


def database_status() -> tuple[str, dict]:
    """Report DB connectivity and whether the canonical layer is serving data.

    Analytical reads are dispatched by ``CANONICAL_DATA_MODE`` (see
    ``dataset_repository``), so a missing database is reported as
    ``optional/unavailable`` rather than as a failure: in ``preferred``/``file``
    mode the processed artefacts answer the request instead. The canonical
    availability is reported separately because it is the difference between an
    environment where the database is the authority and one where the files are a
    fallback.
    """
    try:
        from app.repositories import canonical_repository

        probe = canonical_repository.probe()
    except Exception:  # noqa: BLE001 - readiness must never raise
        return "optional/unavailable", {"availability": "unavailable", "reason": "probe failed"}

    return "connected", probe


def _database_status() -> str:
    """Backwards-compatible string form used by the readiness payload.

    Deliberately unchanged: the canonical detail lives in the separate
    ``canonical`` field, so a client that only understands
    ``connected``/``optional/unavailable`` keeps working.
    """
    return database_status()[0]


def _expected_dataset_identity(manifest: dict) -> dict:
    """The manifest fields the loader records against a dataset version.

    The loader's content-addressed version is a pure function of exactly these
    four fields, so comparing them is equivalent to comparing the version string
    while keeping readiness decoupled from the loader module.
    """
    return {
        "pipeline_version": manifest.get("pipeline_version"),
        "git_sha": manifest.get("git_sha"),
        "build_timestamp": manifest.get("build_timestamp"),
        "row_counts": manifest.get("row_counts") or {},
    }


def canonical_readiness() -> dict:
    """Deep readiness of the canonical database, never raising.

    Validates, in order: a DATABASE_URL is configured, the database is reachable,
    the migration chain has been applied, the canonical tables exist, a dataset is
    loaded, and the loaded dataset version matches the processed manifest. Any
    step that fails is named so a deploy can be held back without guesswork.
    """
    settings = get_settings()
    mode = settings.canonical_mode
    result: dict = {
        "mode": mode,
        "database_configured": bool((settings.database_url or "").strip()),
        "availability": "unavailable",
        "reason": None,
        "migrations_applied": False,
        "tables_present": False,
        "dataset_loaded": False,
        "version_matches_manifest": None,
        "dataset_version": None,
        "expected_version": None,
        "row_counts": {},
        "blocking": [],
    }

    try:
        from app.repositories import canonical_repository as canonical

        probe = canonical.probe()
    except Exception:  # noqa: BLE001 - readiness reports, it does not raise
        result["reason"] = "canonical probe failed"
        result["blocking"].append("database_probe")
        return result

    result["availability"] = probe.get("availability")
    result["reason"] = probe.get("reason")
    result["row_counts"] = probe.get("row_counts") or {}
    result["tables_present"] = result["availability"] != "unavailable" or bool(
        probe.get("row_counts")
    )

    # Migrations applied is a distinct signal from "tables exist": a schema can
    # be present without the alembic bookkeeping (e.g. created out of band).
    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        with engine.connect() as connection:
            names = set(inspect(connection).get_table_names())
            result["tables_present"] = "crop_productivity" in names
            if "alembic_version" in names:
                # The alembic bookkeeping table holds one row per applied head.
                applied = connection.execute(
                    text("SELECT count(*) FROM alembic_version")
                ).scalar()
                result["migrations_applied"] = bool(applied)
            if "dataset_version" in names:
                loaded = canonical.current_version()
                if loaded is not None:
                    result["dataset_version"] = loaded.get("version")
                    result["dataset_loaded"] = True
                    expected = _expected_identity_from_manifest(loaded)
                    result["expected_version"] = expected.get("version")
                    result["version_matches_manifest"] = expected.get("matches")
    except Exception:  # noqa: BLE001 - a partial probe is still a useful report
        if "tables_present" not in result or not result["tables_present"]:
            result["blocking"].append("database_inspect")

    if not result["database_configured"]:
        result["blocking"].append("database_url_missing")
    if result["availability"] != "ready":
        result["blocking"].append("canonical_not_ready")
    if not result["migrations_applied"]:
        result["blocking"].append("migrations_not_applied")
    if not result["dataset_loaded"]:
        result["blocking"].append("dataset_not_loaded")
    if result["version_matches_manifest"] is False:
        result["blocking"].append("dataset_version_mismatch")

    return result


def _expected_identity_from_manifest(loaded: dict) -> dict:
    """Compare the loaded dataset version against the processed manifest."""
    try:
        manifest = repo.data_manifest()
    except Exception:
        # No manifest to compare against: report unknown rather than a false pass.
        return {"version": None, "matches": None}

    expected = _expected_dataset_identity(manifest)
    matches = all(
        (loaded.get(key) or {}) == (expected.get(key) or {})
        if key == "row_counts"
        else loaded.get(key) == expected.get(key)
        for key in expected
    )
    return {"version": loaded.get("version"), "matches": matches}


def readiness() -> dict:
    """Data-readiness probe used by deployment health checks.

    Two independent questions are answered: are the processed artefacts present
    (the reproducibility/fallback layer), and is the canonical database serving
    the expected dataset. In ``required`` mode the second question is the one
    that decides the verdict, so a production deploy cannot report ready while
    the analytical answers would come from files.
    """
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

    database, canonical = database_status()
    canonical_state = canonical_readiness()
    mode = canonical_state["mode"]

    # Informational: in `required` mode the canonical verdict is what matters, so
    # a not-serving database is not reported as a CSV problem here.
    if canonical.get("availability") != "ready":
        checks.append(
            {
                "check": "canonical_database",
                "status": "required_unavailable" if mode == "required" else "not_serving",
                "detail": canonical.get("reason"),
            }
        )
    if canonical_state["dataset_loaded"] and canonical_state["version_matches_manifest"] is False:
        checks.append(
            {
                "check": "canonical_dataset_version",
                "status": "mismatch",
                "detail": "loaded dataset version does not match the processed manifest",
            }
        )

    hard_missing = [c for c in checks if c["status"] in ("missing", "empty")]
    if mode == "required":
        status = "ready" if not canonical_state["blocking"] else "not_ready"
    else:
        status = "ready" if not hard_missing else "degraded"

    return {
        "status": status,
        "version": get_settings().version,
        "datasets": datasets,
        "row_counts": row_counts,
        "dictionaries": dict_ok,
        "database": database,
        "canonical": canonical,
        "canonical_data_mode": mode,
        "canonical_state": canonical_state,
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


def _metric(model_metrics: dict, name: str) -> float | None:
    """One metric from a card's per-model metrics block.

    Callers pass the block already narrowed to one model (``metrics[best]``), so
    this reads the value directly. It previously required a nested dict and
    therefore reported ``None`` for every real card - the registry under-reported
    metrics the model actually had.
    """
    if not isinstance(model_metrics, dict):
        return None
    value = model_metrics.get(name)
    if value is None or isinstance(value, dict):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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
            # How the model was validated, and whether that validation is strong
            # enough to serve a *future* target. A district holdout is not: it
            # measures spatial generalization. Cards that do not declare this
            # default to False, so an old card can never silently enable a
            # forecast-facing mode.
            "validation_kind": card.get("validation_kind") or "unspecified",
            "serves_forecast": bool(card.get("serves_forecast", False)),
            "forecast_note": card.get("forecast_note"),
            "status": "available",
            "note": card.get("causality_disclaimer"),
        })
    return out


def forecast_status() -> dict:
    """The forecast publication decision from the chronological backtest.

    Reads ``ml/reports/forecast/backtest.json`` — written by
    ``python -m ml.src.pipelines.run_forecast_backtest`` — and reports it
    verbatim: the gate result, the policy it was judged under, and the blocking
    reasons per candidate target. Nothing here is computed, and no forecast is
    produced by this function: if the backtest says the published record cannot
    validate a next-season forecast, the API says exactly that.

    Never raises: a missing or corrupt report is an honest
    ``report_available: false`` with a reason, because "we have no validated
    forecast" must be answerable even in a deployment where the ML reports were
    not built.
    """
    base = {
        "report_available": False,
        "serves_forecast": False,
        "generated": None,
        "policy": {},
        "policy_is_default": None,
        "method_note": None,
        "targets": [],
        "note": (
            "No backtest report is present in this deployment, so no forecast "
            "is served. Forecasting is published only from a default-policy "
            "chronological backtest."
        ),
    }
    if not FORECAST_REPORT.exists():
        return base
    try:
        report = json.loads(FORECAST_REPORT.read_text())
    except (json.JSONDecodeError, OSError):
        return {**base, "note": "The backtest report exists but could not be read; no forecast is served."}

    targets = []
    for target in report.get("targets") or []:
        if not isinstance(target, dict):
            continue
        metrics = target.get("metrics") or {}
        chosen = target.get("candidate") or target.get("best_naive") or None
        chosen_metrics = metrics.get(chosen, {}) if isinstance(chosen, str) else {}
        targets.append(
            {
                "target_id": target.get("target_id"),
                "status": target.get("status"),
                "reasons": [str(r) for r in (target.get("reasons") or [])],
                "n_series": int(target.get("n_series") or 0),
                "n_series_eligible": int(target.get("n_series_eligible") or 0),
                "decision_note": target.get("decision_note"),
                "skill_vs_naive": target.get("skill_vs_naive"),
                "next_period": target.get("next_period"),
                "point_estimate": target.get("point_estimate"),
                "unit": target.get("unit"),
                "interval": target.get("interval"),
                "interval_coverage": (
                    chosen_metrics.get("interval_coverage")
                    if isinstance(chosen_metrics, dict)
                    else None
                ),
            }
        )

    serves = bool(report.get("serves_forecast"))
    if targets:
        note = (
            "A next-season forecast is published for every target the backtest "
            "marked ok."
            if serves
            else (
                "No forecast is served: the chronological backtest judged every "
                "candidate target insufficient against its publication policy. "
                "This is an evidence verdict about the published record, not a "
                "service outage."
            )
        )
    else:
        note = base["note"]

    return {
        "report_available": True,
        "serves_forecast": serves,
        "generated": report.get("generated"),
        "policy": report.get("policy") or {},
        "policy_is_default": report.get("policy_is_default"),
        "method_note": report.get("method_note"),
        "targets": targets,
        "note": note,
    }
