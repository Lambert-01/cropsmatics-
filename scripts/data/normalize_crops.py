#!/usr/bin/env python3
"""Normalize crops into a canonical dimension.

Maps crop strings seen in raw tables (including post-harvest sub-categories such
as ``Cooking banana``) to the canonical crop list in
``data/dictionaries/crops.csv``, then writes ``data/interim/dim_crop.csv`` plus
``data/interim/crop_alias_map.csv`` documenting every alias decision.

``alias_map()`` exposes the mapping itself for any step that needs it, including
steps that run *before* this one (``ingest_sas_tables``), so no build order can
change which crop names the built dataset carries.
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
    "Taro &Yams": "Yams & Taro",
}


def alias_map() -> pd.DataFrame:
    """Raw published crop name -> canonical crop name, or raise on an unmapped one.

    Derived here from committed inputs only (``data/raw`` plus
    ``data/dictionaries/crops.csv``) and returned, instead of being read back from
    the interim artefact ``main`` writes later in the pipeline. That matters to
    correctness, not just to tidiness:

    ``ingest_sas_tables`` parses the post-harvest tables *before* this script
    runs, so it used to read whatever ``data/interim/crop_alias_map.csv`` a
    previous build had left behind. A pristine build (the API image, a fresh
    checkout, CI) therefore produced raw published labels ("Banana for beer")
    while a second build in the same tree produced canonical ones ("Banana") -
    the same commit, two different datasets, two different dataset versions. The
    identity check would then reject the load the deploy had just performed.

    Raising (rather than returning a partial map) keeps the previous contract: an
    unmapped published crop is a defect to fix in ``ALIASES``, not a value to
    guess.
    """
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
        raise ValueError(f"crops with no canonical mapping: {unresolved}")
    return pd.DataFrame(rows)


def main() -> int:
    crops = pd.read_csv(DICTS_DIR / "crops.csv")

    try:
        mapping = alias_map()
    except ValueError as error:
        log(f"ERROR: {error}")
        return 1

    # The map is written out as a reviewable artefact (and for the steps that run
    # after this one); nothing derives its behaviour from its presence.
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    mapping.to_csv(INTERIM_DIR / "crop_alias_map.csv", index=False)
    crops.to_csv(INTERIM_DIR / "dim_crop.csv", index=False)
    log(f"dim_crop: {len(crops)} crops; alias map: {len(mapping)} raw names -> "
        f"{(mapping['canonical_crop_name'] != mapping['raw_crop_name']).sum()} aliased")
    return 0


if __name__ == "__main__":
    sys.exit(main())
