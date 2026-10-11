#!/usr/bin/env python3
"""Build the multi-period district agricultural-practice observation table.

Input:  ``data/interim/sas_practices_long.csv`` and
        ``data/interim/sas_district_indicators_long.csv`` (both written by
        ``ingest_sas_tables``), one row per period x district x indicator.
Output: ``data/processed/agricultural_practice_observation.csv``, one row per
        period x geography x domain x indicator.

This is the missing link described in ``docs/data/SAS_COVERAGE_AUDIT.md``: the
practice, irrigation, water-source, erosion-control and erosion-severity sheets
have been mapped and ingested with full lineage since the P2 expansion, but no
processed dataset surfaced them, so every one of those sheets was honestly
reported as ``mapped_not_exposed``. This builder materializes them.

The file name is not chosen here - it is the contract already declared in
``inventory_sas_workbooks.DOMAIN_OUTPUTS`` (``agricultural_practice_observation.csv``)
and ``common.PROCESSED_FILES['agricultural_practices']``, so the sheet
classifier starts counting these sheets as ``used`` the moment this file exists.

Units are the published ones (``percent`` throughout) and are carried per row
rather than assumed by the reader. Two vocabularies from the source are kept
distinct on purpose:

* ``domain`` is the reviewed mapping's domain (``practice``, ``irrigation``,
  ``water_source``, ``erosion_control``, ``erosion_severity``);
* ``indicator_code`` is the published indicator within that domain.

They are never collapsed into one field, because "fertilizer use" and "drip
irrigation adoption" are different measurements that must not be averaged.

Nothing is imputed. A district/period/indicator NISR did not publish has no
row here at all - never a zero. National ``Total`` rows are kept but tagged
``geography_level=NATIONAL`` with an empty ``district``, so an aggregate can
never be read as a district observation.
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.data import sas_table_map as tmap
from scripts.data.common import (
    INTERIM_DIR,
    PROCESSED_DIR,
    PROCESSED_FILES,
    log,
)

SCRIPT = "scripts/data/build_agricultural_practice_observation.py"
OUT = PROCESSED_FILES["agricultural_practices"]

# Interim sources that feed this dataset, in deterministic read order.
SOURCE_FILES = (
    INTERIM_DIR / "sas_practices_long.csv",
    INTERIM_DIR / "sas_district_indicators_long.csv",
)

# Row scope in the long frame -> (geography_level, farmer_scale). Mirrors
# ``build_crop_productivity.SCOPE_MAP`` so both panels describe scope the same way.
SCOPE_MAP: dict[str, str] = {
    "district": "DISTRICT",
    "total": "NATIONAL",
    "national": "NATIONAL",
}
NATIONAL_GEOGRAPHY_CODE = "RW"

# Only the domains this dataset owns. Productivity has its own canonical panel
# (``crop_productivity.csv``) and must never be duplicated into this one.
OWNED_DOMAINS = frozenset(
    {"practice", "irrigation", "water_source", "erosion_control", "erosion_severity"}
)

COLUMNS = [
    "period_code",
    "year",
    "season",
    "row_scope",
    "row_scope_raw",
    "geography_level",
    "district",
    "district_code",
    "province",
    "agro_ecological_zone",
    "domain",
    "indicator_code",
    "value",
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


def _domain_of(release: str, sheet: str) -> str | None:
    """Reviewed domain for an interim row, or None when the map does not cover it.

    The domain is resolved from ``source_release`` + ``source_sheet`` through the
    same reviewed mapping the extraction used, so it cannot drift from
    ``sas_table_map`` and an unmapped sheet is reported rather than guessed.
    """
    spec = tmap.get_spec(str(release), str(sheet).strip())
    return spec.domain if spec else None


def _read_sources() -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for path in SOURCE_FILES:
        if not path.exists():
            log(f"WARNING: {path.name} not found - skipping (run ingest_sas_tables first)")
            continue
        df = pd.read_csv(path)
        if df.empty:
            log(f"WARNING: {path.name} is empty - skipping")
            continue
        df["_source_file"] = path.name
        frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def build(long_df: pd.DataFrame, dim_district: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    df = long_df.copy()

    for col in ("value", "source_row"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["domain"] = [
        _domain_of(release, sheet)
        for release, sheet in zip(df["source_release"], df["source_sheet"])
    ]

    unmapped = df[df["domain"].isna()]
    foreign = df[df["domain"].notna() & ~df["domain"].isin(OWNED_DOMAINS)]
    df = df[df["domain"].isin(OWNED_DOMAINS)].copy()

    df["geography_level"] = df["row_scope"].map(SCOPE_MAP).fillna("DISTRICT")
    df["district"] = df["district"].astype("string").str.strip()

    # National `Total` rows keep the published label in row_scope_raw and get an
    # empty district, exactly like the productivity panel.
    is_national = df["geography_level"] == "NATIONAL"
    df.loc[is_national, "district"] = ""

    merged = df.merge(
        dim_district[["district", "district_code", "province", "agro_ecological_zone"]],
        on="district",
        how="left",
    )
    # District rows must resolve against the district dictionary; a district that
    # does not is a real problem, not something to silently nationalise.
    district_rows = merged[merged["geography_level"] == "DISTRICT"]
    unresolved = sorted(
        set(district_rows.loc[district_rows["district_code"].isna(), "district"].dropna())
    )
    if unresolved:
        raise ValueError(
            f"{len(unresolved)} district label(s) do not resolve against dim_district: "
            f"{unresolved[:10]}"
        )

    merged.loc[merged["geography_level"] == "NATIONAL", "district_code"] = (
        NATIONAL_GEOGRAPHY_CODE
    )
    for col in ("province", "agro_ecological_zone"):
        merged.loc[merged["geography_level"] == "NATIONAL", col] = ""

    merged["processing_script"] = SCRIPT
    merged["processing_version"] = "0.2.0"
    merged["is_synthetic"] = False

    for col, default in (
        ("source_title_raw", ""),
        ("source_kind", ""),
        ("period_override_reason", ""),
        ("unit", ""),
    ):
        if col not in merged.columns:
            merged[col] = default
        else:
            merged[col] = merged[col].fillna("")

    out = merged.reindex(columns=COLUMNS)
    out = out.sort_values(
        ["period_code", "row_scope", "district", "domain", "indicator_code"],
        kind="stable",
    ).reset_index(drop=True)

    stats = {
        "rows": len(out),
        "periods": sorted(out["period_code"].dropna().unique().tolist()),
        "districts": int(out.loc[out["geography_level"] == "DISTRICT", "district"].nunique()),
        "domains": sorted(out["domain"].unique().tolist()),
        "unmapped_rows_dropped": int(len(unmapped)),
        "foreign_domain_rows_dropped": int(len(foreign)),
        "null_values": int(out["value"].isna().sum()),
    }
    return out, stats


def main() -> int:
    long_df = _read_sources()
    if long_df.empty:
        log("ERROR: no interim practice/indicator input found - refusing to write an empty table")
        return 1

    dim_path = INTERIM_DIR / "dim_district.csv"
    if not dim_path.exists():
        log(f"ERROR: {dim_path.name} not found - run scripts.data.normalize_geography first")
        return 1
    dim_district = pd.read_csv(dim_path)

    df, stats = build(long_df, dim_district)

    if df.empty:
        log("ERROR: every input row was dropped - refusing to write an empty table")
        return 1
    if df["value"].isna().all():
        log("ERROR: every value is null - refusing to write a valueless table")
        return 1

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / OUT, index=False)

    log(
        f"built {OUT}: {stats['rows']} rows, {len(stats['periods'])} periods "
        f"({', '.join(stats['periods'])}), {stats['districts']} districts, "
        f"domains {', '.join(stats['domains'])}"
    )
    log(
        f"  dropped {stats['unmapped_rows_dropped']} unmapped + "
        f"{stats['foreign_domain_rows_dropped']} non-owned-domain interim rows; "
        f"{stats['null_values']} published nulls preserved"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
