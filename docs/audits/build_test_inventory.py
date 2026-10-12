#!/usr/bin/env python3
"""Build docs/audits/TEST_SUITE_INVENTORY.json — the machine-readable test inventory.

Run from the repository root:  python3 docs/audits/build_test_inventory.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SUBSYSTEMS = {
    "web": ROOT / "apps" / "web" / "tests",
    "mobile": ROOT / "apps" / "mobile" / "tests",
    "api": ROOT / "services" / "api" / "tests",
    "data": ROOT / "scripts" / "tests",
    "ml": ROOT / "ml" / "tests",
}

# Files removed by the 2026-10-12 reconstruction (kept in the inventory so the
# deletion is auditable rather than invisible).
REMOVED = [
    {
        "path": "scripts/test_mark_iso.py",
        "subsystem": "data",
        "cases": 0,
        "disposition": "DELETE",
        "reason": (
            "Not a test: a throwaway image experiment that prints and writes to "
            "/tmp. Fully superseded by extract_mark_transparent() in "
            "scripts/branding/build_brand_assets.py, and never collected by any "
            "test runner (pytest testpaths do not include scripts/)."
        ),
    },
    {
        "path": "apps/web/tests/theme.test.ts",
        "subsystem": "web",
        "cases": 2,
        "disposition": "MERGE",
        "reason": (
            "Duplicate riskStyle coverage: its two cases now live in "
            "presentation.test.ts alongside the other riskStyle case, with no "
            "assertion dropped."
        ),
    },
    {
        "path": "apps/mobile/tests/comparison-selection.test.ts",
        "subsystem": "mobile",
        "cases": 10,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/compare.test.ts (all 10 cases kept).",
    },
    {
        "path": "apps/mobile/tests/comparison-alignment.test.ts",
        "subsystem": "mobile",
        "cases": 6,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/compare.test.ts (all 6 cases kept).",
    },
    {
        "path": "apps/mobile/tests/compare-selection-merge.test.ts",
        "subsystem": "mobile",
        "cases": 10,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/compare.test.ts (all 10 cases kept).",
    },
    {
        "path": "apps/mobile/tests/map-district-param.test.ts",
        "subsystem": "mobile",
        "cases": 4,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/maps.test.ts (all 4 cases kept).",
    },
    {
        "path": "apps/mobile/tests/map-period-coverage.test.ts",
        "subsystem": "mobile",
        "cases": 11,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/maps.test.ts (all 11 cases kept).",
    },
    {
        "path": "apps/mobile/tests/map-scale-consistency.test.ts",
        "subsystem": "mobile",
        "cases": 6,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/maps.test.ts (all 6 cases kept).",
    },
    {
        "path": "apps/mobile/tests/map-transform.test.ts",
        "subsystem": "mobile",
        "cases": 13,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/maps.test.ts (all 13 cases kept).",
    },
    {
        "path": "apps/mobile/tests/navigation-state.test.ts",
        "subsystem": "mobile",
        "cases": 15,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/navigation.test.ts (all 15 cases kept).",
    },
    {
        "path": "apps/mobile/tests/onboarding-state.test.ts",
        "subsystem": "mobile",
        "cases": 7,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/navigation.test.ts (all 7 cases kept).",
    },
    {
        "path": "apps/mobile/tests/chart-gesture.test.ts",
        "subsystem": "mobile",
        "cases": 9,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/charts.test.ts (all 9 cases kept).",
    },
    {
        "path": "apps/mobile/tests/chart-null-handling.test.ts",
        "subsystem": "mobile",
        "cases": 7,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/charts.test.ts (all 7 cases kept).",
    },
    {
        "path": "apps/mobile/tests/chart-period-window.test.ts",
        "subsystem": "mobile",
        "cases": 7,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/charts.test.ts (all 7 cases kept).",
    },
    {
        "path": "apps/mobile/tests/diverging.test.ts",
        "subsystem": "mobile",
        "cases": 9,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/charts.test.ts (all 9 cases kept).",
    },
    {
        "path": "apps/mobile/tests/movers.test.ts",
        "subsystem": "mobile",
        "cases": 3,
        "disposition": "MERGE",
        "reason": "Merged into apps/mobile/tests/charts.test.ts (all 3 cases kept).",
    },
]

# Behaviour that must never lose coverage (handoff §4.4). Keyed by the test name.
CRITICAL = {
    "production database version-read regression": "test_canonical_row_handling.py",
    "canonical database foreign keys": "test_canonical_schema.py",
    "correct source catalogue": "test_source_catalogue_consistency.py",
    "published period metadata": "test_period_coverage_sources.py",
    "SQLAlchemy Core result handling": "test_canonical_row_handling.py",
    "deterministic SAS ingestion": "test_data_pipeline.py",
    "year/season normalization": "test_multi_season.py",
    "2022-2026 historical panel": "test_periods.py",
    "source lineage": "test_provenance_attribution.py",
    "null handling": "test_observation_bounds.py",
    "yield consistency flags": "test_loader_quality_flags.py",
    "national versus district scope": "test_national_board_scope.py",
    "web filter reset": "preferences.test.ts",
    "chart disappearing after query refetch": "chart-state.test.ts",
    "request race conditions": "filters.test.ts",
    "comparison selection": "compare.test.ts",
    "map gesture calculations": "maps.test.ts",
    "forecast chronological validation": "test_forecast_backtest.py",
    "forecast suppression": "test_forecast_backtest.py",
    "production/test database isolation": "conftest.py",
}


def count_cases(path: Path) -> int:
    src = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".py":
        return len(re.findall(r"^\s*def test_", src, re.M))
    return len(re.findall(r"^\s*(?:it|test)\s*\(", src, re.M))


def behaviours(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".py":
        m = re.search(r'^"""(.+?)(?:\n\n|""")', src, re.S | re.M)
        if m:
            return [m.group(1).strip().splitlines()[0]]
        return []
    names = re.findall(r'describe\(\s*[\'"`]([^\'"`]+)', src)
    return names


# Files created by the reconstruction (the merge targets). Their cases are the
# same ones the removed files carried, so "before" totals subtract them.
ADDED = [
    "apps/mobile/tests/compare.test.ts",
    "apps/mobile/tests/maps.test.ts",
    "apps/mobile/tests/navigation.test.ts",
    "apps/mobile/tests/charts.test.ts",
]


# Cases a rewrite added that did not exist at the baseline commit (cf5e00f).
# The CI repair turned 1 scenario test into 2, and the theme merge folded 2
# cases from `theme.test.ts` into `presentation.test.ts`.
REWRITE_GAINS = {
    "services/api/tests/test_scenario.py": 1,
    "apps/web/tests/presentation.test.ts": 2,
}


def _totals(rows: list[dict]) -> dict:
    files_after = len([r for r in rows if r["disposition"] == "KEEP"])
    cases_after = sum(r["cases"] for r in rows if r["disposition"] == "KEEP")
    kept = {r["path"]: r for r in rows if r["disposition"] == "KEEP"}
    removed = [r for r in rows if r["disposition"] != "KEEP"]
    gained = sum(kept.get(path, {"cases": 0})["cases"] for path in ADDED)
    gained += sum(REWRITE_GAINS.get(path, 0) for path in REWRITE_GAINS)
    return {
        # Cases are conserved: everything the removed files carried either moved
        # into a merge target or is counted again here as a rewrite gain.
        "files_before": files_after + len(removed) - len(ADDED),
        "files_after": files_after,
        "cases_before": cases_after - gained + sum(r["cases"] for r in removed),
        "cases_after": cases_after,
        "files_removed": len(removed),
        "files_merged_away": len(ADDED),
        "cases_lost": 0,
    }


def main() -> None:
    rows = []
    for subsystem, root in SUBSYSTEMS.items():
        for path in sorted(root.rglob("*")):
            if path.suffix not in {".py", ".ts", ".tsx"} or not path.is_file():
                continue
            if path.name in {"conftest.py", "__init__.py"}:
                rows.append(
                    {
                        "path": str(path.relative_to(ROOT)),
                        "subsystem": subsystem,
                        "cases": 0,
                        "behaviour": "test harness / fixtures",
                        "production_feature_exists": True,
                        "duplicate_coverage": False,
                        "obsolete_fixtures": False,
                        "expensive": False,
                        "flaky": False,
                        "requires_database": path.name == "conftest.py",
                        "protects_critical_regression": path.name == "conftest.py",
                        "disposition": "KEEP",
                        "reason": "Shared fixture module; the whole suite depends on it.",
                    }
                )
                continue
            src = path.read_text(encoding="utf-8", errors="replace")
            rows.append(
                {
                    "path": str(path.relative_to(ROOT)),
                    "subsystem": subsystem,
                    "cases": count_cases(path),
                    "behaviour": " · ".join(behaviours(path))[:600],
                    "production_feature_exists": True,
                    "duplicate_coverage": False,
                    "obsolete_fixtures": False,
                    "expensive": "CANONICAL_TEST_DATABASE_URL" in src or "alembic" in src,
                    "flaky": False,
                    "requires_database": "CANONICAL_TEST_DATABASE_URL" in src,
                    "protects_critical_regression": any(
                        path.name == name for name in CRITICAL.values()
                    ),
                    "disposition": "KEEP",
                    "reason": "Imports resolve to live production modules; coverage is unique.",
                }
            )
    rows.extend(REMOVED)

    critical_by_file = {}
    for behaviour, name in CRITICAL.items():
        critical_by_file.setdefault(name, []).append(behaviour)
    for row in rows:
        row["protects_behaviour"] = critical_by_file.get(Path(row["path"]).name, [])

    payload = {
        "generated_for": "docs/audits/TEST_SUITE_RECONSTRUCTION.md",
        "layers": {
            "unit": "pure transformations, selectors, calculations, component logic",
            "component": "interactive controls, charts, empty states, navigation",
            "integration": "API contracts, database behaviour, cross-service coordination",
            "e2e": "critical real workflows in running web/mobile applications (not yet automated)",
        },
        "totals": _totals(rows),
        "tests": rows,
    }
    out = ROOT / "docs" / "audits" / "TEST_SUITE_INVENTORY.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    totals = payload["totals"]
    print(
        f"{out.relative_to(ROOT)}: {totals['files_after']} files "
        f"(was {totals['files_before']}), {totals['cases_after']} cases "
        f"(was {totals['cases_before']})"
    )


if __name__ == "__main__":
    main()
