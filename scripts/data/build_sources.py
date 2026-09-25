#!/usr/bin/env python3
"""Build a processed, provenance-tagged copy of the source registry (09).

The registry documents where every official value came from. It is surfaced by
``GET /api/v1/meta/sources`` and the transparency page.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import PROCESSED_DIR, PROCESSED_FILES, log, raw_path

OUT = PROCESSED_FILES["data_sources"]
SCRIPT = "scripts/data/build_sources.py"


def main() -> int:
    df = pd.read_csv(raw_path("source_registry"))
    df["processing_script"] = SCRIPT
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(f"built {OUT}: {len(df)} registered sources")
    return 0


if __name__ == "__main__":
    sys.exit(main())
