#!/usr/bin/env python3
"""Build the canonical multi-period district x crop productivity panel.

Input:  ``data/interim/sas_productivity_long.csv`` (written by
        ``ingest_sas_tables``), one row per period x district x crop x metric.
Output: ``data/processed/crop_productivity.csv``, one row per
        period x geography x crop with the four published metrics in columns.

The panel covers every period NISR has published (2024A-2026B). Values are
never imputed: a district that published no figure keeps a null instead of a
zero, and a crop NISR did not tabulate for a period simply has no row rather
than a fabricated zero.

National / small-scale / large-scale rows are kept, tagged with
``geography_level`` and ``farmer_scale`` and with an empty ``district``, so an
aggregate can never be mistaken for a district observation. The legacy
single-release output (``district_crop_productivity.csv``) stays in place for
the clients that still read it and for the 2025B parity test.
"""

from __future__ import annotations

import json
import sys

import pandas as pd

from scripts.data.common import (
    DICTS_DIR,
    INTERIM_DIR,
    PIPELINE_VERSION,
    PROCESSED_DIR,
    PROCESSED_FILES,
    SAS_WORKBOOKS,
    log,
)

SCRIPT = "scripts/data/build_crop_productivity.py"
OUT = PROCESSED_FILES["crop_productivity"]

METRIC_COLUMNS = {
    "cultivated_area": "cultivated_area_ha",
    "harvested_area": "harvested_area_ha",
    "production": "production_mt",
    "yield": "yield_kg_ha",
}

# Row scope in the long frame -> (geography_level, farmer_scale).
SCOPE_MAP: dict[str, tuple[str, str]] = {
    "district": ("DISTRICT", "all"),
    "total": ("NATIONAL", "all"),
    "national": ("NATIONAL", "all"),
    "ssf": ("NATIONAL", "ssf"),
    "lsf": ("NATIONAL", "lsf"),
}

NATIONAL_GEOGRAPHY_CODE = "RW"

INDEX_COLS = ["period_code", "year", "season", "row_scope", "district", "crop"]


def _join_unique(values: pd.Series) -> str:
    return "|".join(sorted({str(v) for v in values.dropna() if str(v)}))


def _build_lineage(long_df: pd.DataFrame) -> pd.DataFrame:
    """Per-panel-row provenance, including which sheet each metric came from."""
    grouped = (
        long_df.groupby(INDEX_COLS, dropna=False)
        .agg(
            source_id=("source_id", "first"),
            source_release=("source_release", "first"),
            source_sheets=("source_sheet", _join_unique),
            source_titles_raw=("source_title_raw", _join_unique),
            period_override_reason=(
                "period_override_reason",
                lambda s: _join_unique(s.fillna("")),
            ),
            source_row_min=("source_row", "min"),
            row_scope_raw=("row_scope_raw", _join_unique),
        )
        .reset_index()
    )
    grouped["source_workbook"] = grouped["source_release"].map(SAS_WORKBOOKS).fillna("")

    # One metric column can come from its own sheet (cultivated area, harvested
    # area, yield and production are four different tables), so record the map
    # instead of pretending a single sheet produced all four numbers.
    # ``pivot`` (not ``pivot_table``) so no cartesian product of index levels is
    # invented: every (period, scope, district, crop, metric) pair is unique by
    # construction of the ingest, and a duplicate raises instead of being
    # silently averaged away.
    sheets = (
        long_df.pivot(index=INDEX_COLS, columns="metric", values="source_sheet")
        .rename(columns={m: f"source_sheet__{m}" for m in METRIC_COLUMNS})
        .reset_index()
    )
    merged = grouped.merge(sheets, on=INDEX_COLS, how="left")

    def metric_map(row: pd.Series) -> str:
        mapping = {}
        for metric in sorted(METRIC_COLUMNS):
            sheet = row.get(f"source_sheet__{metric}")
            if isinstance(sheet, str) and sheet:
                mapping[metric] = sheet
        return json.dumps(mapping, sort_keys=True, separators=(",", ":"))

    merged["metric_source_map"] = merged.apply(metric_map, axis=1)
    return merged.drop(columns=[f"source_sheet__{m}" for m in METRIC_COLUMNS])


def build(long_df: pd.DataFrame) -> pd.DataFrame:
    unknown_metrics = sorted(set(long_df["metric"]) - set(METRIC_COLUMNS))
    if unknown_metrics:
        raise ValueError(f"ingest output has unmapped metrics: {unknown_metrics}")

    wide = (
        long_df.pivot(index=INDEX_COLS, columns="metric", values="value")
        .reset_index()
        .rename(columns=METRIC_COLUMNS)
    )
    duplicate_rows = int(long_df.duplicated(INDEX_COLS + ["metric"]).sum())
    if duplicate_rows:
        raise ValueError(
            "ingest output has duplicate (period, scope, district, crop, metric) "
            f"rows: {duplicate_rows}"
        )

    # Only the metrics actually mapped for a period become columns; add the rest
    # as fully-null columns so the panel schema is stable across periods.
    for metric in METRIC_COLUMNS:
        if METRIC_COLUMNS[metric] not in wide.columns:
            wide[METRIC_COLUMNS[metric]] = pd.NA

    df = wide.merge(_build_lineage(long_df), on=INDEX_COLS, how="left")

    levels = df["row_scope"].map(lambda s: SCOPE_MAP.get(s))
    df["geography_level"] = [level[0] if level else "UNKNOWN" for level in levels]
    df["farmer_scale"] = [level[1] if level else "unknown" for level in levels]
    unknown_scopes = sorted(set(df.loc[df["geography_level"] == "UNKNOWN", "row_scope"]))
    if unknown_scopes:
        raise ValueError(f"unmapped row scopes in ingest output: {unknown_scopes}")

    # Read the dictionaries directly (not the interim dims) so this step does
    # not depend on the normalize_* steps having run first.
    dim_district = pd.read_csv(DICTS_DIR / "districts.csv")
    dim_crop = pd.read_csv(DICTS_DIR / "crops.csv")

    is_district = df["geography_level"] == "DISTRICT"
    df["district"] = df["district"].astype(str).str.strip()
    # Aggregate rows carry a label ("Total", "National", ...) in the district
    # column; keep that label only in ``row_scope`` so ``district`` is a real
    # district or null, never a category.
    df.loc[~is_district, "district"] = pd.NA

    df = df.merge(
        dim_district[["district", "district_code", "province", "agro_ecological_zone"]],
        on="district",
        how="left",
    )
    df["geography_code"] = df["district_code"].where(is_district, NATIONAL_GEOGRAPHY_CODE)
    df["district_code"] = df["district_code"].where(is_district)
    df["province"] = df["province"].where(is_district)
    df["agro_ecological_zone"] = df["agro_ecological_zone"].where(is_district)

    df = df.merge(
        dim_crop[
            [
                "crop_name",
                "crop_code",
                "category",
                "perishability",
                "cold_chain_recommended",
            ]
        ],
        left_on="crop",
        right_on="crop_name",
        how="left",
    ).drop(columns=["crop_name"])
    df = df.rename(columns={"crop": "crop_name_raw"})
    # The published label already resolves to the crop dictionary, so the
    # canonical name matches it. Exposed under the same column name the other
    # processed tables use, so analysts join on one vocabulary.
    df["canonical_crop_name"] = df["crop_name_raw"]

    unresolved = sorted(set(df.loc[is_district, "district"].dropna()) - set(dim_district["district"]))
    if unresolved:
        raise ValueError(f"districts missing from the dictionary: {unresolved}")
    unresolved_crops = sorted(df.loc[df["crop_code"].isna(), "crop_name_raw"].dropna())
    if unresolved_crops:
        raise ValueError(f"crops missing from the dictionary: {unresolved_crops}")

    # Data-quality flags, mirroring the legacy builder (annotation, not repair).
    df["cultivated_area_reported"] = df["cultivated_area_ha"].notna()
    df["yield_reported"] = df["yield_kg_ha"].fillna(0) > 0
    df["harvest_ratio"] = (df["harvested_area_ha"] / df["cultivated_area_ha"]).where(
        df["cultivated_area_ha"] > 0
    )

    df["source_period"] = df["period_code"]
    df["processing_script"] = SCRIPT
    df["processing_version"] = PIPELINE_VERSION
    df["is_synthetic"] = False

    ordered = [
        "period_code",
        "year",
        "season",
        "geography_level",
        "geography_code",
        "district",
        "district_code",
        "province",
        "agro_ecological_zone",
        "farmer_scale",
        "row_scope",
        "row_scope_raw",
        "crop_code",
        "crop_name_raw",
        "canonical_crop_name",
        "category",
        "perishability",
        "cold_chain_recommended",
        "cultivated_area_ha",
        "harvested_area_ha",
        "production_mt",
        "yield_kg_ha",
        "cultivated_area_reported",
        "yield_reported",
        "harvest_ratio",
        "source_id",
        "source_period",
        "source_release",
        "source_workbook",
        "source_sheets",
        "source_titles_raw",
        "period_override_reason",
        "metric_source_map",
        "source_row_min",
        "processing_script",
        "processing_version",
        "is_synthetic",
    ]
    df = df[ordered].sort_values(
        ["period_code", "geography_level", "farmer_scale", "geography_code", "crop_code"],
        kind="stable",
        na_position="last",
    )
    return df.reset_index(drop=True)


def main() -> int:
    long_path = INTERIM_DIR / "sas_productivity_long.csv"
    if not long_path.exists():
        log(f"ERROR: {long_path.name} not found - run scripts.data.ingest_sas_tables first")
        return 1

    long_df = pd.read_csv(long_path)
    if long_df.empty:
        log("ERROR: ingest output is empty - refusing to write an empty panel")
        return 1

    df = build(long_df)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = PROCESSED_DIR / OUT
    df.to_csv(out, index=False)

    districts = df[df["geography_level"] == "DISTRICT"]
    log(
        f"built {OUT}: {len(df)} rows, {df['period_code'].nunique()} periods "
        f"({', '.join(sorted(df['period_code'].unique()))}), "
        f"{districts['district'].nunique()} districts, {df['crop_code'].nunique()} crops"
    )
    log(f"  district rows: {len(districts)}, national/scale rows: {len(df) - len(districts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
