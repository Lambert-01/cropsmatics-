#!/usr/bin/env python3
"""Extract every worksheet of a SAS workbook to one CSV per sheet.

The 2024-2026 extractions were produced out-of-band; this script is the
reproducible path for new releases (2022, 2023, ...) and can regenerate any
release from its workbook. Fidelity contract:

* Cells are written **exactly as published** - no header inference, value
  coercion, trimming or type conversion. ``read_extracted_table`` documents the
  reader side of this contract.
* Sheet names are stripped of surrounding whitespace for the CSV filename
  (the 2022 workbook contains ``"Table 12 "`` and ``" Table 26"``); the
  original name is preserved in the manifest so provenance is exact.
* The manifest (``data/raw/nisr/sas/manifest.csv``) gains one row per
  extracted sheet. Re-running replaces the release's rows instead of
  duplicating them, so the script is idempotent.

Usage::

    python scripts/data/extract_sas_workbooks.py --release SAS_2022_ANNUAL
    python scripts/data/extract_sas_workbooks.py --release SAS_2022_ANNUAL --verify-fidelity
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.data.common import (  # noqa: E402
    RAW_SAS_DIR,
    SAS_MANIFEST,
    SAS_RELEASES,
    log,
    release_folder_key,
)

# release key -> (workbook filename in release workbooks/, extraction subfolder).
# 2024 is listed for the fidelity check only: its extraction already exists
# out-of-band, so re-extracting it and diffing proves this script reproduces
# the format the pipeline already consumes.
RELEASE_SOURCES: dict[str, tuple[str, str]] = {
    "SAS_2022_ANNUAL": ("SAS 2022_Tables_0.xlsx", "2022/annual/tables"),
    "SAS_2023_ANNUAL": ("SAS 2023_Annual Tables (3).xlsx", "2023/annual/tables"),
    "SAS_2024_ANNUAL": ("SAS 2024_Annual Tables.xlsx", "2024/annual/tables"),
}

MANIFEST_COLUMNS = [
    "source_workbook",
    "folder",
    "sheet_name",
    "used_range",
    "rows",
    "columns",
    "csv_file",
]


def _sheet_grid(workbook: Path, sheet_name: str) -> pd.DataFrame:
    """The sheet exactly as published (object dtype, no header inference)."""
    return pd.read_excel(
        workbook, sheet_name=sheet_name, header=None, dtype=object, engine="openpyxl"
    )


def _used_range(grid: pd.DataFrame) -> str:
    if grid.empty:
        return ""
    from openpyxl.utils import get_column_letter

    return f"A1:{get_column_letter(grid.shape[1])}{grid.shape[0]}"


def _write_sheet_csv(grid: pd.DataFrame, path: Path) -> None:
    # QUOTE_MINIMAL, \r\n and a UTF-8 BOM match the existing extraction files, so
    # a regenerated release diffs cleanly against the out-of-band original
    # (verified with ``--verify-fidelity`` for the 2024 release). The reader uses
    # ``utf-8-sig``, so the BOM never reaches a parsed value.
    grid.to_csv(
        path, index=False, header=False, lineterminator="\r\n", encoding="utf-8-sig"
    )


def _is_blank(value: object) -> bool:
    if value is None:
        return True
    try:
        if bool(pd.isna(value)):
            return True
    except (TypeError, ValueError):  # arrays/objects pd.isna cannot reduce
        pass
    return str(value).strip() == ""


def _grids_equal(left: pd.DataFrame, right: pd.DataFrame, tolerance: float = 0.0) -> bool:
    """Value-level comparison of two raw grids.

    Comparing the grids after ``astype(str)`` is wrong: it turns a blank Excel
    cell into the string ``"nan"`` and can then match text that merely contains
    those letters. This compares blanks as blanks (whatever their type) and falls
    back to a numeric comparison so a formatting-only difference (``1`` vs
    ``1.0``) is not reported as a fidelity failure.
    """
    if left.shape != right.shape:
        return False
    for i in range(left.shape[0]):
        for j in range(left.shape[1]):
            a, b = left.iat[i, j], right.iat[i, j]
            blank_a, blank_b = _is_blank(a), _is_blank(b)
            if blank_a or blank_b:
                if blank_a != blank_b:
                    return False
                continue
            if str(a) == str(b):
                continue
            try:
                if abs(float(str(a)) - float(str(b))) > tolerance:
                    return False
            except ValueError:
                return False
    return True


def extract(release: str, verify_fidelity: bool = False) -> int:
    if release not in RELEASE_SOURCES:
        log(f"unknown release: {release!r} (known: {sorted(RELEASE_SOURCES)})")
        return 1
    workbook_name, folder = RELEASE_SOURCES[release]
    workbook_path = SAS_RELEASES[release].parent / "workbooks" / workbook_name
    if not workbook_path.exists():
        log(f"workbook not found: {workbook_path}")
        return 1

    target = RAW_SAS_DIR / folder
    target.mkdir(parents=True, exist_ok=True)

    import openpyxl

    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    sheet_names = list(wb.sheetnames)
    wb.close()

    manifest_rows: list[dict] = []
    fidelity_mismatches: list[str] = []
    for original_name in sheet_names:
        clean_name = original_name.strip()
        grid = _sheet_grid(workbook_path, original_name)
        out_path = target / f"{clean_name}.csv"
        if verify_fidelity and out_path.exists():
            existing = pd.read_csv(
                out_path, header=None, dtype=object, keep_default_na=False,
                encoding="utf-8-sig",
            )
            if not _grids_equal(existing, grid):
                fidelity_mismatches.append(clean_name)
            continue
        _write_sheet_csv(grid, out_path)
        manifest_rows.append(
            {
                "source_workbook": workbook_name,
                "folder": folder.replace("/tables", "").replace("/", "_"),
                "sheet_name": clean_name,
                "used_range": _used_range(grid),
                "rows": grid.shape[0],
                "columns": grid.shape[1],
                "csv_file": f"{folder.replace('/tables', '').replace('/', '_')}/{clean_name}.csv",
            }
        )
        log(f"  extracted {release}/{clean_name} ({grid.shape[0]}x{grid.shape[1]})")

    if verify_fidelity:
        if fidelity_mismatches:
            log(f"FIDELITY MISMATCH in {len(fidelity_mismatches)} sheets: {fidelity_mismatches}")
            return 1
        log(f"fidelity check passed for {release}: extraction matches existing CSVs")
        return 0

    _update_manifest(release, folder, manifest_rows)
    log(f"{release}: {len(manifest_rows)} sheets extracted to {target}")
    return 0


# Legacy manifest folder keys written before the convention was derived from
# ``common.SAS_RELEASES`` (e.g. "SAS_2024_Annual", "SAS_2026_Season_A"). They are
# normalized on every write; the pattern is parsed, never tabulated, so no year
# list lives here.
_LEGACY_FOLDER = re.compile(r"^SAS_(\d{4})(?:_Annual|_Season_([A-C]))$")


def _canonical_folder_key(folder: str) -> str:
    """Normalize a manifest folder key, leaving anything unrecognized alone."""
    candidate = folder.replace("/tables", "").replace("/", "_")
    match = _LEGACY_FOLDER.match(candidate)
    if match is None:
        return candidate
    year, season = match.group(1), match.group(2)
    return f"{year}_season_{season.lower()}" if season else f"{year}_annual"


def _update_manifest(release: str, folder: str, rows: list[dict]) -> None:
    """Replace this release's manifest rows; keep every other release intact."""
    folder_key = release_folder_key(release)
    if SAS_MANIFEST.exists():
        existing = pd.read_csv(SAS_MANIFEST, dtype=str, keep_default_na=False)
        # Normalize the whole column first, so a manifest written under the old
        # naming cannot survive alongside the new rows and duplicate a sheet.
        existing["folder"] = existing["folder"].map(_canonical_folder_key)
        existing["csv_file"] = [
            f"{_canonical_folder_key(str(path).split('/')[0])}/" + "/".join(str(path).split("/")[1:])
            for path in existing.get("csv_file", pd.Series(dtype=str))
        ]
        existing = existing[existing["folder"] != folder_key]
    else:
        existing = pd.DataFrame(columns=MANIFEST_COLUMNS)
    combined = pd.concat([existing, pd.DataFrame(rows)], ignore_index=True)
    # Deterministic order: by folder then sheet number.
    combined["_sheet_no"] = combined["sheet_name"].str.extract(r"(\d+)").astype(float)
    combined = combined.sort_values(["folder", "_sheet_no"]).drop(columns=["_sheet_no"])
    SAS_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(SAS_MANIFEST, index=False, lineterminator="\r\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True, choices=sorted(RELEASE_SOURCES))
    parser.add_argument(
        "--verify-fidelity",
        action="store_true",
        help="compare the extraction against existing CSVs instead of writing",
    )
    args = parser.parse_args(argv)
    return extract(args.release, verify_fidelity=args.verify_fidelity)


if __name__ == "__main__":
    raise SystemExit(main())
