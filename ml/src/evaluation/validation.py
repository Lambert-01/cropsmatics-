"""Season-aware validation.

Random row splits leak information across crops/districts and seasons. These
splits key on season (and optionally crop) so evaluation reflects the real use
case: predicting a season not seen in training.
"""

from __future__ import annotations

from collections.abc import Sequence


def season_split(rows: Sequence[dict], test_seasons: Sequence[str]) -> tuple[list[dict], list[dict]]:
    """Split rows into (train, test) by season."""
    test_set = set(test_seasons)
    train = [r for r in rows if r.get("season") not in test_set]
    test = [r for r in rows if r.get("season") in test_set]
    return train, test


def holdout_by_key(rows: Sequence[dict], key: str, holdout: Sequence) -> tuple[list[dict], list[dict]]:
    """Hold out rows whose ``key`` value is in ``holdout`` (e.g. district)."""
    hv = set(holdout)
    train = [r for r in rows if r.get(key) not in hv]
    test = [r for r in rows if r.get(key) in hv]
    return train, test


def assert_no_leakage(train: Sequence[dict], test: Sequence[dict], keys: Sequence[str]) -> None:
    """Raise if any train/test key tuple overlaps."""
    train_keys = {tuple(r.get(k) for k in keys) for r in train}
    test_keys = {tuple(r.get(k) for k in keys) for r in test}
    overlap = train_keys & test_keys
    if overlap:
        raise AssertionError(f"leakage: overlapping keys between train and test: {sorted(overlap)[:5]}")
