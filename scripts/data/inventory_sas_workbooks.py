#!/usr/bin/env python3
"""Inventory every worksheet of every supplied SAS workbook.

The master prompt's first P2 deliverable: a machine-readable account of every
sheet, so nothing is silently dropped. Each sheet is classified as exactly one
of:

* ``used``               — mapped in ``sas_table_map`` AND powering a canonical
                           dataset (its release appears in the extraction).
* ``mapped_not_exposed`` — mapped in ``sas_table_map`` but not surfaced by an
                           equivalent multi-period screen yet.
* ``metadata``           — table-of-contents / cover sheets, non-quantitative.
* ``not_yet_mapped``     — worksheet without a reviewed table specification;
                           preserved but not exposed as analytical data.

Nothing is inferred from free text beyond the printed title, which is stored
verbatim. A sheet is never marked ``used`` merely because a CSV was extracted:
``used`` requires the reviewed mapping AND the release being part of the
canonical build. Output is deterministic (stable sort, fixed columns) so it can
be diffed in CI.

Writes ``data/source_registry/sas_sheet_inventory.csv``.
"""

from __future__ import annotations

import csv
import hashlib
import sys
from pathlib import Path

import openpyxl

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
OUT_PATH = DATA_DIR / "source_registry" / "sas_sheet_inventory.csv"

sys.path.insert(0, str(REPO_ROOT))
from scripts.data import sas_table_map as tmap  # noqa: E402
from scripts.data.common import RAW_SAS_DIR, SAS_SOURCE_IDS, log  # noqa: E402

# Eight unique workbooks, including both distinct 2025B originals. The
# standalone 2025B files remain in the inventory as archive-only evidence; the
# annual release is the serving authority for the 2025A/B/C period family.
WORKBOOKS: tuple[tuple[str, str, str], ...] = (
    # (filename, canonical year, season-or-annual)
    ("SAS 2022_Tables_0.xlsx", "2022", "annual"),
    ("SAS 2023_Annual Tables (3).xlsx", "2023", "annual"),
    ("SAS 2024_Annual Tables.xlsx", "2024", "annual"),
    ("SAS 2025_Annual Tables.xlsx", "2025", "annual"),
    ("Tables_2025_Season_B_0.xlsx", "2025", "B"),
    ("Tables_2025_Season_B_0_curated_official.xlsx", "2025", "B"),
    ("Tables_2026 Season A.xlsx", "2026", "A"),
    ("Tables_2026 Season B.xlsx", "2026", "B"),
)

# Workbook filename -> sas_table_map release key (None = not in the map).
# 2022 and 2023 are reviewed and mapped (see sas_table_map.PRODUCTIVITY_TABLES);
# The standalone 2025B workbooks are separate sources from the 2025 annual
# release and remain unmapped until their precedence is settled.
FILENAME_TO_RELEASE: dict[str, str | None] = {
    "SAS 2022_Tables_0.xlsx": "SAS_2022_ANNUAL",
    "SAS 2023_Annual Tables (3).xlsx": "SAS_2023_ANNUAL",
    "SAS 2024_Annual Tables.xlsx": "SAS_2024_ANNUAL",
    "SAS 2025_Annual Tables.xlsx": "SAS_2025_ANNUAL",
    "Tables_2025_Season_B_0.xlsx": None,
    "Tables_2025_Season_B_0_curated_official.xlsx": None,
    "Tables_2026 Season A.xlsx": "SAS_2026A",
    "Tables_2026 Season B.xlsx": "SAS_2026B",
}

ARCHIVE_ONLY_REASON = (
    "archive-only standalone 2025B workbook; SAS_2025_ANNUAL is the reviewed "
    "serving authority for 2025B (see docs/data/SAS_SOURCE_PRECEDENCE.md)"
)

# Domain -> the processed dataset that surfaces it, i.e. the file the API/loader
# actually reads. A mapped sheet is only ``used`` when that file exists in this
# checkout: extracting a CSV is not exposure. When a builder for a domain lands
# the file appears and the domain becomes exposed automatically - the entries are
# never edited to claim exposure that is not real.
DOMAIN_OUTPUTS: dict[str, str] = {
    "productivity": "crop_productivity.csv",
    "postharvest": "crop_postharvest_use_multi_period.csv",
    "practice": "agricultural_practice_observation.csv",
    "irrigation": "agricultural_practice_observation.csv",
    "water_source": "agricultural_practice_observation.csv",
    "erosion_control": "agricultural_practice_observation.csv",
    "erosion_severity": "agricultural_practice_observation.csv",
    "fertilizer_source_district": "agricultural_practice_observation.csv",
    "fertilizer_source_type": "fertilizer_source.csv",
}

# Sheet names that are table-of-contents / cover pages in every SAS release.
METADATA_SHEETS = {"list of tables", "contents", "table of contents"}

COLUMNS = [
    "file",
    "sha256",
    "year",
    "season",
    "sheet",
    "title",
    "rows",
    "columns",
    "indicator_group",
    "unit",
    "geography",
    "period_grain",
    "mapped",
    "mapping_id",
    "ingestion_stage",
    "exclusion_reason",
    "source_provenance",
]


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def workbook_path(filename: str, year: str, season: str) -> Path:
    release_folder = "annual" if season == "annual" else f"season_{season.lower()}"
    return RAW_SAS_DIR / year / release_folder / "workbooks" / filename


def sheet_title(worksheet) -> str:
    """The first non-empty text cell in the sheet's top-left region.

    Titles sit in different cells across releases (A2, B2, B3 ...), so scan the
    first few rows and keep the first string cell verbatim. The stray
    "List of Tables" banner that many 2022 data sheets carry in A1 is skipped:
    it is a workbook artefact, not the table's title, and treating it as one
    would misclassify data sheets as metadata.
    """
    for row in worksheet.iter_rows(min_row=1, max_row=6, max_col=3, values_only=True):
        for value in row:
            if isinstance(value, str) and value.strip():
                if value.strip().lower() == "list of tables":
                    continue
                return " ".join(value.split())
    return ""


def sheet_shape(worksheet) -> tuple[int | None, int | None]:
    # read_only worksheets expose calculate_dimension(), not .dimensions.
    dims = worksheet.calculate_dimension()  # e.g. "A1:K99"
    if not dims or ":" not in dims:
        return None, None
    try:
        # coordinate_to_tuple returns (row, column).
        max_row, max_col = openpyxl.utils.cell.coordinate_to_tuple(
            dims.split(":")[1].strip()
        )
        return max_row, max_col
    except (ValueError, TypeError):
        return None, None


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    hashes: dict[str, str] = {}
    for filename, year, season in WORKBOOKS:
        path = workbook_path(filename, year, season)
        if not path.exists():
            log(f"MISSING workbook: {filename}")
            return 1
        hashes[filename] = sha256_of(path)

    # A domain counts as exposed only when its processed dataset exists here.
    exposed_domains = {
        domain
        for domain, filename in DOMAIN_OUTPUTS.items()
        if (DATA_DIR / "processed" / filename).exists()
    }
    log(f"exposed domains (processed dataset present): {sorted(exposed_domains)}")

    # Detect accidental duplicate source files if the inventory expands later.
    canonical_of: dict[str, str] = {}
    seen: dict[str, str] = {}
    for filename, _, _ in WORKBOOKS:
        digest = hashes[filename]
        canonical_of[filename] = seen.setdefault(digest, filename)

    rows: list[dict] = []
    for filename, year, season in WORKBOOKS:
        path = workbook_path(filename, year, season)
        release = FILENAME_TO_RELEASE[filename]
        is_duplicate = canonical_of[filename] != filename
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            for sheet_name in workbook.sheetnames:
                worksheet = workbook[sheet_name]
                title = sheet_title(worksheet)
                max_row, max_col = sheet_shape(worksheet)
                # The 2022 workbook carries padded sheet names ("Table 12 ",
                # " Table 26"); the extraction strips them for the CSV filename
                # and the map uses the stripped form, so look up the stripped
                # name while keeping the printed one for provenance.
                spec = tmap.get_spec(release, sheet_name.strip()) if release else None

                # Metadata is decided by the sheet NAME only. Data sheets in
                # the 2022 workbook carry a "List of Tables" banner in A1, so
                # classifying by title cell would drop real observations.
                is_metadata = sheet_name.strip().lower() in METADATA_SHEETS

                if is_duplicate:
                    stage = "duplicate"
                    exclusion_reason = (
                        f"byte-identical copy of {canonical_of[filename]} "
                        "(same SHA-256); never ingested separately"
                    )
                elif is_metadata:
                    stage = "metadata"
                    exclusion_reason = "table-of-contents sheet, non-quantitative"
                elif spec is not None and spec.domain in exposed_domains:
                    stage = "used"
                    exclusion_reason = ""
                elif spec is not None:
                    stage = "mapped_not_exposed"
                    exclusion_reason = (
                        f"mapped ({spec.domain}) and ingested with full lineage, but "
                        f"{DOMAIN_OUTPUTS.get(spec.domain, 'no processed dataset')} is "
                        "not built in this checkout, so no API/UI surface reads it yet"
                    )
                else:
                    stage = "not_yet_mapped"
                    exclusion_reason = (
                        ARCHIVE_ONLY_REASON
                        if filename in {
                            "Tables_2025_Season_B_0.xlsx",
                            "Tables_2025_Season_B_0_curated_official.xlsx",
                        }
                        else (
                            "sheet has no reviewed sas_table_map specification; "
                            "preserved for source review, not exposed as analytical data"
                        )
                    )

                source_kind = (
                    "curated original"
                    if filename.endswith("_curated_official.xlsx")
                    else "owner-supplied workbook"
                )
                rows.append(
                    {
                        "file": filename,
                        "sha256": hashes[filename],
                        "year": year,
                        "season": season,
                        "sheet": sheet_name,
                        "title": title,
                        "rows": max_row if max_row is not None else "",
                        "columns": max_col if max_col is not None else "",
                        "indicator_group": spec.domain if spec else "",
                        "unit": (spec.unit or "") if spec else "",
                        "geography": spec.geography_level if spec else "",
                        "period_grain": (
                            "seasonal" if season in ("A", "B", "C") else "annual"
                        ),
                        "mapped": "True" if spec is not None else "False",
                        "mapping_id": (
                            f"{release}:{sheet_name}" if spec is not None else ""
                        ),
                        "ingestion_stage": stage,
                        "exclusion_reason": exclusion_reason,
                        "source_provenance": (
                            "NISR Seasonal Agricultural Survey ("
                            f"{source_kind}; "
                            f"source_id {SAS_SOURCE_IDS.get(release, 'UNASSIGNED')})"
                        ),
                    }
                )
        finally:
            workbook.close()

    rows.sort(key=lambda r: (r["year"], r["season"], r["file"], r["sheet"]))

    with open(OUT_PATH, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    # Summary for the audit doc and CI logs.
    by_stage: dict[str, int] = {}
    for row in rows:
        by_stage[row["ingestion_stage"]] = by_stage.get(row["ingestion_stage"], 0) + 1
    total = len(rows)
    log(f"wrote {OUT_PATH.relative_to(REPO_ROOT)}: {total} sheet instances")
    for stage in sorted(by_stage):
        log(f"  {stage}: {by_stage[stage]}")

    # Release coverage of the reviewed map, recalculated from this checkout.
    mapped_releases = {spec.release for spec in tmap.ALL_TABLES}
    log(f"reviewed map covers releases: {sorted(mapped_releases)}")
    log(f"canonical workbook per sha256: {canonical_of}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
