#!/usr/bin/env python3
"""Build the national fertilizer-source-by-type analytical table.

The source sheets publish percentages by fertilizer product and supply channel.
This output preserves that grain and full lineage. It is deliberately separate
from the district practice observations: a national supplier mix is not a
district access measure and cannot be used as a yield cause or input score.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import INTERIM_DIR, PROCESSED_DIR, PROCESSED_FILES, log

SCRIPT = "scripts/data/build_fertilizer_source.py"
OUT = PROCESSED_FILES["fertilizer_source"]
SOURCE_FILE = INTERIM_DIR / "sas_fertilizer_source_long.csv"

COLUMNS = [
    "period_code",
    "year",
    "season",
    "geography_level",
    "province",
    "district",
    "district_code",
    "fertilizer_name_raw",
    "fertilizer_name",
    "source_channel",
    "share_pct",
    "reported_total_pct",
    "source_sum_pct",
    "source_sum_check",
    "unit",
    "source_id",
    "source_release",
    "source_sheet",
    "source_title_raw",
    "source_row",
    "source_kind",
    "period_override_reason",
    "processing_script",
    "processing_version",
    "is_synthetic",
]


def build(source: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    if source.empty:
        raise ValueError("fertilizer source input is empty")
    frame = source.copy()
    for column in ("share_pct", "reported_total_pct", "source_sum_pct", "source_row"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame["processing_script"] = SCRIPT
    frame["processing_version"] = "0.2.0"
    frame["is_synthetic"] = False
    frame = frame.reindex(columns=COLUMNS)
    frame = frame.sort_values(
        ["period_code", "fertilizer_name", "source_channel", "source_row"],
        kind="stable",
    ).reset_index(drop=True)
    stats = {
        "rows": len(frame),
        "periods": frame["period_code"].nunique(),
        "fertilizer_types": frame["fertilizer_name"].nunique(),
    }
    return frame, stats


def main() -> int:
    if not SOURCE_FILE.exists():
        log(f"ERROR: {SOURCE_FILE.name} not found - run scripts.data.ingest_sas_tables first")
        return 1
    source = pd.read_csv(SOURCE_FILE)
    try:
        frame, stats = build(source)
    except ValueError as error:
        log(f"ERROR: {error}")
        return 1
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    frame.to_csv(PROCESSED_DIR / OUT, index=False)
    log(
        f"built {OUT}: {stats['rows']} rows, {stats['fertilizer_types']} fertilizer types, "
        f"{stats['periods']} periods; published blanks remain unavailable"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
