#!/usr/bin/env python3
"""Run the reproducible scientific/data-quality release gate.

This command audits the canonical multi-period panel without changing it.  It
deliberately separates implementation failures from source-quality findings:
published NISR values are never overwritten to make an arithmetic identity
pass.  Use it after a data build with::

    .venv/bin/python scripts/data/scientific_validation.py

The JSON and Markdown reports are release evidence, not a claim that every
official source value is error-free.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.data.build_manifest import _pipeline_source_sha256  # noqa: E402
from scripts.data.common import (  # noqa: E402
    PIPELINE_VERSION,
    PROCESSED_DIR,
    SAS_SOURCE_IDS,
    VALID_PERIODS,
    is_material_yield_discrepancy,
    yield_discrepancy_tolerance,
)

EXPECTED_DISTRICTS = 30
EXPECTED_CROPS = 17
REQUIRED_LINEAGE = (
    "source_id",
    "source_workbook",
    "source_sheets",
    "metric_source_map",
    "source_row_min",
    "processing_script",
    "processing_version",
)
NUMERIC_NONNEGATIVE = (
    "cultivated_area_ha",
    "harvested_area_ha",
    "production_mt",
    "yield_kg_ha",
)


@dataclass(frozen=True)
class Check:
    """One independently reviewable validation result."""

    check_id: str
    status: str
    message: str
    details: dict[str, Any]


def _check(check_id: str, status: str, message: str, **details: Any) -> Check:
    return Check(check_id, status, message, details)


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def _yield_reconciliation(df: pd.DataFrame) -> Check:
    """Compare the published yield with the documented derived identity.

    The check is intentionally diagnostic. NISR publishes yield independently
    from production and harvested area in some releases, so a discrepancy is
    an unresolved source finding, not permission to replace the published
    value with a derived one.
    """

    required = ["production_mt", "harvested_area_ha", "yield_kg_ha"]
    if any(column not in df.columns for column in required):
        return _check(
            "yield_reconciliation",
            "SKIP",
            "required published yield inputs are missing",
            required=required,
        )

    comparable = df.copy()
    for column in required:
        comparable[column] = pd.to_numeric(comparable[column], errors="coerce")
    comparable = comparable[
        comparable["production_mt"].notna()
        & comparable["harvested_area_ha"].gt(0)
        & comparable["yield_kg_ha"].notna()
    ].copy()
    if comparable.empty:
        return _check("yield_reconciliation", "SKIP", "no rows contain all yield inputs")

    comparable["implied_yield_kg_ha"] = (
        1000.0 * comparable["production_mt"] / comparable["harvested_area_ha"]
    )
    comparable["material"] = comparable.apply(
        lambda row: is_material_yield_discrepancy(
            row["production_mt"], row["harvested_area_ha"], row["yield_kg_ha"]
        ),
        axis=1,
    )
    material = comparable[comparable["material"]]
    status = "UNRESOLVED" if not material.empty else "PASS"
    message = (
        "published yield and 1000 * production / harvested area reconcile within tolerance"
        if material.empty
        else "published yield disagreements remain; official values are preserved and must be reviewed"
    )
    examples: list[dict[str, Any]] = []
    for _, row in material.head(5).iterrows():
        examples.append(
            {
                "period_code": row.get("period_code"),
                "district": row.get("district"),
                "crop": row.get("canonical_crop_name"),
                "published_yield_kg_ha": float(row["yield_kg_ha"]),
                "implied_yield_kg_ha": float(row["implied_yield_kg_ha"]),
                "tolerance_kg_ha": yield_discrepancy_tolerance(float(row["yield_kg_ha"])),
            }
        )
    return _check(
        "yield_reconciliation",
        status,
        message,
        rows_checked=int(len(comparable)),
        within_tolerance=int((~comparable["material"]).sum()),
        material_inconsistencies=int(len(material)),
        examples=examples,
        formula="yield_kg_ha = 1000 * production_mt / harvested_area_ha",
    )


def _lineage_checks(df: pd.DataFrame, inventory_path: Path) -> list[Check]:
    checks: list[Check] = []
    missing_columns = [column for column in REQUIRED_LINEAGE if column not in df.columns]
    if missing_columns:
        checks.append(
            _check(
                "lineage_columns",
                "FAIL",
                "required lineage columns are absent",
                missing_columns=missing_columns,
            )
        )
        return checks

    null_counts = {column: int(df[column].isna().sum()) for column in REQUIRED_LINEAGE}
    blank_counts = {
        column: int(df[column].astype("string").str.strip().isin(["", "<NA>"]).sum())
        for column in REQUIRED_LINEAGE
    }
    missing = {column: null_counts[column] + blank_counts[column] for column in REQUIRED_LINEAGE}
    checks.append(
        _check(
            "lineage_completeness",
            "PASS" if not any(missing.values()) else "FAIL",
            "every canonical row carries its source and processing lineage"
            if not any(missing.values())
            else "some canonical rows are missing source or processing lineage",
            missing=missing,
        )
    )

    invalid_maps = 0
    for raw in df["metric_source_map"].astype("string"):
        try:
            parsed = json.loads(str(raw))
            if not isinstance(parsed, dict) or not parsed:
                invalid_maps += 1
        except (TypeError, json.JSONDecodeError):
            invalid_maps += 1
    checks.append(
        _check(
            "metric_lineage_map",
            "PASS" if invalid_maps == 0 else "FAIL",
            "metric-to-source-table maps are valid JSON"
            if invalid_maps == 0
            else "invalid metric-to-source maps found",
            invalid_rows=invalid_maps,
        )
    )

    row_numbers = pd.to_numeric(df["source_row_min"], errors="coerce")
    bad_row_numbers = int(row_numbers.isna().sum() + row_numbers.le(0).sum())
    checks.append(
        _check(
            "source_row_reference",
            "PASS" if bad_row_numbers == 0 else "FAIL",
            "source row references are positive"
            if bad_row_numbers == 0
            else "invalid source row references found",
            invalid_rows=bad_row_numbers,
            note="source_row_min is a row-level reference, not an exact Excel cell address",
        )
    )

    panel_ids = set(df["source_id"].dropna().astype(str))
    if inventory_path.exists():
        inventory = pd.read_csv(inventory_path, dtype="string").fillna("")
        inventory_text = inventory.astype(str).agg(" ".join, axis=1)
        missing_ids = sorted(
            source_id
            for source_id in panel_ids
            if not inventory_text.str.contains(source_id, regex=False).any()
        )
        checks.append(
            _check(
                "source_registry_membership",
                "PASS" if not missing_ids else "FAIL",
                "all panel source IDs are represented in the SAS source inventory"
                if not missing_ids
                else "panel source IDs are missing from the SAS source inventory",
                panel_source_ids=sorted(panel_ids),
                missing_source_ids=missing_ids,
            )
        )
    else:
        checks.append(
            _check(
                "source_registry_membership",
                "SKIP",
                "SAS source inventory is unavailable",
                path=str(inventory_path),
            )
        )
    return checks


def validate_panel(
    df: pd.DataFrame,
    *,
    inventory_path: Path,
    manifest: dict[str, Any] | None = None,
    current_source_sha: str | None = None,
) -> list[Check]:
    """Validate an in-memory canonical panel; kept public for focused tests."""

    checks: list[Check] = []
    periods = (
        sorted(str(value) for value in df["period_code"].dropna().unique())
        if "period_code" in df
        else []
    )
    checks.append(
        _check(
            "published_period_axis",
            "PASS" if periods == sorted(VALID_PERIODS) else "FAIL",
            "canonical panel contains exactly the published 14-period axis"
            if periods == sorted(VALID_PERIODS)
            else "canonical panel period axis differs from the published period dimension",
            observed_periods=periods,
            expected_periods=list(VALID_PERIODS),
        )
    )

    district_count = int(df["district_code"].nunique(dropna=True)) if "district_code" in df else 0
    crop_count = (
        int(df["canonical_crop_name"].nunique(dropna=True)) if "canonical_crop_name" in df else 0
    )
    checks.append(
        _check(
            "canonical_dimensions",
            "PASS"
            if district_count == EXPECTED_DISTRICTS and crop_count == EXPECTED_CROPS
            else "FAIL",
            "canonical panel has the expected Rwanda district and crop dimensions"
            if district_count == EXPECTED_DISTRICTS and crop_count == EXPECTED_CROPS
            else "canonical panel dimensions differ from the verified current build",
            districts=district_count,
            expected_districts=EXPECTED_DISTRICTS,
            crops=crop_count,
            expected_crops=EXPECTED_CROPS,
            rows=int(len(df)),
        )
    )

    if "is_synthetic" in df:
        synthetic_values = df["is_synthetic"].astype("string").str.strip().str.lower()
        synthetic = int(synthetic_values.isin(["true", "1", "yes"]).sum())
    else:
        synthetic = None
    checks.append(
        _check(
            "no_synthetic_canonical_rows",
            "PASS" if synthetic == 0 else "FAIL",
            "canonical panel contains no synthetic rows"
            if synthetic == 0
            else "synthetic rows are present in the canonical panel",
            synthetic_rows=synthetic,
        )
    )

    # National rows deliberately have no district code and are published for
    # multiple farmer scales. Include geography and scale in the natural key;
    # using only period/district/crop would falsely call total/SSF/LSF rows
    # duplicates.
    key = ["period_code", "geography_level", "geography_code", "crop_code", "farmer_scale"]
    if all(column in df.columns for column in key):
        duplicate_rows = int(df.duplicated(key, keep=False).sum())
    else:
        duplicate_rows = None
    checks.append(
        _check(
            "canonical_key_uniqueness",
            "PASS" if duplicate_rows == 0 else ("FAIL" if duplicate_rows is not None else "SKIP"),
            "period, district and crop form a unique canonical observation key"
            if duplicate_rows == 0
            else "duplicate canonical observation keys found",
            duplicate_rows=duplicate_rows,
        )
    )

    negative_counts: dict[str, int] = {}
    for column in NUMERIC_NONNEGATIVE:
        if column in df.columns:
            values = pd.to_numeric(df[column], errors="coerce")
            negative_counts[column] = int(values.lt(0).sum())
    negative_total = sum(negative_counts.values())
    checks.append(
        _check(
            "nonnegative_measurements",
            "PASS" if negative_total == 0 else "FAIL",
            "published area, production and yield values are non-negative"
            if negative_total == 0
            else "negative published measurement values found",
            negative_counts=negative_counts,
        )
    )

    checks.extend(_lineage_checks(df, inventory_path))

    if {"period_code", "source_id", "source_workbook"}.issubset(df.columns):
        selected = df[df["period_code"].eq("2025B")]
        expected_id = SAS_SOURCE_IDS["SAS_2025_ANNUAL"]
        wrong_ids = int(selected["source_id"].ne(expected_id).sum())
        expected_workbook = "SAS 2025_Annual Tables.xlsx"
        wrong_workbooks = int(selected["source_workbook"].ne(expected_workbook).sum())
        precedence_ok = len(selected) > 0 and wrong_ids == 0 and wrong_workbooks == 0
        checks.append(
            _check(
                "2025b_source_precedence",
                "PASS" if precedence_ok else "FAIL",
                "2025B is served from the designated annual NISR release"
                if precedence_ok
                else "2025B contains rows from a non-authoritative source",
                rows=int(len(selected)),
                expected_source_id=expected_id,
                unexpected_source_id_rows=wrong_ids,
                expected_workbook=expected_workbook,
                unexpected_workbook_rows=wrong_workbooks,
            )
        )
    else:
        checks.append(
            _check("2025b_source_precedence", "SKIP", "source precedence columns are missing")
        )

    checks.append(_yield_reconciliation(df))

    # This check prevents an old generated data build from being mistaken for
    # the code currently under review. It is unresolved until the pipeline is
    # rebuilt, but it is not a data correctness failure.
    manifest_source_sha = (manifest or {}).get("pipeline_source_sha256")
    if manifest_source_sha and current_source_sha and manifest_source_sha != current_source_sha:
        checks.append(
            _check(
                "dataset_code_version_alignment",
                "UNRESOLVED",
                "processed manifest was built from different data-pipeline source code",
                manifest_pipeline_source_sha256=manifest_source_sha,
                current_pipeline_source_sha256=current_source_sha,
                action="run scripts/data/run_all.py before release",
            )
        )
    elif not manifest_source_sha:
        checks.append(
            _check(
                "dataset_code_version_alignment",
                "UNRESOLVED",
                "processed manifest predates the pipeline source content-hash identity",
                manifest_git_sha=(manifest or {}).get("git_sha", "unknown"),
                action="run scripts/data/run_all.py before release",
            )
        )
    else:
        checks.append(
            _check(
                "dataset_code_version_alignment",
                "PASS",
                "processed manifest and data-pipeline source code match",
                manifest_pipeline_source_sha256=manifest_source_sha,
                current_pipeline_source_sha256=current_source_sha,
            )
        )
    return checks


def run_validation(
    *,
    panel_path: Path = PROCESSED_DIR / "crop_productivity.csv",
    manifest_path: Path = PROCESSED_DIR / "manifest.json",
    inventory_path: Path = ROOT / "data/source_registry/sas_sheet_inventory.csv",
) -> dict[str, Any]:
    """Build a complete JSON-serialisable scientific validation report."""

    started = datetime.now(UTC).isoformat(timespec="seconds")
    if not panel_path.exists():
        checks = [
            _check(
                "canonical_panel",
                "FAIL",
                "canonical crop productivity panel is missing",
                path=str(panel_path),
            )
        ]
        manifest: dict[str, Any] = {}
        rows = 0
    else:
        frame = pd.read_csv(panel_path)
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        checks = validate_panel(
            frame,
            inventory_path=inventory_path,
            manifest=manifest,
            current_source_sha=_pipeline_source_sha256(),
        )
        rows = int(len(frame))

    if manifest_path.exists():
        manifest_version = manifest.get("pipeline_version")
        checks.append(
            _check(
                "manifest_pipeline_version",
                "PASS" if manifest_version == PIPELINE_VERSION else "FAIL",
                "manifest pipeline version matches the current pipeline contract"
                if manifest_version == PIPELINE_VERSION
                else "manifest pipeline version differs from the current pipeline contract",
                manifest_version=manifest_version,
                expected_version=PIPELINE_VERSION,
            )
        )
    else:
        checks.append(
            _check(
                "manifest_pipeline_version",
                "FAIL",
                "processed manifest is missing",
                path=str(manifest_path),
            )
        )

    statuses = {
        status: sum(1 for check in checks if check.status == status)
        for status in ("PASS", "FAIL", "SKIP", "UNRESOLVED")
    }
    return {
        "report_type": "cropmatics_scientific_validation",
        "generated_at": started,
        "code_git_sha": _git_sha(),
        "pipeline_version": PIPELINE_VERSION,
        "panel": {"path": str(panel_path.relative_to(ROOT)), "rows": rows},
        "source_policy": {
            "yield_formula": "1000 * production_mt / harvested_area_ha",
            "yield_tolerance": "max(1 kg/ha, 1% of published yield)",
            "productivity_gap_formula": "100 * (benchmark_yield - observed_yield) / benchmark_yield",
            "official_values_overwritten": False,
        },
        "summary": statuses,
        "status": "FAIL" if statuses["FAIL"] else "PASS",
        "checks": [asdict(check) for check in checks],
        "known_limitations": [
            "A source_row_min is a row-level source reference, not an exact Excel cell address.",
            "Published yield inconsistencies are surfaced as unresolved source findings; official values are preserved.",
            "Physical-device, deployed-environment and human language review are outside this local command.",
        ],
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Cropmatics Scientific Validation Report",
        "",
        f"Generated: `{report['generated_at']}`  ",
        f"Code commit: `{report['code_git_sha']}`  ",
        f"Pipeline version: `{report['pipeline_version']}`  ",
        f"Canonical panel: `{report['panel']['rows']:,}` rows  ",
        "",
        f"**Release-gate status: {report['status']}**",
        "",
        "| Result | Count |",
        "|---|---:|",
        f"| Passed | {summary['PASS']} |",
        f"| Failed | {summary['FAIL']} |",
        f"| Skipped | {summary['SKIP']} |",
        f"| Unresolved source findings | {summary['UNRESOLVED']} |",
        "",
        "The command audits the canonical panel without changing published values. `UNRESOLVED` means a source or environment limitation is visible and requires review; it is not counted as a software failure.",
        "",
        "## Checks",
        "",
        "| Check | Status | Finding |",
        "|---|---|---|",
    ]
    for check in report["checks"]:
        message = str(check["message"]).replace("|", "\\|")
        lines.append(f"| `{check['check_id']}` | **{check['status']}** | {message} |")
    lines.extend(
        [
            "",
            "## Formula policy",
            "",
            f"- Yield identity: `{report['source_policy']['yield_formula']}`.",
            f"- Reconciliation tolerance: `{report['source_policy']['yield_tolerance']}`.",
            f"- Productivity Gap Index: `{report['source_policy']['productivity_gap_formula']}`.",
            "- Official published yield is retained when it does not reconcile with the independently published area and production figures.",
            "",
            "## Limitations",
            "",
        ]
    )
    lines.extend(f"- {limitation}" for limitation in report["known_limitations"])
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json-out", type=Path, default=ROOT / "data/interim/scientific_validation_report.json"
    )
    parser.add_argument(
        "--markdown-out", type=Path, default=ROOT / "data/interim/scientific_validation_report.md"
    )
    parser.add_argument(
        "--strict", action="store_true", help="fail if unresolved source findings exist"
    )
    args = parser.parse_args(argv)

    report = run_validation()
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown_out.write_text(render_markdown(report), encoding="utf-8")
    print(render_markdown(report))
    return (
        1 if report["summary"]["FAIL"] or (args.strict and report["summary"]["UNRESOLVED"]) else 0
    )


if __name__ == "__main__":
    raise SystemExit(main())
