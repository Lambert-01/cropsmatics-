"""Read-only access to the analytical data layer.

The canonical PostgreSQL tables are the production authority. Which layer
answers a read is decided by ``CANONICAL_DATA_MODE`` (``Settings.canonical_mode``):

* ``required``  - PostgreSQL must be ready. If it cannot serve a read the request
  fails with :class:`CanonicalDataUnavailable` rather than quietly answering from
  the processed files. Production defaults to this.
* ``preferred`` - PostgreSQL first, and the processed files stand in when the
  database is unavailable. Which layer answered is reported by
  :func:`canonical_source_status` and the ``/data/*`` envelopes.
* ``file``      - processed files only. Development/testing.

Only datasets that genuinely have a canonical home are routed through the
database. A dataset the schema does not yet model (the legacy joined training
table, the national trend context series) keeps reading the processed file, which
is why the processed artefacts remain in the pipeline output at all: they are the
reproducibility and fallback layer.

Every CSV loader is cached with ``lru_cache`` so files are parsed once per
process. Call :func:`clear_cache` after re-running the pipeline.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import cache, lru_cache

import pandas as pd

from app.core.config import REPO_ROOT, get_settings

DICT_DIR = REPO_ROOT / "data" / "dictionaries"
REGISTRY_DIR = REPO_ROOT / "data" / "source_registry"


class DatasetUnavailable(RuntimeError):
    """Raised when a requested dataset has not been built yet."""


class CanonicalDataUnavailable(RuntimeError):
    """The canonical database is required but cannot serve this read.

    Distinct from :class:`DatasetUnavailable`: the pipeline output may be
    perfectly present while a ``required``-mode deployment still must not answer
    from it. The API maps this to a ``DATABASE_UNAVAILABLE`` response.
    """

    code = "DATABASE_UNAVAILABLE"


# Process-level record of which layer answered each canonical-backed dataset.
_SOURCES: dict[str, str] = {}


@lru_cache
def _read_csv(path_str: str) -> pd.DataFrame:
    return pd.read_csv(path_str)


def _load(filename: str) -> pd.DataFrame:
    """Load a processed table, raising a helpful error when it is missing."""
    path = get_settings().processed_dir / filename
    if not path.exists():
        raise DatasetUnavailable(f"{filename} not found. Run `make data` to build it.")
    return _read_csv(str(path)).copy()


# --- canonical dispatch ----------------------------------------------------


def _canonical():
    from app.repositories import canonical_repository

    return canonical_repository


def canonical_source_status() -> dict:
    """Which layer the canonical-backed datasets are served from, and why.

    Reporting only - it never raises, so a readiness or status endpoint can call
    it even when the database is unreachable.
    """
    mode = get_settings().canonical_mode
    try:
        probe = _canonical().probe()
    except Exception:  # noqa: BLE001 - a status probe reports, it does not raise
        probe = {"availability": "unavailable", "reason": "probe failed"}
    return {
        "mode": mode,
        "availability": probe.get("availability"),
        "reason": probe.get("reason"),
        "served_from": dict(_SOURCES),
    }


def _read(dataset: str, fetch, fallback: Callable[[], pd.DataFrame]) -> pd.DataFrame:
    """Serve ``dataset`` from PostgreSQL when the mode and the database allow it.

    In ``required`` mode a database that cannot answer is a hard failure, not a
    silent downgrade: the whole point of the mode is that a production answer is
    never quietly sourced from a file.
    """
    mode = get_settings().canonical_mode
    if mode != "file":
        try:
            if _canonical().is_ready():
                frame = fetch()
                _SOURCES[dataset] = "postgres"
                return frame
        except Exception:  # noqa: BLE001 - probe/read failure is handled below
            pass

    if mode == "required":
        _SOURCES[dataset] = "unavailable"
        raise CanonicalDataUnavailable(
            f"the canonical database is required (CANONICAL_DATA_MODE=required) "
            f"but is not serving '{dataset}'"
        )

    _SOURCES[dataset] = "processed_csv"
    return fallback()


@lru_cache(maxsize=1)
def _canonical_productivity() -> pd.DataFrame:
    """The canonical productivity panel, built once per process."""
    return _canonical().productivity_frame()


@cache
def _csv_columns(path_str: str) -> tuple[str, ...]:
    """A processed file's column contract, read without loading its rows."""
    return tuple(pd.read_csv(path_str, nrows=0).columns)


def _contract_columns(filename: str) -> list[str] | None:
    """The processed artefact's columns, or None when it is not present."""
    path = get_settings().processed_dir / filename
    if not path.exists():
        return None
    try:
        return list(_csv_columns(str(path)))
    except (OSError, pd.errors.ParserError):
        return None


@cache
def _canonical_observation(filename: str) -> pd.DataFrame:
    """A wide indicator file rebuilt from the normalized observation table."""
    return _canonical().observation_frame(filename, columns=_contract_columns(filename))


def _observation_read(dataset: str, filename: str) -> pd.DataFrame:
    """Serve a wide indicator file from the DB, honouring the processed contract."""
    return _read(
        dataset,
        lambda: _canonical_observation(filename).copy(),
        lambda: _load(filename),
    )


# --- primary analytical tables --------------------------------------------


def training_dataset() -> pd.DataFrame:
    """Primary analytical table (productivity x factors), if built."""
    return _load("training_district_crop.csv")


def productivity_dataset() -> pd.DataFrame:
    """Cleaned district x crop productivity table (legacy single-release pack)."""
    return _load("district_crop_productivity.csv")


def crop_productivity() -> pd.DataFrame:
    """Canonical multi-period productivity panel (2024A-2026B).

    One row per period x geography x crop, with the published metrics in
    columns and full source lineage. District rows carry ``geography_level ==
    'DISTRICT'``; national and SSF/LSF aggregates are separate rows rather than
    being mixed into the district panel.
    """
    return _read(
        "crop_productivity",
        lambda: _canonical_productivity().copy(),
        lambda: _load("crop_productivity.csv"),
    )


def factors_dataset() -> pd.DataFrame:
    """District input/practice factor table (canonical observations)."""
    return _observation_read("district_factors", "district_productivity_factors.csv")


def irrigation_water() -> pd.DataFrame:
    return _observation_read("irrigation_water", "irrigation_water.csv")


def erosion_control() -> pd.DataFrame:
    return _observation_read("erosion_control", "erosion_control.csv")


def postharvest_use() -> pd.DataFrame:
    """Crop-level sold/stored/consumed/loss share table (canonical observations)."""
    return _observation_read("crop_postharvest_use", "crop_postharvest_use.csv")


def national_crop_trends() -> pd.DataFrame:
    return _load("national_crop_trends.csv")


def national_input_trends() -> pd.DataFrame:
    return _observation_read("national_input_trends", "national_input_trends.csv")


def cold_chain_context() -> pd.DataFrame:
    """Verified cold-chain program context; capacity intentionally null."""
    return _load("cold_chain_context.csv")


def postharvest_infrastructure() -> pd.DataFrame:
    """NATIONAL MINAGRI post-harvest infrastructure totals (add-on table 10).

    National level only - never joined to districts or facility markers.
    """
    return _load("national_postharvest_infrastructure.csv")


def cold_chain_network_summary() -> pd.DataFrame:
    """2026 MINAGRI-ACES cold-chain program summary (add-on table 11).

    Program-level context; facility capacity and coordinates are not published.
    """
    return _load("cold_chain_network_summary.csv")


def dashboard_overview() -> pd.DataFrame:
    return _load("dashboard_overview.csv")


def market_observations() -> pd.DataFrame:
    """Verified market price observations.

    A header-only table is a **valid** state: it means the schema is designed and
    no verified price observation has been loaded yet. That is reported as zero
    coverage rather than being filled with sample prices.
    """
    return _load("market_price_observation.csv")


def data_coverage() -> pd.DataFrame:
    return _load("data_coverage.csv")


def data_sources() -> pd.DataFrame:
    return _load("data_sources.csv")


def data_manifest() -> dict:
    """The processed-data manifest (pipeline version, hashes, row counts)."""
    import json

    path = get_settings().processed_dir / "manifest.json"
    if not path.exists():
        raise DatasetUnavailable("manifest.json not found. Run `make data` to build it.")
    return json.loads(path.read_text())


# --- reference dictionaries ------------------------------------------------


def districts() -> pd.DataFrame:
    return _read_csv(str(DICT_DIR / "districts.csv")).copy()


def crops() -> pd.DataFrame:
    return _read_csv(str(DICT_DIR / "crops.csv")).copy()


def curated_sources() -> pd.DataFrame:
    """The curated source registry (owner/type/access/url)."""
    return _read_csv(str(REGISTRY_DIR / "data_sources.csv")).copy()


def clear_cache() -> None:
    """Drop cached tables (e.g. after the pipeline is re-run in-process)."""
    _read_csv.cache_clear()
    _csv_columns.cache_clear()
    _canonical_productivity.cache_clear()
    _canonical_observation.cache_clear()
    _SOURCES.clear()
