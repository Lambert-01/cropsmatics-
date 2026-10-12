"""The published period dimension, derived from the data.

NISR publishes Seasonal Agricultural Survey releases by year and season. The
catalogue below is never a literal list: it is whatever the serving layers
describe. Do not write the current range here - it has already been wrong once
("2024A-2026B" while the panel published 2022A-2026B).

Nothing here is a hard-coded release list. The catalogue is assembled from the
processed tables themselves:

* ``crop_productivity.csv`` is the canonical multi-period panel. It decides both
  the period dimension and, per period, how many districts and crops really have
  district-level rows.
* ``data_coverage.csv`` supplies the periods (and coverage level) of every other
  dataset, including the legacy single-release pack.

That means a period can only appear because a table carries rows for it, and a
period that has no district rows is reported as national-only rather than being
advertised as district coverage. Requesting an unpublished period is an error,
not an empty success.

A period's level is the strongest level *any* substantiated layer records for it.
When the serving database and the coverage matrix disagree - for example a
production database still holding an older panel while the pipeline has moved on
- the catalogue reports what the serving system can actually substantiate, names
which periods only the matrix describes, and never fills the gap with a level it
did not record.
"""

from __future__ import annotations

import re
from functools import lru_cache

import pandas as pd

from app.repositories import dataset_repository as repo

SEASON_WORDS = {"A": "Season A", "B": "Season B", "C": "Season C"}
SEASON_LETTERS = tuple(SEASON_WORDS)

PERIOD_RE = re.compile(r"^(20\d{2})([ABC])$")

# Canonical dataset keys that carry a real period dimension.
PANEL_DATASET = "crop_productivity"
LEGACY_PANEL_DATASET = "district_crop_productivity"

# Geographic breadth, most specific first. A period's reported level is the
# strongest level any dataset substantiates for it, so a period that carries
# district rows in one dataset is not described by the weakest contributor.
_LEVEL_PRECEDENCE = ("district", "national_crop", "national")


def _strongest_level(levels) -> str | None:
    """The most specific recorded level, or None when nothing was recorded.

    ``None`` is a real state and is never guessed: it means no dataset in the
    coverage matrix describes this period, which the interface must say plainly
    instead of inventing "30 districts".
    """
    present = {str(level).strip().lower() for level in levels if level not in (None, "")}
    for level in _LEVEL_PRECEDENCE:
        if level in present:
            return level
    return None


# Datasets whose rows are period-specific but which are NOT yet multi-season.
# Used to explain, honestly, why a period filter returns nothing there.
SINGLE_RELEASE_DATASETS: dict[str, str] = {
    "district_crop_productivity": "2025B",
    "district_factors": "2025B",
    "irrigation_water": "2025B",
    "erosion_control": "2025B",
    "crop_postharvest_use": "2025B",
}


class UnknownPeriodError(ValueError):
    """Raised for a malformed or unpublished period code."""


def parse(code: str) -> tuple[int, str]:
    """``"2025B"`` -> ``(2025, "B")``. Raises for anything else."""
    match = PERIOD_RE.match(str(code or "").strip().upper())
    if not match:
        raise UnknownPeriodError(
            f"period_code {code!r} is not a YYYYS period code (e.g. 2025B)"
        )
    return int(match.group(1)), match.group(2)


def format_code(year: int | str, season: str) -> str:
    """``(2025, "b")`` -> ``"2025B"``."""
    season_letter = str(season).strip().upper()
    if season_letter not in SEASON_WORDS:
        raise UnknownPeriodError(f"season {season!r} is not one of {SEASON_LETTERS}")
    return f"{int(year)}{season_letter}"


def label(code: str) -> str:
    """``"2025B"`` -> ``"2025 Season B"``; unknown shapes pass through."""
    try:
        year, season = parse(code)
    except UnknownPeriodError:
        return str(code)
    return f"{year} {SEASON_WORDS[season]}"


def _sort_key(code: str) -> tuple[int, str]:
    try:
        return parse(code)
    except UnknownPeriodError:
        return (0, str(code))


# --- data-derived catalogue -------------------------------------------------


def _panel_periods() -> dict[str, dict]:
    """Per-period facts from the canonical multi-period panel."""
    try:
        panel = repo.crop_productivity()
    except Exception:
        return {}
    if panel.empty or "period_code" not in panel.columns:
        return {}

    out: dict[str, dict] = {}
    for period_code, group in panel.groupby("period_code"):
        code = str(period_code)
        district_rows = group[group["geography_level"] == "DISTRICT"] if "geography_level" in group else group
        n_districts = int(district_rows["district"].nunique()) if "district" in district_rows else 0
        n_crops = int(group["crop_code"].nunique()) if "crop_code" in group else 0
        source_ids = sorted(
            {str(s) for s in group.get("source_id", pd.Series(dtype=object)).dropna()}
        )
        out[code] = {
            "dataset": PANEL_DATASET,
            "coverage_level": "district" if n_districts else "national",
            "n_districts": n_districts,
            "n_crops": n_crops,
            "n_rows": int(len(group)),
            "source_id": ",".join(source_ids) if source_ids else None,
        }
    return out


def _coverage_rows() -> list[dict]:
    """The coverage matrix as flat rows (dataset, period, level, counts)."""
    try:
        df = repo.data_coverage()
    except Exception:
        return []
    return df.to_dict(orient="records")


@lru_cache(maxsize=1)
def catalog() -> dict:
    """Full period catalogue: ordered periods, latest flags and coverage.

    Cached because the underlying tables are cached and immutable for the life
    of the process (the repository exposes ``clear_cache`` for a reload).
    """
    by_code: dict[str, dict] = {}

    def ensure(code: str) -> dict:
        return by_code.setdefault(
            code,
            {
                "period_code": code,
                "datasets": [],
                "coverage_level": None,
                "n_districts": 0,
                "n_crops": 0,
                # Every level any layer recorded for this period, and whether
                # the productivity panel itself substantiated it.
                "levels": set(),
                "panel_level": None,
            },
        )

    panels = _panel_periods()
    for code, facts in panels.items():
        entry = ensure(code)
        entry["coverage_level"] = facts["coverage_level"]
        entry["panel_level"] = facts["coverage_level"]
        entry["levels"].add(facts["coverage_level"])
        entry["n_districts"] = facts["n_districts"]
        entry["n_crops"] = facts["n_crops"]

    for row in _coverage_rows():
        period = str(row.get("period") or "")
        if not PERIOD_RE.match(period):
            # Free-text add-on periods ("2024/2025") are not SAS periods.
            continue
        dataset = str(row.get("dataset"))
        level = str(row.get("coverage_level") or "").strip().lower()
        entry = ensure(period)
        entry["datasets"].append(
            {
                "dataset": dataset,
                "coverage_level": level,
                "n_districts": int(row.get("n_districts") or 0),
                "n_crops": int(row.get("n_crops") or 0),
                "source_id": row.get("source_id") or None,
            }
        )
        if level:
            entry["levels"].add(level)
        # The panel's own facts are already recorded; the coverage matrix may
        # additionally describe other datasets for the same period.
        if dataset == PANEL_DATASET:
            continue
        if level == "district":
            entry["n_districts"] = max(entry["n_districts"], int(row.get("n_districts") or 0))
            entry["n_crops"] = max(entry["n_crops"], int(row.get("n_crops") or 0))

    # A period the coverage matrix describes but the serving panel does not
    # still has a substantiated level. Leaving it None is what produced the
    # unexplained "coverage unknown" label: the catalogue knew the release
    # existed, and knew what the matrix said about it, but reported neither.
    for entry in by_code.values():
        if entry["coverage_level"] is None:
            entry["coverage_level"] = _strongest_level(entry["levels"])

    if not by_code:
        return {
            "periods": [],
            "period_codes": [],
            "latest": None,
            "latest_district": None,
            "count": 0,
            "notes": [
                "no processed period data found - run `make data` to build the tables"
            ],
        }

    codes = sorted(by_code, key=_sort_key)
    latest = codes[-1]
    district_codes = [code for code in codes if by_code[code]["coverage_level"] == "district"]

    periods = []
    for code in codes:
        entry = by_code[code]
        year, season = parse(code)
        periods.append(
            {
                "period_code": code,
                "year": year,
                "season": season,
                "label": label(code),
                "coverage_level": entry["coverage_level"],
                "n_districts": entry["n_districts"],
                "n_crops": entry["n_crops"],
                "datasets": sorted(
                    entry["datasets"], key=lambda d: (d["dataset"], d["coverage_level"])
                ),
                "is_latest": code == latest,
                "is_latest_district": bool(district_codes) and code == district_codes[-1],
            }
        )

    # Which listed periods the productivity panel itself substantiates. This is
    # deliberately data-derived: the previous note asserted that the panel covers
    # every listed period, which stops being true the moment the serving database
    # is older than the coverage matrix - and that mismatch is exactly the state
    # that produced an unexplained "coverage unknown" label in the interface.
    panel_codes = [code for code in codes if by_code[code]["panel_level"]]
    matrix_only = [code for code in codes if not by_code[code]["panel_level"]]

    notes = [
        "period codes are YYYYS (year + season A/B/C) as published by NISR",
        "only periods present in the processed tables are listed; an "
        "unpublished season such as 2026C does not exist",
    ]
    if matrix_only:
        notes.append(
            f"{PANEL_DATASET} substantiates {len(panel_codes)} of {len(codes)} listed "
            f"periods in the serving system; {', '.join(matrix_only)} are described "
            "only by the coverage matrix, and their level is taken from the datasets "
            "that do describe them rather than inferred from the panel"
        )
    else:
        notes.append(
            f"{PANEL_DATASET} carries rows for every listed period; every other "
            "dataset lists its own periods in its datasets entry, so a period can "
            "never inherit coverage it does not have"
        )

    return {
        "periods": periods,
        "period_codes": codes,
        "latest": latest,
        "latest_district": district_codes[-1] if district_codes else None,
        "count": len(codes),
        "panel_periods": panel_codes,
        "matrix_only_periods": matrix_only,
        "notes": notes,
    }


def published_range() -> str:
    """First-last published period code, e.g. ``2022A-2026B``.

    Derived from the period catalogue, so a provenance string can never describe a
    different calendar than the panel it annotates (the previous hardcoded
    ``"2024A-2026B"`` became a false claim the moment 2022/2023 were ingested).
    """
    codes = period_codes()
    return f"{codes[0]}-{codes[-1]}" if codes else ""


def district_range() -> str:
    """Same, but only the periods that really carry district-level rows."""
    codes = [
        period["period_code"]
        for period in catalog()["periods"]
        if period.get("coverage_level") == "district"
    ]
    return f"{codes[0]}-{codes[-1]}" if codes else ""


def single_release_scope() -> str:
    """Label(s) of the periods only the legacy single-release tables cover."""
    codes = sorted(set(SINGLE_RELEASE_DATASETS.values()))
    return ", ".join(label(code) for code in codes)


def period_codes() -> list[str]:
    """Published period codes, chronological."""
    return list(catalog()["period_codes"])


def latest() -> str | None:
    return catalog()["latest"]


def latest_district() -> str | None:
    return catalog()["latest_district"]


def is_published(code: str) -> bool:
    try:
        return format_code(*parse(code)) in catalog()["period_codes"]
    except UnknownPeriodError:
        return False


def require(code: str) -> str:
    """Validate a requested period and return its canonical form.

    Raises :class:`UnknownPeriodError` for a malformed code or an unpublished
    period so callers can turn it into a 422 with the available list.
    """
    canonical = format_code(*parse(code))
    published = catalog()["period_codes"]
    if canonical not in published:
        raise UnknownPeriodError(
            f"period_code {code!r} has not been published; available: {published}"
        )
    return canonical


def coverage_level(code: str) -> str | None:
    for entry in catalog()["periods"]:
        if entry["period_code"] == code:
            return entry["coverage_level"]
    return None


def datasets_for(code: str) -> list[dict]:
    for entry in catalog()["periods"]:
        if entry["period_code"] == code:
            return entry["datasets"]
    return []
