#!/usr/bin/env python3
"""Normalize crops into a canonical dimension.

Maps crop strings seen in raw tables (including post-harvest sub-categories such
as ``Cooking banana``) to the canonical crop list in
``data/dictionaries/crops.csv``, then writes ``data/interim/dim_crop.csv`` plus
``data/interim/crop_alias_map.csv`` documenting every alias decision.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import DICTS_DIR, INTERIM_DIR, log, raw_path

# Explicit alias -> canonical crop name. Kept visible rather than hidden in code.
ALIASES = {
    "Cooking banana": "Banana",
    "Dessert banana": "Banana",
    "Banana for beer": "Banana",
    "Bush bean": "Beans",
    "Climbing bean": "Beans",
    "Pea": "Beans",
    "Yam & Taro": "Yams & Taro",
}


def main() -> int:
    crops = pd.read_csv(DICTS_DIR / "crops.csv")
    canonical = set(crops["crop_name"].astype(str))

    seen: set[str] = set()
    for key in ("district_crop_productivity", "crop_postharvest_use"):
        df = pd.read_csv(raw_path(key))
        if "crop" in df.columns:
            seen |= set(df["crop"].dropna().astype(str).str.strip())

    rows = []
    unresolved = []
    for name in sorted(seen):
        target = name if name in canonical else ALIASES.get(name)
        if target is None or target not in canonical:
            unresolved.append(name)
        rows.append({"raw_crop_name": name, "canonical_crop_name": target})
    if unresolved:
        log(f"ERROR: crops with no canonical mapping: {unresolved}")
        return 1

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    alias_map = pd.DataFrame(rows)
    alias_map.to_csv(INTERIM_DIR / "crop_alias_map.csv", index=False)
    crops.to_csv(INTERIM_DIR / "dim_crop.csv", index=False)
    log(f"dim_crop: {len(crops)} crops; alias map: {len(alias_map)} raw names -> "
        f"{(alias_map['canonical_crop_name'] != alias_map['raw_crop_name']).sum()} aliased")
    return 0


if __name__ == "__main__":
    sys.exit(main())
