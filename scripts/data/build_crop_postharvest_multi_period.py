#!/usr/bin/env python3
"""Build the multi-period crop post-harvest use table.

Input:  ``data/interim/sas_postharvest_long.csv`` (written by
        ``ingest_sas_tables``), one row per period x crop x indicator.
Output: ``data/processed/crop_postharvest_use_multi_period.csv``, long form:
        one row per period x crop x indicator, plus the per-period share total.

The legacy ``crop_postharvest_use.csv`` is a single release (2025 Season B) and
stays exactly as it is - existing clients read it. This table is the multi-period
counterpart the coverage audit asked for, and is the file name already declared
in ``inventory_sas_workbooks.DOMAIN_OUTPUTS`` (``crop_postharvest_use_multi_period.csv``)
and ``common.PROCESSED_FILES['crop_postharvest_use_multi']``.

The published indicators are shares of a crop's total use and are meant to sum
to 100 per crop and period. That is a real, checkable property of the source, so
it is verified here instead of assumed: ``shares_sum_pct`` and ``shares_sum_ok``
are computed per (period, crop) with the same +/-1 point rounding tolerance the
legacy builder uses. A published share that does not reconcile is flagged, never
rescaled - official figures are not modified to make a total agree.

Nothing is imputed and nulls stay null.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data.common import (
    INTERIM_DIR,
    PROCESSED_DIR,
    PROCESSED_FILES,
    log,
)

SCRIPT = "scripts/data/build_crop_postharvest_multi_period.py"
OUT = PROCESSED_FILES["crop_postharvest_use_multi"]

INPUT = INTERIM_DIR / "sas_postharvest_long.csv"

# Same rounding tolerance as build_postharvest_dataset.py: the published shares
# are rounded to two decimals, so a total within one point of 100 is rounding,
# not a source error.
SHARES_TOLERANCE_PCT = 1.0

COLUMNS = [
    "period_code",
    "year",
    "season",
    "crop_raw",
    "crop",
    "canonical_crop_name",
    "indicator_code",
    "value",
    "unit",
    "shares_sum_pct",
    "shares_sum_ok",
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


def build(long_df: pd.DataFrame, alias: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    df = long_df.copy()
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["crop"] = df["crop"].astype("string").str.strip()
    df["crop_raw"] = df["crop_raw"].astype("string").str.strip()

    df = df.merge(
        alias.rename(columns={"raw_crop_name": "crop"})[
            ["crop", "canonical_crop_name"]
        ].drop_duplicates(),
        on="crop",
        how="left",
    )

    # Share total per published crop and period. `min_count=1` keeps an
    # all-null group null instead of collapsing it to 0, so "not published"
    # can never be read as "sums to nothing".
    totals = (
        df.groupby(["period_code", "crop"], dropna=False)["value"]
        .sum(min_count=1)
        .rename("shares_sum_pct")
        .reset_index()
    )
    df = df.merge(totals, on=["period_code", "crop"], how="left")
    df["shares_sum_ok"] = (df["shares_sum_pct"] - 100.0).abs() <= SHARES_TOLERANCE_PCT
    # A group whose total was never published has nothing to reconcile.
    df.loc[df["shares_sum_pct"].isna(), "shares_sum_ok"] = False

    df["processing_script"] = SCRIPT
    df["processing_version"] = "0.2.0"
    df["is_synthetic"] = False

    for col in ("unit", "source_title_raw", "source_kind", "period_override_reason"):
        if col not in df.columns:
            df[col] = ""
        else:
            df[col] = df[col].fillna("")

    out = df.reindex(columns=COLUMNS)
    out = out.sort_values(
        ["period_code", "crop", "indicator_code"], kind="stable"
    ).reset_index(drop=True)

    failing = (
        out.groupby(["period_code", "crop"], dropna=False)["shares_sum_ok"]
        .first()
        .reset_index()
    )
    stats = {
        "rows": len(out),
        "periods": sorted(out["period_code"].dropna().unique().tolist()),
        "crops": int(out["crop"].nunique()),
        "indicators": int(out["indicator_code"].nunique()),
        "groups": int(len(failing)),
        "groups_off_total": int((~failing["shares_sum_ok"]).sum()),
        "null_values": int(out["value"].isna().sum()),
    }
    return out, stats


def main() -> int:
    if not INPUT.exists():
        log(f"ERROR: {INPUT.name} not found - run scripts.data.ingest_sas_tables first")
        return 1

    long_df = pd.read_csv(INPUT)
    if long_df.empty:
        log("ERROR: ingest output is empty - refusing to write an empty table")
        return 1

    alias_path = INTERIM_DIR / "crop_alias_map.csv"
    alias = pd.read_csv(alias_path) if alias_path.exists() else pd.DataFrame(
        columns=["raw_crop_name", "canonical_crop_name"]
    )

    df, stats = build(long_df, alias)

    if df.empty or df["value"].isna().all():
        log("ERROR: no usable published values - refusing to write an empty table")
        return 1

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)

    log(
        f"built {OUT}: {stats['rows']} rows, {len(stats['periods'])} periods "
        f"({', '.join(stats['periods'])}), {stats['crops']} crops, "
        f"{stats['indicators']} indicators; {stats['null_values']} published nulls preserved"
    )
    log(
        f"  share totals: {stats['groups']} period x crop groups, "
        f"{stats['groups_off_total']} outside the +/-{SHARES_TOLERANCE_PCT:g} point "
        "rounding tolerance (flagged, never rescaled)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
