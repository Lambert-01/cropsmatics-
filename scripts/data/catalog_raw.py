#!/usr/bin/env python3
"""Inventory every raw source file (path, size, SHA-256, provider, status).

The catalogue is the audit trail for the whole pipeline: it proves which bytes
the processed outputs were built from. It never modifies a source file, and it
is deterministic - the same tree always produces the same rows in the same
order, so its output can be diffed in CI.

Writes:

* ``data/interim/source_catalog.csv``   one row per raw file
* ``data/interim/sas_table_catalog.csv`` SAS tables joined to the reviewed map

The SAS table catalogue is the bridge between the raw extraction manifest
(``data/raw/nisr/sas/manifest.csv``) and ``sas_table_map``: it records, per
extracted sheet, the resolved period/domain/metric and whether the sheet is
mapped at all. Unmapped sheets stay visible as ``mapped=False`` rather than
being dropped, so a new NISR table shows up as a gap instead of silently
disappearing.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pandas as pd

from scripts.data import sas_table_map as tmap
from scripts.data.common import (
    DATA_DIR,
    INTERIM_DIR,
    RAW_DIR,
    SAS_MANIFEST,
    SAS_RELEASES,
    SAS_SOURCE_IDS,
    SAS_WORKBOOKS,
    log,
)

# Only these suffixes are treated as data sources; README/markdown files are
# provenance documentation, not raw data.
RAW_SUFFIXES = {".csv", ".xlsx", ".xls", ".json", ".geojson", ".tif", ".tiff", ".gz"}

# Extraction folder name (manifest ``folder``) -> ``common.SAS_RELEASES`` key.
FOLDER_TO_RELEASE: dict[str, str] = {
    "SAS_2024_Annual": "SAS_2024_ANNUAL",
    "SAS_2025_Annual": "SAS_2025_ANNUAL",
    "SAS_2026_Season_A": "SAS_2026A",
    "SAS_2026_Season_B": "SAS_2026B",
}

# Path prefix -> (publisher, dataset_family, access_level). Longest prefix wins.
PROVIDER_RULES: tuple[tuple[str, str, str, str], ...] = (
    ("data/raw/nisr/sas_microdata", "NISR", "SAS_MICRODATA", "RESTRICTED"),
    ("data/raw/nisr/sas", "NISR", "SAS", "PUBLIC"),
    ("data/raw/nisr", "NISR", "NISR_OTHER", "PUBLIC"),
    ("data/raw/markets/esoko", "MINAGRI", "ESOKO", "PUBLIC"),
    ("data/raw/markets/fewsnet", "FEWS_NET", "FEWS_NET_MARKET_PRICES", "PUBLIC"),
    ("data/raw/markets/wfp", "WFP", "DATABRIDGES", "PUBLIC"),
    ("data/raw/markets/nisr_sas", "NISR", "SAS_MARKET_PRICES", "PUBLIC"),
    ("data/raw/markets", "UNSPECIFIED", "MARKET_PRICES", "PUBLIC"),
    ("data/raw/external/minagri", "MINAGRI", "MINAGRI_ADDON", "PUBLIC"),
    ("data/raw/cropmatics_real_data_2024_2026", "CROPMATICS", "LEGACY_PACK", "PUBLIC"),
    ("data/external/chirps", "CHC_UCSB", "CHIRPS", "PUBLIC"),
)

# Raw path prefix -> SAS release key (see ``common.SAS_RELEASES``).
RELEASE_BY_PREFIX: dict[str, str] = {
    "data/raw/nisr/sas/2024": "SAS_2024_ANNUAL",
    "data/raw/nisr/sas/2025": "SAS_2025_ANNUAL",
    "data/raw/nisr/sas/2026/season_a": "SAS_2026A",
    "data/raw/nisr/sas/2026/season_b": "SAS_2026B",
}


def sha256_file(path: Path) -> str:
    """Streaming SHA-256 so large workbooks do not need to be fully buffered."""
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _rel(path: Path) -> str:
    """Repository-relative POSIX path (stable across operating systems)."""
    try:
        return path.resolve().relative_to(DATA_DIR.parent).as_posix()
    except ValueError:
        return path.as_posix()


def classify(rel_path: str) -> tuple[str, str, str]:
    """(publisher, dataset_family, access_level) for a repository-relative path."""
    for prefix, publisher, family, access in PROVIDER_RULES:
        if rel_path.startswith(prefix):
            return publisher, family, access
    return "UNSPECIFIED", "UNKNOWN", "UNSPECIFIED"


def release_for(rel_path: str) -> str:
    """SAS release key for an extraction path (empty for non-SAS files)."""
    for prefix, release in RELEASE_BY_PREFIX.items():
        if rel_path.startswith(prefix + "/"):
            return release
    return ""


def source_id_for(rel_path: str) -> str:
    return SAS_SOURCE_IDS.get(release_for(rel_path), "")


def period_hint_for(rel_path: str) -> str:
    """Period(s) the path implies: the union of the release's mapped periods."""
    release = release_for(rel_path)
    if not release:
        return ""
    periods = sorted({spec.period_code for spec in tmap.tables_for(release=release)})
    return "/".join(periods)


def _sidecar_retrieved_at(path: Path) -> str:
    """Retrieval timestamp written by the downloader, when a sidecar exists."""
    sidecar = path.with_suffix(path.suffix + ".source.json")
    if not sidecar.exists():
        return ""
    try:
        return str(json.loads(sidecar.read_text(encoding="utf-8")).get("retrieved_at", ""))
    except (OSError, ValueError):
        return ""


def iter_raw_files() -> list[Path]:
    """Every data-suffixed file under ``data/raw`` and ``data/external``."""
    roots = [RAW_DIR, DATA_DIR / "external"]
    found: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        found.extend(
            p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in RAW_SUFFIXES
        )
    return sorted(found, key=_rel)


def build_catalog() -> pd.DataFrame:
    rows: list[dict] = []
    for path in iter_raw_files():
        rel = _rel(path)
        publisher, family, access = classify(rel)
        rows.append(
            {
                "relative_path": rel,
                "filename": path.name,
                "suffix": path.suffix.lower(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "publisher": publisher,
                "dataset_family": family,
                "access_level": access,
                "source_id": source_id_for(rel),
                "period_hint": period_hint_for(rel),
                "retrieved_at": _sidecar_retrieved_at(path),
                "status": "ok",
            }
        )
    return pd.DataFrame(
        rows,
        columns=[
            "relative_path",
            "filename",
            "suffix",
            "bytes",
            "sha256",
            "publisher",
            "dataset_family",
            "access_level",
            "source_id",
            "period_hint",
            "retrieved_at",
            "status",
        ],
    )


def build_sas_table_catalog() -> pd.DataFrame:
    """Manifest rows joined to the reviewed workbook/sheet mapping."""
    columns = [
        "release",
        "sheet",
        "period_code",
        "domain",
        "metric",
        "unit",
        "geography_level",
        "source_id",
        "source_workbook",
        "rows",
        "columns",
        "used_range",
        "csv_file",
        "relative_path",
        "bytes",
        "sha256",
        "mapped",
        "period_override_reason",
    ]
    if not SAS_MANIFEST.exists():
        return pd.DataFrame(columns=columns)

    manifest = pd.read_csv(SAS_MANIFEST, dtype=str, encoding="utf-8-sig").fillna("")
    rows: list[dict] = []
    for record in manifest.to_dict("records"):
        folder = str(record.get("folder", "")).strip()
        sheet = str(record.get("sheet_name", "")).strip()
        release = FOLDER_TO_RELEASE.get(folder, "")
        spec = tmap.get_spec(release, sheet) if release else None

        workbook = str(record.get("source_workbook", "")).strip()
        csv_file = str(record.get("csv_file", "")).strip()
        # The extraction CSV was re-homed; resolve it by release + sheet name.
        table_path: Path | None = None
        if release and sheet:
            folder_path = SAS_RELEASES.get(release)
            if folder_path is not None:
                candidate = folder_path / f"{sheet}.csv"
                table_path = candidate if candidate.exists() else None

        rows.append(
            {
                "release": release,
                "sheet": sheet,
                "period_code": spec.period_code if spec else "",
                "domain": spec.domain if spec else "",
                "metric": (spec.metric or "") if spec else "",
                "unit": (spec.unit or "") if spec else "",
                "geography_level": (spec.geography_level or "") if spec else "",
                "source_id": SAS_SOURCE_IDS.get(release, ""),
                "source_workbook": workbook or SAS_WORKBOOKS.get(release, ""),
                "rows": record.get("rows", ""),
                "columns": record.get("columns", ""),
                "used_range": record.get("used_range", ""),
                "csv_file": csv_file,
                "relative_path": _rel(table_path) if table_path else "",
                "bytes": table_path.stat().st_size if table_path else "",
                "sha256": sha256_file(table_path) if table_path else "",
                "mapped": bool(spec),
                "period_override_reason": (spec.period_override_reason or "") if spec else "",
            }
        )
    return pd.DataFrame(rows, columns=columns)


def _summary(catalog: pd.DataFrame) -> dict:
    by_family = (
        catalog.groupby("dataset_family")["bytes"].agg(["count", "sum"]).to_dict("index")
        if not catalog.empty
        else {}
    )
    return {
        "files": int(len(catalog)),
        "bytes": int(catalog["bytes"].sum()) if not catalog.empty else 0,
        "by_family": {
            str(family): {"files": int(stats["count"]), "bytes": int(stats["sum"])}
            for family, stats in sorted(by_family.items())
        },
    }


def main() -> int:
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)

    catalog = build_catalog()
    catalog.to_csv(INTERIM_DIR / "source_catalog.csv", index=False)

    sas_tables = build_sas_table_catalog()
    sas_tables.to_csv(INTERIM_DIR / "sas_table_catalog.csv", index=False)

    summary = _summary(catalog)
    (INTERIM_DIR / "source_catalog_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )

    unmapped = int((~sas_tables["mapped"]).sum()) if not sas_tables.empty else 0
    log(
        f"source catalog: {summary['files']} raw files, "
        f"{summary['bytes']} bytes across {len(summary['by_family'])} families"
    )
    log(
        f"SAS table catalog: {len(sas_tables)} extracted tables, "
        f"{int(sas_tables['mapped'].sum()) if not sas_tables.empty else 0} mapped, "
        f"{unmapped} unmapped (kept visible, never dropped)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
