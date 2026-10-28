"""Exposure contract for the multi-period SAS indicator domains.

``agricultural_practice_observation.csv`` and
``crop_postharvest_use_multi_period.csv`` are the files the coverage audit named
as the missing link: 78 SAS sheets were mapped and ingested with full lineage but
no processed dataset surfaced them, so they were honestly reported as
``mapped_not_exposed``. These tests pin the properties that make the exposure
real rather than claimed:

* the period dimension is the published one, per indicator and domain;
* every row is traceable back to a workbook, sheet and row;
* nothing is imputed - published nulls stay null;
* the sheet inventory can no longer report a mapped sheet as unexposed;
* rebuilding produces the same values (deterministic, no hidden state).
"""

from __future__ import annotations

import pandas as pd
import pytest

from scripts.data import sas_table_map as tmap
from scripts.data.build_agricultural_practice_observation import (
    COLUMNS as PRACTICE_COLUMNS,
)
from scripts.data.build_agricultural_practice_observation import build as build_practice
from scripts.data.build_crop_postharvest_multi_period import build as build_postharvest
from scripts.data.common import INTERIM_DIR, PROCESSED_DIR, PROCESSED_FILES
from scripts.tests.conftest import require

PRACTICE_FILE = PROCESSED_FILES["agricultural_practices"]
POSTHARVEST_FILE = PROCESSED_FILES["crop_postharvest_use_multi"]

# The district practice observation table includes fertilizer-source tables from
# the 2022 and 2023 annual workbooks. 2026C does not exist.
PRACTICE_PERIODS = [
    "2022A", "2022B", "2022C",
    "2023A", "2023B", "2023C",
    "2024A", "2024B", "2024C",
    "2025A", "2025B", "2025C",
    "2026A", "2026B",
]
POSTHARVEST_PERIODS = [
    "2024A", "2024B", "2024C",
    "2025A", "2025B", "2025C",
    "2026A", "2026B",
]

OWNED_DOMAINS = {
    "practice",
    "irrigation",
    "water_source",
    "erosion_control",
    "erosion_severity",
    "fertilizer_source_district",
}


@pytest.fixture(scope="module")
def practice() -> pd.DataFrame:
    return pd.read_csv(require(PROCESSED_DIR / PRACTICE_FILE))


@pytest.fixture(scope="module")
def postharvest() -> pd.DataFrame:
    return pd.read_csv(require(PROCESSED_DIR / POSTHARVEST_FILE))


# --- practice / irrigation / erosion ----------------------------------------


def test_practice_observation_covers_the_published_periods(practice):
    assert sorted(practice["period_code"].unique()) == PRACTICE_PERIODS
    assert practice["unit"].unique().tolist() == ["percent"]


def test_practice_observation_carries_only_the_domains_it_owns(practice):
    assert set(practice["domain"].unique()) == OWNED_DOMAINS
    # Productivity has its own canonical panel and must not be duplicated here.
    assert "productivity" not in set(practice["domain"].unique())


def test_every_practice_row_resolves_to_its_reviewed_domain(practice):
    """The domain is derived from the reviewed map, never guessed from a title."""
    for release, sheet, domain in practice[
        ["source_release", "source_sheet", "domain"]
    ].drop_duplicates().itertuples(index=False):
        spec = tmap.get_spec(release, sheet)
        assert spec is not None, f"{release}:{sheet} is not in the reviewed map"
        assert spec.domain == domain, (release, sheet, spec.domain, domain)


def test_practice_rows_are_fully_traceable(practice):
    for column in ("source_id", "source_release", "source_sheet", "source_row"):
        assert practice[column].notna().all(), column
        assert (practice[column].astype(str).str.len() > 0).all(), column
    assert practice["source_kind"].unique().tolist() == ["extraction"]


def test_practice_district_rows_resolve_to_official_district_codes(practice):
    district_rows = practice[practice["geography_level"] == "DISTRICT"]
    assert not district_rows.empty
    assert district_rows["district_code"].notna().all()
    assert district_rows["district"].nunique() == 30
    assert district_rows["district_code"].str.startswith("RW-").all()
    # National aggregates are kept but never carry a district label. An empty
    # district round-trips out of CSV as null, so both spellings mean "no
    # district" - the point is that no real district name is attached.
    national = practice[practice["geography_level"] == "NATIONAL"]
    assert not national.empty
    labels = national["district"].dropna().astype(str).str.strip()
    assert (labels == "").all()
    assert set(national["district_code"].dropna()) == {"RW"}


def test_no_practice_value_was_imputed(practice):
    """The count of real observations must equal the interim source exactly."""
    interim_frames = [
        pd.read_csv(INTERIM_DIR / "sas_practices_long.csv"),
        pd.read_csv(INTERIM_DIR / "sas_district_indicators_long.csv"),
    ]
    published_values = sum(
        int(frame["value"].notna().sum()) for frame in interim_frames
    )
    # Every interim row belongs to an owned domain (asserted above), so the
    # builder must neither drop nor invent a published value.
    assert int(practice["value"].notna().sum()) == published_values
    assert int(practice["value"].isna().sum()) > 0, "published nulls must be preserved"


def test_practice_observation_is_deterministic():
    """Rebuilding must reproduce the committed artefact byte for byte.

    Compared as CSV text rather than as frames: a round-trip through CSV turns an
    empty district into null, which is a representation detail, not a difference
    in the data.
    """
    require(PROCESSED_DIR / PRACTICE_FILE)
    rebuilt, _ = build_practice(
        _concat_interim(
            ["sas_practices_long.csv", "sas_district_indicators_long.csv"]
        ),
        pd.read_csv(INTERIM_DIR / "dim_district.csv"),
    )
    assert list(rebuilt.columns) == PRACTICE_COLUMNS
    assert rebuilt.to_csv(index=False) == (PROCESSED_DIR / PRACTICE_FILE).read_text()


# --- post-harvest -----------------------------------------------------------


def test_postharvest_history_covers_the_published_periods(postharvest):
    assert sorted(postharvest["period_code"].unique()) == POSTHARVEST_PERIODS
    assert postharvest["unit"].unique().tolist() == ["percent"]
    assert postharvest["indicator_code"].nunique() == 11


def test_postharvest_share_totals_flag_without_rescaling(postharvest):
    """A share group off 100 is flagged, and its published values are untouched."""
    for (period, crop), group in postharvest.groupby(["period_code", "crop"]):
        total = group["value"].sum()
        ok = bool(group["shares_sum_ok"].iloc[0])
        assert ok == (abs(total - 100.0) <= 1.0), (period, crop, total, ok)
    # At least one group really is off the rounding tolerance, so the flag is
    # doing work rather than always being True.
    failing = (
        postharvest.groupby(["period_code", "crop"])["shares_sum_ok"].first()
    )
    assert (~failing).any()


def test_postharvest_history_is_deterministic():
    require(PROCESSED_DIR / POSTHARVEST_FILE)
    rebuilt, _ = build_postharvest(
        pd.read_csv(INTERIM_DIR / "sas_postharvest_long.csv"),
        pd.read_csv(INTERIM_DIR / "crop_alias_map.csv"),
    )
    assert rebuilt.to_csv(index=False) == (PROCESSED_DIR / POSTHARVEST_FILE).read_text()


# --- the exposure claim itself ----------------------------------------------


def test_every_mapped_sas_sheet_is_now_exposed():
    """The regression this whole workstream exists to prevent.

    A sheet is only ``used`` when the reviewed mapping covers it AND a processed
    dataset in this checkout surfaces it. If a domain's builder disappears or
    stops being wired into the pipeline, this test fails instead of the coverage
    audit quietly over-claiming again.
    """
    inventory = pd.read_csv(
        require(PROCESSED_DIR.parent / "source_registry" / "sas_sheet_inventory.csv")
    )
    mapped = inventory[inventory["mapped"].astype(str) == "True"]
    assert len(mapped) > 0
    # A mapped sheet is either powering a dataset, or is a byte-identical copy of
    # one that is (the duplicate is never ingested separately by design).
    stages = set(mapped["ingestion_stage"])
    assert stages <= {"used", "duplicate"}, (
        f"mapped sheets still unexposed: "
        f"{sorted(mapped.loc[mapped['ingestion_stage'] == 'mapped_not_exposed', 'sheet'])[:10]}"
    )
    assert not (inventory["ingestion_stage"] == "mapped_not_exposed").any()
    # And the domains the audit listed as ingested-but-not-exposed are all used.
    for domain in (
        "practice",
        "irrigation",
        "water_source",
        "erosion_control",
        "erosion_severity",
        "fertilizer_source_district",
        "postharvest",
    ):
        rows = inventory[inventory["indicator_group"] == domain]
        assert not rows.empty, domain
        assert set(rows["ingestion_stage"]) <= {"used", "duplicate"}, domain


def _concat_interim(names: list[str]) -> pd.DataFrame:
    frames = []
    for name in names:
        frame = pd.read_csv(INTERIM_DIR / name)
        frame["_source_file"] = name
        frames.append(frame)
    return pd.concat(frames, ignore_index=True)
