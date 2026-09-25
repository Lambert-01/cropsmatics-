#!/usr/bin/env python3
"""Build the 2026 cold-chain network summary table (MINAGRI add-on, 11).

Source: MINAGRI-ACES cold-chain partnership announcement
(``data/raw/external/minagri/11_cold_chain_network_summary_2026.csv``).

This is **program-level context**, not facility data. The announcement names a
10-packhouse network and six program districts but publishes no facility-level
capacity and no coordinates. ``capacity`` therefore stays null and
``capacity_status`` records ``not_verified``.

The named program districts are cross-checked against the district dictionary
and exposed as ``district_names`` so downstream code (and the API) never has to
parse free text out of a note field.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import (
    DICTS_DIR,
    PROCESSED_DIR,
    PROCESSED_FILES,
    add_provenance,
    log,
    raw_path,
)

OUT = PROCESSED_FILES["cold_chain_network_summary"]
SCRIPT = "scripts/data/build_cold_chain_network_summary.py"

DISTRICT_INDICATOR = "Program districts named"


def main() -> int:
    df = pd.read_csv(raw_path("cold_chain_network_summary"))

    df["indicator"] = df["indicator"].astype(str).str.strip()
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["unit"] = df["unit"].astype(str).str.strip()
    df["notes"] = df.get("notes", pd.Series([""] * len(df))).fillna("").astype(str).str.strip()

    known = set(pd.read_csv(DICTS_DIR / "districts.csv")["district"].astype(str))
    district_names = ""
    if (df["indicator"] == DISTRICT_INDICATOR).any():
        row = df.loc[df["indicator"] == DISTRICT_INDICATOR].iloc[0]
        names = [n.strip() for n in str(row["notes"]).split(",") if n.strip()]
        unknown = sorted(set(names) - known)
        if unknown:
            raise SystemExit(
                f"{SCRIPT}: program districts not in the district dictionary: {unknown}"
            )
        district_names = ", ".join(names)
        log(f"program districts verified against dictionary: {district_names}")

    df["district_names"] = df["indicator"].apply(
        lambda i: district_names if i == DISTRICT_INDICATOR else ""
    )

    # Facility-level capacity/location are simply not published. Say so in-band
    # instead of leaving the absence ambiguous.
    df["capacity"] = pd.NA
    df["capacity_status"] = "not_verified"
    df["location_status"] = "not_published"

    df = add_provenance(df, "cold_chain_network_summary", SCRIPT)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)
    log(
        f"built {OUT}: {len(df)} program indicators "
        f"({int((df['geographic_level'] == 'national/program').sum())} program-level), "
        "capacity not_verified on all rows"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
