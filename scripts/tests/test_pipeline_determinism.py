"""The build must not depend on what a previous build left behind.

The incident this module pins: ``ingest_sas_tables`` read
``data/interim/crop_alias_map.csv`` — an artefact ``normalize_crops`` writes
*later* in the same pipeline — so the crop names it published depended on whether
an earlier ``make data`` had left that file behind. A pristine build (the API
image, a fresh checkout, CI) kept the raw published labels ("Banana for beer");
a second build in the same tree resolved them to canonical names ("Banana"). Same
commit, two different datasets, two different dataset versions - and because the
deploy verifies identity before it loads, one of them could never be reconciled
with the other.

The map is now derived from committed inputs, so it is identical in every tree.
"""

from __future__ import annotations

import pandas as pd
import pytest

from scripts.data import ingest_sas_tables
from scripts.data.common import DICTS_DIR, PROCESSED_DIR, PROCESSED_FILES
from scripts.data.normalize_crops import alias_map
from scripts.tests.conftest import require

POSTHARVEST_MULTI = PROCESSED_FILES["crop_postharvest_use_multi"]


def test_alias_map_is_derived_from_the_committed_dictionary():
    mapping = alias_map()
    by_raw = dict(zip(mapping["raw_crop_name"], mapping["canonical_crop_name"], strict=True))

    # The sub-categories the post-harvest tables publish must resolve to the
    # canonical crop list, which is what the dictionary defines them as.
    assert by_raw["Cooking banana"] == "Banana"
    assert by_raw["Dessert banana"] == "Banana"
    assert by_raw["Banana for beer"] == "Banana"
    assert by_raw["Bush bean"] == "Beans"
    assert by_raw["Climbing bean"] == "Beans"
    # A name already canonical is mapped to itself rather than renamed.
    assert by_raw.get("Maize", "Maize") == "Maize"


def test_an_unmapped_published_crop_is_an_error_not_a_guess(monkeypatch):
    """An unknown name must fail loudly, never be silently published as canonical."""
    real_read = pd.read_csv

    def fake_read_csv(path, *args, **kwargs):
        frame = real_read(path, *args, **kwargs)
        # Only the raw published tables carry a `crop` column; the dictionary
        # itself has `crop_name` and must stay untouched.
        if "crop" in frame.columns:
            frame = frame.copy()
            frame.loc[0, "crop"] = "Dragonfruit of Ruhango"
        return frame

    monkeypatch.setattr(pd, "read_csv", fake_read_csv)
    with pytest.raises(ValueError, match="no canonical mapping"):
        alias_map()


def test_ingest_ignores_a_leftover_interim_alias_map(monkeypatch, tmp_path):
    """A stale interim file must not be able to change the parsed crop names."""
    stale = tmp_path / "crop_alias_map.csv"
    # Deliberately wrong: it would rename a crop that is already canonical.
    pd.DataFrame(
        [
            {"raw_crop_name": "cassava", "canonical_crop_name": "Banana"},
            {"raw_crop_name": "maize", "canonical_crop_name": "Banana"},
        ]
    ).to_csv(stale, index=False)

    monkeypatch.setattr(ingest_sas_tables, "INTERIM_DIR", tmp_path)
    derived_with_stale_state = ingest_sas_tables._alias_map()

    monkeypatch.setattr(ingest_sas_tables, "INTERIM_DIR", tmp_path / "absent")
    derived_without = ingest_sas_tables._alias_map()

    assert derived_without.equals(derived_with_stale_state)
    # And it is the committed derivation, not the poisoned file: the file said
    # Cassava -> Banana, and the derived map must not agree with it.
    assert (tmp_path / "crop_alias_map.csv").exists()
    derived = dict(
        zip(
            derived_with_stale_state["raw_crop_name"],
            derived_with_stale_state["canonical_crop_name"],
            strict=True,
        )
    )
    assert derived["Cassava"] == "Cassava"
    assert derived["Maize"] == "Maize"


def test_postharvest_crop_names_are_canonical_in_the_built_artefact():
    """The served artefact carries canonical crops, with the raw label preserved.

    `crop` is what analytics group by; `crop_raw` keeps the published variety, so
    the two must both be present in the built table.
    """
    frame = pd.read_csv(require(PROCESSED_DIR / POSTHARVEST_MULTI))
    varieties = set(frame["crop_raw"].dropna())
    canonical = set(frame["crop"].dropna())

    # The published varieties stay visible...
    assert {"Cooking banana", "Dessert banana", "Banana for beer"} <= varieties
    # ...while the grouping column is canonical, so the single-release table and
    # the multi-period table cannot disagree about which crop a row belongs to.
    assert {"Banana", "Beans"} <= canonical
    assert "Banana for beer" not in canonical
    # The canonical dimension comes from the committed dictionary.
    dictionary = set(pd.read_csv(DICTS_DIR / "crops.csv")["crop_name"].astype(str))
    assert canonical <= dictionary
