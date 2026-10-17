"""Dataset explorer service.

Exposes the processed tables (and reference dictionaries) as readable, paginated
records so judges and researchers can see exactly what the platform uses. Only
whitelisted datasets are reachable — no arbitrary file access, no arbitrary
expressions: every filter is an exact-match equality on a whitelisted column,
and sorting is restricted to existing columns with a safe direction flag.
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd
from fastapi import HTTPException, status

from app.repositories import dataset_repository as repo
from app.services import period_service

# key -> (label, loader, source_id)
DATASETS: dict[str, tuple[str, str, str]] = {
    "crop_productivity": (
        # The label and source list are resolved from the loaded panel at request
        # time (see ``_resolved_meta``), so a new release cannot leave them stale.
        "Crop Productivity",
        "crop_productivity",
        "",
    ),
    "agricultural_practice_observation": (
        # Multi-period long-form practice/irrigation/erosion observations. The
        # label and source list are resolved from the loaded frame at request time
        # (see ``_resolved_meta``) so a new release cannot leave them stale.
        "Agricultural Practice Observations",
        "agricultural_practice_observation",
        "",
    ),
    "postharvest_use_multi_period": (
        "Post-Harvest Use & Loss (multi-period)",
        "postharvest_use_multi_period",
        "",
    ),
    "district_crop_productivity": (
        "District Crop Productivity (2025B legacy)",
        "productivity_dataset",
        "NISR_SAS_2025B_DISTRICT_CROP",
    ),
    "district_factors": (
        "District Factors (inputs & practices)",
        "factors_dataset",
        "NISR_SAS_2025B_DISTRICT_FACTORS",
    ),
    "irrigation_water": (
        "Irrigation & Water",
        "irrigation_water",
        "NISR_SAS_2025B_IRRIGATION_WATER",
    ),
    "erosion_control": ("Erosion Control", "erosion_control", "NISR_SAS_2025B_EROSION"),
    "crop_postharvest_use": (
        "Post-Harvest Use & Loss",
        "postharvest_use",
        "NISR_SAS_2025B_POSTHARVEST_USE",
    ),
    "national_crop_trends": (
        "National Crop Trends",
        "national_crop_trends",
        "NISR_SAS_2024_2026_NATIONAL_TRENDS",
    ),
    "national_input_trends": (
        "National Input Trends",
        "national_input_trends",
        "NISR_SAS_2024_2026_NATIONAL_INPUT_TRENDS",
    ),
    "cold_chain_context": (
        "Verified Cold-Chain Context",
        "cold_chain_context",
        "MINAGRI_ACES_COLDCHAIN_2026",
    ),
    "postharvest_infrastructure": (
        "National Post-Harvest Infrastructure (MINAGRI)",
        "postharvest_infrastructure",
        "MINAGRI_ANNUAL_REPORT_2024_2025_POSTHARVEST_INFRA",
    ),
    "cold_chain_network_summary": (
        "Cold-Chain Network Summary 2026 (MINAGRI-ACES)",
        "cold_chain_network_summary",
        "MINAGRI_ACES_COLDCHAIN_2026_NETWORK",
    ),
    "districts": ("District Dictionary", "districts", "REFERENCE_DICTIONARY"),
    "crops": ("Crop Dictionary", "crops", "REFERENCE_DICTIONARY"),
}

# Whitelisted exact-match filter columns per dataset family. Any query param
# outside these names is rejected with a 400 rather than silently ignored.
FILTERABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "crop_productivity": (
        "period_code",
        "year",
        "season",
        "district",
        "district_code",
        "province",
        "crop",
        "crop_code",
        "geography_level",
        "farmer_scale",
        "source_id",
    ),
    "agricultural_practice_observation": (
        "period_code",
        "year",
        "season",
        "geography_level",
        "district",
        "district_code",
        "province",
        "row_scope",
        "domain",
        "indicator_code",
        "source_id",
    ),
    "postharvest_use_multi_period": (
        "period_code",
        "year",
        "season",
        "crop",
        "canonical_crop_name",
        "indicator_code",
        "source_id",
    ),
    "district_crop_productivity": ("district", "province", "canonical_crop_name", "year", "season"),
    "district_factors": ("district", "province", "year", "season"),
    "irrigation_water": ("district", "province", "year", "season"),
    "erosion_control": ("district", "province", "year", "season"),
    "crop_postharvest_use": ("crop",),
    "national_crop_trends": ("crop", "year", "season"),
    "national_input_trends": ("year", "season"),
    "cold_chain_context": ("district",),
    "postharvest_infrastructure": (),
    "cold_chain_network_summary": (),
    "districts": ("province",),
    "crops": (),
}

# Common aliases accepted from the generic analytics filter vocabulary.
_COLUMN_ALIASES = {"crop": "canonical_crop_name"}

# Query params the explorer endpoints declare. FastAPI silently ignores
# undeclared query parameters, which would let a typo or a dimension the
# endpoint never asked for pass as "applied"; the explorer promises the
# opposite — see ``assert_known_query_params``.
DATASET_JSON_PARAMS: frozenset[str] = frozenset(
    {
        "limit",
        "offset",
        "search",
        "period_code",
        "year",
        "season",
        "crop",
        "province",
        "district",
        "indicator_code",
        "domain",
        "sort_by",
        "sort_dir",
    }
)
DATASET_CSV_PARAMS: frozenset[str] = DATASET_JSON_PARAMS - {"limit", "offset"}

# Which group a dataset belongs to. The explorer leads with the current
# multi-period tables and keeps the legacy single-release 2025 Season B extracts
# grouped as an archive rather than deleting them: models and tests still read
# them, and a researcher may need the exact table a published figure came from.
GROUP_CURRENT = "current"
GROUP_ARCHIVE = "archive"
GROUP_PROGRAM = "program"
GROUP_REFERENCE = "reference"

GROUP_ORDER: tuple[str, ...] = (GROUP_CURRENT, GROUP_ARCHIVE, GROUP_PROGRAM, GROUP_REFERENCE)

GROUP_LABELS: dict[str, str] = {
    GROUP_CURRENT: "Current (multi-period)",
    GROUP_ARCHIVE: "Archive (2025 Season B single release)",
    GROUP_PROGRAM: "Program context",
    GROUP_REFERENCE: "Reference",
}

DATASET_GROUPS: dict[str, str] = {
    "crop_productivity": GROUP_CURRENT,
    "agricultural_practice_observation": GROUP_CURRENT,
    "postharvest_use_multi_period": GROUP_CURRENT,
    "national_crop_trends": GROUP_CURRENT,
    "national_input_trends": GROUP_CURRENT,
    "district_crop_productivity": GROUP_ARCHIVE,
    "district_factors": GROUP_ARCHIVE,
    "irrigation_water": GROUP_ARCHIVE,
    "erosion_control": GROUP_ARCHIVE,
    "crop_postharvest_use": GROUP_ARCHIVE,
    "cold_chain_context": GROUP_PROGRAM,
    "postharvest_infrastructure": GROUP_PROGRAM,
    "cold_chain_network_summary": GROUP_PROGRAM,
    "districts": GROUP_REFERENCE,
    "crops": GROUP_REFERENCE,
}


def _resolve_column(df: pd.DataFrame, requested: str) -> str | None:
    """Map a requested filter name onto a real column, alias-aware."""
    name = _COLUMN_ALIASES.get(requested, requested)
    if name in df.columns:
        return name
    # Exact-match fallback for tables using the bare `crop` column.
    if requested in df.columns:
        return requested
    return None


def assert_known_query_params(seen: Iterable[str], allowed: frozenset[str]) -> None:
    """Refuse query params the endpoint does not declare.

    Undeclared query params are dropped by FastAPI without a trace, so a typo
    (``?indicatr_code=…``) or a dimension this endpoint never asked for would
    look like it had been applied. The explorer's contract is explicit: an
    unknown parameter is a 400 naming it, never a silent no-op.
    """
    unknown = sorted({name for name in seen if name not in allowed})
    if unknown:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "unknown query parameter(s): "
            + ", ".join(unknown)
            + f"; accepted: {', '.join(sorted(allowed))}",
        )


def _accepted_filter_names(key: str) -> list[str]:
    """Query param names a client may actually send for this dataset.

    The declared whitelist plus its generic aliases (``crop`` for
    ``canonical_crop_name``), because the API accepts both and a client should
    not have to guess which spelling works.
    """
    allowed = FILTERABLE_COLUMNS.get(key, ())
    names = list(allowed)
    for alias, target in _COLUMN_ALIASES.items():
        if target in allowed and alias not in names:
            names.append(alias)
    return names


def list_datasets() -> list[dict]:
    """Every whitelisted dataset, current first.

    Grouped rather than flat: the current multi-period tables lead, the legacy
    2025 Season B extracts follow as an archive, and the reference dictionaries
    come last. Ordering is stable, so a client never has to hand-maintain a list
    of tabs as new releases arrive.
    """
    order = {group: index for index, group in enumerate(GROUP_ORDER)}
    rows = [
        {
            "key": key,
            "label": label,
            "source_id": source_id,
            "group": DATASET_GROUPS.get(key, GROUP_CURRENT),
            "group_label": GROUP_LABELS.get(
                DATASET_GROUPS.get(key, GROUP_CURRENT), GROUP_LABELS[GROUP_CURRENT]
            ),
            # The exact-match columns this dataset accepts, so the explorer UI
            # can render dataset-appropriate controls instead of offering
            # filters the API would only reject with a 400.
            "filters": _accepted_filter_names(key),
        }
        for key, (label, _, source_id) in DATASETS.items()
    ]
    return sorted(rows, key=lambda row: order.get(row["group"], 99))


def _resolved_meta(key: str, label: str, source_id: str, df: pd.DataFrame) -> tuple[str, str]:
    """Dataset label and source ids that reflect what the panel actually holds.

    The multi-period panel now covers 2022A-2026B from six releases, so both the
    printed range and the provenance list are derived from the data rather than
    from a literal that only stays true until the next release.
    """
    if key == "crop_productivity":
        label = f"{label} ({period_service.district_range()})"
        if "source_id" in df.columns:
            sources = sorted({str(value) for value in df["source_id"].dropna() if str(value)})
            if sources:
                source_id = ",".join(sources)
    elif key in ("agricultural_practice_observation", "postharvest_use_multi_period"):
        # The printed range and provenance come from the loaded frame, so a new
        # release shows up without a hand-edited literal in this file.
        if "period_code" in df.columns:
            codes = sorted({str(code) for code in df["period_code"].dropna() if str(code)})
            if codes:
                label = f"{label} ({codes[0]}-{codes[-1]})"
        if "source_id" in df.columns:
            sources = sorted({str(value) for value in df["source_id"].dropna() if str(value)})
            if sources:
                source_id = ",".join(sources)
    elif key == "district_crop_productivity":
        label = f"{label} ({period_service.single_release_scope()})"
    return label, source_id


def _selected(
    key: str,
    search: str | None = None,
    filters: dict[str, str] | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
) -> tuple[str, str, pd.DataFrame]:
    """Resolve a whitelisted dataset to a filtered, searched, sorted frame.

    One implementation shared by the paginated JSON endpoint and the CSV
    export, so a download cannot silently disagree with what is on screen.
    Raises ``KeyError`` for an unknown key and ``HTTPException(400)`` for a
    filter or sort the dataset does not support.
    """
    if key not in DATASETS:
        raise KeyError(key)
    label, loader_name, source_id = DATASETS[key]
    df: pd.DataFrame = getattr(repo, loader_name)()
    label, source_id = _resolved_meta(key, label, source_id, df)

    allowed = FILTERABLE_COLUMNS.get(key, ())

    # --- whitelisted exact-match filters -------------------------------------
    for raw_name, raw_value in (filters or {}).items():
        if not raw_value:
            continue
        if raw_name not in allowed and _COLUMN_ALIASES.get(raw_name, raw_name) not in allowed:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"filter '{raw_name}' is not supported for dataset '{key}'",
            )
        column = _resolve_column(df, raw_name)
        if column is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"filter '{raw_name}' is not supported for dataset '{key}'",
            )
        df = df[df[column].astype(str).str.lower() == str(raw_value).strip().lower()]

    # --- free-text search over all columns -----------------------------------
    if search:
        needle = search.lower()
        # regex=False: this is a literal substring search over user input, and
        # dataset cells freely contain regex punctuation ("[", "(", "*"). With
        # regex on, searching for "[ " raised re.error -> an unhandled 500.
        mask = (
            df.astype(str)
            .apply(lambda col: col.str.lower().str.contains(needle, na=False, regex=False))
            .any(axis=1)
        )
        df = df[mask]

    # --- sorting (whitelisted to real columns; direction whitelisted) --------
    if sort_by:
        if sort_by not in df.columns:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"cannot sort by '{sort_by}': not a column of '{key}'",
            )
        ascending = sort_dir != "desc"
        df = df.sort_values(by=sort_by, ascending=ascending, na_position="last")

    return label, source_id, df


def parse_filters(
    *,
    period_code: str | None = None,
    year: int | None = None,
    season: str | None = None,
    crop: str | None = None,
    province: str | None = None,
    district: str | None = None,
    indicator_code: str | None = None,
    domain: str | None = None,
) -> dict[str, str]:
    """Canonicalize explorer query params into a validated filter dict.

    Shared by the JSON endpoint and the CSV export so both apply identical
    scope. The period is canonicalized (unknown period -> 422, same contract as
    the JSON endpoint) and empty values are dropped, so an absent param and an
    empty string behave identically.
    """
    requested: dict[str, str] = {}
    if period_code:
        try:
            requested["period_code"] = period_service.require(period_code)
        except period_service.UnknownPeriodError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    if year is not None:
        requested["year"] = str(year)
    for name, value in (
        ("season", season),
        ("crop", crop),
        ("province", province),
        ("district", district),
        ("indicator_code", indicator_code),
        ("domain", domain),
    ):
        if value:
            requested[name] = value
    return requested


def fetch(
    key: str,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
    filters: dict[str, str] | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
) -> dict:
    label, source_id, df = _selected(key, search, filters, sort_by, sort_dir)

    total = int(len(df))
    window = df.iloc[offset : offset + limit].replace({np.nan: None})
    return {
        "key": key,
        "label": label,
        "source_id": source_id,
        "columns": [str(c) for c in window.columns],
        "rows": window.to_dict(orient="records"),
        "count": total,
        "offset": offset,
        "limit": limit,
        "sort": {"by": sort_by, "direction": sort_dir} if sort_by else None,
        "filters": {k: v for k, v in (filters or {}).items() if v},
    }


def records_for_export(
    key: str,
    search: str | None = None,
    filters: dict[str, str] | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
) -> pd.DataFrame:
    """Full (unpaginated) frame for CSV export, honouring the same scope as
    ``fetch`` so the download matches what the explorer is showing."""
    _, _, df = _selected(key, search, filters, sort_by, sort_dir)
    return df
