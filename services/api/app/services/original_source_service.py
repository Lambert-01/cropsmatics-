"""Read-only access to the retained original NISR SAS worksheet extracts.

This service is deliberately separate from ``dataset_service``.  The processed
explorer exposes normalized analytical tables; this module exposes the original
worksheet cell grid exactly as extracted from the source workbook, including
headers, blank cells and spacer rows.  Only files named by the checked-in
manifest are reachable, so a request can never turn into arbitrary file access.
"""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import REPO_ROOT

RAW_SAS_DIR = REPO_ROOT / "data" / "raw" / "nisr" / "sas"
MANIFEST_PATH = RAW_SAS_DIR / "manifest.csv"
INVENTORY_PATH = REPO_ROOT / "data" / "source_registry" / "sas_sheet_inventory.csv"


def _folder_path(folder: str) -> Path:
    """Resolve a manifest folder key to its known archive directory."""
    parts = folder.split("_", 1)
    if len(parts) != 2 or not parts[0].isdigit():
        raise ValueError(f"invalid SAS release folder: {folder!r}")
    year, release = parts
    if release == "annual":
        suffix = "annual"
    elif release.startswith("season_") and release[-1:] in {"a", "b", "c"}:
        suffix = release
    else:
        raise ValueError(f"invalid SAS release folder: {folder!r}")
    return RAW_SAS_DIR / year / suffix / "tables"


def _release_label(folder: str) -> str:
    year, release = folder.split("_", 1)
    if release == "annual":
        return f"{year} annual"
    return f"{year} Season {release.rsplit('_', 1)[-1].upper()}"


def _source_id(folder: str, workbook: str) -> str:
    year, release = folder.split("_", 1)
    if release == "annual":
        return f"NISR_SAS_{year}_ANNUAL"
    season = release.rsplit("_", 1)[-1].upper()
    # The two 2025B workbooks are retained as archive evidence, not as a
    # serving authority. Keep their identity visible rather than selecting one.
    if year == "2025":
        return f"NISR_SAS_2025{season}_ARCHIVE_" + ("CURATED" if "curated" in workbook.lower() else "OWNER")
    return f"NISR_SAS_{year}{season}"


def _inventory_folder(year: str, season: str) -> str:
    normalized = season.strip().lower()
    return f"{year}_annual" if normalized == "annual" else f"{year}_season_{normalized}"


def _key(folder: str, workbook: str, sheet_name: str) -> str:
    # The key is opaque to callers.  It is used only to look up an in-memory
    # catalogue entry, never joined onto a filesystem path.
    return f"{folder}::{workbook}::{sheet_name}"


def _bool(value: str | bool | None) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def _safe_csv_path(folder: str, csv_file: str) -> Path | None:
    """Return a manifest-named CSV only when it stays inside the SAS archive."""
    folder_dir = _folder_path(folder).resolve()
    name = Path(csv_file).name
    candidate = (folder_dir / name).resolve()
    if candidate.parent != folder_dir or candidate.suffix.lower() != ".csv":
        return None
    try:
        candidate.relative_to(RAW_SAS_DIR.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def _safe_workbook_path(folder: str, workbook: str) -> Path | None:
    """Resolve a retained workbook only under the known release workbooks dir."""
    workbook_dir = (RAW_SAS_DIR / folder.replace("_", "/", 1) / "workbooks").resolve()
    candidate = (workbook_dir / Path(workbook).name).resolve()
    if candidate.parent != workbook_dir or candidate.suffix.lower() != ".xlsx":
        return None
    try:
        candidate.relative_to(RAW_SAS_DIR.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


@lru_cache(maxsize=1)
def _catalogue() -> dict[str, dict]:
    """Build the source catalogue once per process from manifest + inventory."""
    rows: dict[str, dict] = {}

    if MANIFEST_PATH.is_file():
        with MANIFEST_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
            for raw in csv.DictReader(handle):
                folder = str(raw.get("folder", "")).strip()
                workbook = str(raw.get("source_workbook", "")).strip()
                sheet = str(raw.get("sheet_name", ""))
                if not folder or not workbook or not sheet:
                    continue
                key = _key(folder, workbook, sheet)
                csv_path = _safe_csv_path(folder, str(raw.get("csv_file", "")))
                workbook_path = _safe_workbook_path(folder, workbook)
                source_path = csv_path or workbook_path
                rows[key] = {
                    "key": key,
                    "release": _release_label(folder),
                    "folder": folder,
                    "source_id": _source_id(folder, workbook),
                    "source_workbook": workbook,
                    "sheet_name": sheet,
                    "title": sheet,
                    "used_range": str(raw.get("used_range", "")) or None,
                    "rows": int(raw.get("rows") or 0),
                    "columns": int(raw.get("columns") or 0),
                    "csv_file": str(raw.get("csv_file", "")) or None,
                    "raw_path": str(source_path.relative_to(REPO_ROOT)) if source_path else None,
                    "source_format": "csv" if csv_path else ("xlsx" if workbook_path else None),
                    "has_extract": source_path is not None,
                    "mapped": False,
                    "mapping_id": None,
                    "ingestion_stage": "source_extract",
                    "exclusion_reason": None,
                    "source_provenance": f"NISR SAS source workbook: {workbook}",
                }

    # The inventory includes the two archive-only 2025B workbooks as well as
    # every extracted release. Merge its review status, and retain inventory
    # rows with no deployed cell extract so the UI can explain the gap.
    if INVENTORY_PATH.is_file():
        with INVENTORY_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
            for raw in csv.DictReader(handle):
                workbook = str(raw.get("file", "")).strip()
                year = str(raw.get("year", "")).strip()
                season = str(raw.get("season", "")).strip()
                sheet = str(raw.get("sheet", ""))
                if not workbook or not year or not season or not sheet:
                    continue
                folder = _inventory_folder(year, season)
                key = _key(folder, workbook, sheet.strip())
                item = rows.get(key)
                if item is None:
                    item = {
                        "key": key,
                        "release": _release_label(folder),
                        "folder": folder,
                        "source_id": _source_id(folder, workbook),
                        "source_workbook": workbook,
                        "sheet_name": sheet.strip(),
                        "title": str(raw.get("title", "")) or sheet.strip(),
                        "used_range": None,
                        "rows": int(raw.get("rows") or 0),
                        "columns": int(raw.get("columns") or 0),
                        "csv_file": None,
                        "raw_path": None,
                        "source_format": None,
                        "has_extract": False,
                        "mapped": False,
                        "mapping_id": None,
                        "ingestion_stage": "inventory_only",
                        "exclusion_reason": "Worksheet inventory is retained, but its cell extract is not included in this deployment.",
                        "source_provenance": str(raw.get("source_provenance", "")) or None,
                    }
                    workbook_path = _safe_workbook_path(folder, workbook)
                    if workbook_path:
                        item["raw_path"] = str(workbook_path.relative_to(REPO_ROOT))
                        item["source_format"] = "xlsx"
                        item["has_extract"] = True
                    rows[key] = item
                item.update(
                    {
                        "mapped": _bool(raw.get("mapped")),
                        "mapping_id": str(raw.get("mapping_id", "")) or None,
                        "ingestion_stage": str(raw.get("ingestion_stage", "")) or item["ingestion_stage"],
                        "exclusion_reason": str(raw.get("exclusion_reason", "")) or item["exclusion_reason"],
                        "title": str(raw.get("title", "")) or item["title"],
                    }
                )

    return dict(sorted(rows.items(), key=lambda pair: (pair[1]["folder"], pair[1]["source_workbook"], pair[1]["sheet_name"])))


def clear_cache() -> None:
    _catalogue.cache_clear()
    _read_rows.cache_clear()


def list_sources(
    *,
    release: str | None = None,
    source_id: str | None = None,
    mapped: bool | None = None,
    has_extract: bool | None = None,
    search: str | None = None,
) -> list[dict]:
    needle = search.strip().lower() if search else ""
    values = list(_catalogue().values())
    result: list[dict] = []
    for item in values:
        if release and item["release"] != release:
            continue
        if source_id and item["source_id"] != source_id:
            continue
        if mapped is not None and item["mapped"] is not mapped:
            continue
        if has_extract is not None and item["has_extract"] is not has_extract:
            continue
        if needle:
            haystack = " ".join(str(item.get(name) or "") for name in ("release", "source_id", "source_workbook", "sheet_name", "title", "mapping_id"))
            if needle not in haystack.lower():
                continue
        result.append(item.copy())
    return result


def filter_options() -> dict[str, list[str]]:
    values = list(_catalogue().values())
    return {
        "release": sorted({item["release"] for item in values}),
        "source_id": sorted({item["source_id"] for item in values}),
        "mapping_status": ["mapped", "not mapped"],
        "availability": ["full extract", "inventory only"],
    }


def get_source(key: str) -> dict:
    try:
        return _catalogue()[key].copy()
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown original SAS source") from None


@lru_cache(maxsize=128)
def _read_rows(key: str) -> tuple[tuple[str, ...], ...]:
    item = get_source(key)
    if not item["has_extract"] or not item["raw_path"]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This worksheet is present in the source inventory, but its original cell extract is not included in this deployment.",
        )
    path = REPO_ROOT / item["raw_path"]
    if item["source_format"] == "xlsx":
        # Workbooks are optional at runtime; the tracked worksheet CSV extracts
        # remain the production fallback. A workbook is read-only and selected
        # by the inventory's exact worksheet name, never by user-supplied paths.
        import openpyxl

        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            worksheet = next(
                (sheet for sheet in workbook.worksheets if sheet.title.strip() == item["sheet_name"].strip()),
                None,
            )
            if worksheet is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "worksheet is not present in the original workbook")
            return tuple(
                tuple("" if value is None else str(value) for value in row)
                for row in worksheet.iter_rows(values_only=True)
            )
        finally:
            workbook.close()
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return tuple(tuple(cell for cell in row) for row in csv.reader(handle))


def fetch_source(key: str, *, limit: int, offset: int, search: str | None = None) -> dict:
    item = get_source(key)
    rows = _read_rows(key)
    max_columns = max((len(row) for row in rows), default=item["columns"])
    normalized = tuple(row + ("",) * (max_columns - len(row)) for row in rows)
    if search:
        needle = search.lower()
        selected = tuple(row for row in normalized if any(needle in cell.lower() for cell in row))
    else:
        selected = normalized
    page = selected[offset : offset + limit]
    return {
        "source": item,
        "columns": [chr(65 + i) if i < 26 else f"Column {i + 1}" for i in range(max_columns)],
        "rows": [list(row) for row in page],
        "count": len(selected),
        "offset": offset,
        "limit": limit,
        "search": search or None,
    }


def csv_path(key: str) -> Path:
    item = get_source(key)
    if not item["has_extract"] or not item["raw_path"]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This worksheet is present in the source inventory, but its original cell extract is not included in this deployment.",
        )
    return REPO_ROOT / item["raw_path"]
