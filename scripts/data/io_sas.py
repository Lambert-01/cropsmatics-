#!/usr/bin/env python3
"""Raw SAS table readers.

Prefer the manifest-listed extracted CSV (deterministic, engine-independent);
fall back to reading the workbook sheet directly for reproducibility paths.
Both readers return the sheet **exactly as published**: no header inference, no
value coercion, no trimming. Normalization happens downstream, on a copy.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from scripts.data.common import SAS_RELEASES, log


def read_extracted_table(release: str, sheet: str) -> pd.DataFrame:
    """Read one extracted table CSV without touching source values."""
    folder = SAS_RELEASES.get(release)
    if folder is None:
        raise KeyError(f"unknown SAS release: {release!r}")
    path = folder / f"{sheet}.csv"
    if not path.exists():
        raise FileNotFoundError(f"extracted table not found: {path}")
    return pd.read_csv(
        path,
        header=None,
        dtype=object,
        keep_default_na=False,
        encoding="utf-8-sig",
    )


def read_sheet_raw(workbook: Path, sheet_name: str) -> pd.DataFrame:
    """Read exactly what Excel contains; no inferred headers.

    Requires ``openpyxl`` - only used on the reproducibility path (the
    extraction pipeline), never in the deterministic build.
    """
    return pd.read_excel(
        workbook,
        sheet_name=sheet_name,
        header=None,
        dtype=object,
        engine="openpyxl",
    )


def read_manifest() -> pd.DataFrame:
    """The extraction manifest (workbook, sheet, used range, csv path)."""
    from scripts.data.common import SAS_MANIFEST

    if not SAS_MANIFEST.exists():
        raise FileNotFoundError(f"extraction manifest not found: {SAS_MANIFEST}")
    return pd.read_csv(SAS_MANIFEST, encoding="utf-8-sig")


def read_table(spec, *, prefer_extraction: bool = True) -> tuple[pd.DataFrame, str]:
    """Read a mapped table, returning ``(frame, source_kind)``.

    ``source_kind`` is ``"extraction"`` or ``"workbook"`` so lineage can record
    which path served the values.
    """
    folder = SAS_RELEASES[spec.release]
    if prefer_extraction or not folder.with_name("workbooks").exists():
        return read_extracted_table(spec.release, spec.sheet), "extraction"

    workbook = folder.with_name("workbooks") / _workbook_name(spec.release)
    frame = read_sheet_raw(workbook, spec.sheet)
    log(f"workbook fallback used for {spec.release}/{spec.sheet}")
    return frame, "workbook"


def _workbook_name(release: str) -> str:
    from scripts.data.common import SAS_WORKBOOKS

    return SAS_WORKBOOKS[release]
