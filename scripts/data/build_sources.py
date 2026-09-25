#!/usr/bin/env python3
"""Build a processed, provenance-tagged copy of the source registry (09).

The registry documents where every official value came from. It is surfaced by
``GET /api/v1/meta/sources`` and the transparency page.

The MINAGRI add-on package ships its own ``source_registry_additions.csv``;
those rows are appended so the newly ingested national datasets are registered
with the same owner/period/limitation metadata as the primary pack.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import PROCESSED_DIR, PROCESSED_FILES, log, raw_path

OUT = PROCESSED_FILES["data_sources"]
SCRIPT = "scripts/data/build_sources.py"


def main() -> int:
    df = pd.read_csv(raw_path("source_registry"))
    base_rows = len(df)

    additions_path = raw_path("source_registry_additions")
    added = 0
    if additions_path.exists():
        additions = pd.read_csv(additions_path)
        # Map the add-on registry into the processed registry's schema so one
        # table can serve /meta/sources and the transparency page.
        mapped = pd.DataFrame(
            {
                "dataset": additions["source"],
                "coverage": additions.get("period"),
                "use": additions.get("recommended_use"),
                "official_page": additions.get("url"),
                "official_excel": "not published",
                "status_in_package": "official add-on ingested",
                "owner": additions.get("owner"),
                "limitations": additions.get("limitations"),
            }
        )
        added = len(mapped)
        df = pd.concat([df, mapped], ignore_index=True)

    before = len(df)
    df = df.drop_duplicates(subset=["dataset"])
    log(f"deduplicated {before - len(df)} registry row(s)")

    df["processing_script"] = SCRIPT
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(f"built {OUT}: {len(df)} registered sources ({base_rows} primary + {added} MINAGRI add-on)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
