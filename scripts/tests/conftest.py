"""Test configuration for the data pipeline.

Puts the repository root on ``sys.path`` so tests can import ``scripts.data.*``
the same way the pipeline modules do, and exposes the paths under test.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

RAW = ROOT / "data" / "raw" / "cropmatics_real_data_2024_2026"
MINAGRI = ROOT / "data" / "raw" / "external" / "minagri"
PROCESSED = ROOT / "data" / "processed"
INTERIM = ROOT / "data" / "interim"
DICTS = ROOT / "data" / "dictionaries"


@pytest.fixture(scope="session")
def raw_dir() -> Path:
    return RAW


@pytest.fixture(scope="session")
def minagri_dir() -> Path:
    return MINAGRI


@pytest.fixture(scope="session")
def processed_dir() -> Path:
    return PROCESSED


@pytest.fixture(scope="session")
def interim_dir() -> Path:
    return INTERIM


@pytest.fixture(scope="session")
def dicts_dir() -> Path:
    return DICTS


def require(path: Path):
    """Skip with a clear reason when the pipeline has not been run yet."""
    if not path.exists():
        pytest.skip(f"{path.name} not built - run `python scripts/data/run_all.py` first")
    return path
