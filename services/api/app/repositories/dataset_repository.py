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

import time
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


class DatasetOutOfSync(CanonicalDataUnavailable):
    """The canonical dataset does not match the processed build.

    Raised in ``required`` mode when the database is reachable and holds data but
    serves a *different* dataset than the image was built from - the state that
    used to answer ``200 OK`` with stale figures. The API maps this to a
    structured ``503`` carrying the expected/loaded versions and period counts.
    """

    code = "DATASET_OUT_OF_SYNC"

    def __init__(
        self,
        message: str,
        *,
        expected_version: str | None = None,
        loaded_version: str | None = None,
        expected_periods: list[str] | None = None,
        loaded_periods: list[str] | None = None,
        reason: str | None = None,
    ) -> None:
        super().__init__(message)
        self.expected_version = expected_version
        self.loaded_version = loaded_version
        self.expected_periods = expected_periods
        self.loaded_periods = loaded_periods
        self.reason = reason or "canonical_dataset_out_of_sync"
        self.retryable = True


class PeriodNotServable(DatasetOutOfSync):
    """A published period has no rows in the serving layer for this selection.

    Raised instead of silently substituting another release's table (the 2025
    Season B training table), which put one period's figures behind another
    period's label.
    """

    def __init__(
        self,
        period_code: str,
        *,
        expected_periods: list[str] | None = None,
        loaded_periods: list[str] | None = None,
        message: str | None = None,
    ) -> None:
        super().__init__(
            message
            or (
                f"{period_code} is published but the serving dataset carries no "
                "district rows for it; no other release is substituted"
            ),
            expected_periods=expected_periods,
            loaded_periods=loaded_periods,
            reason="period_not_servable",
        )
        self.period_code = period_code
        self.retryable = False


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


def expected_dataset_version() -> str | None:
    """The dataset version the processed build implies, or None when unreadable."""
    try:
        from app.data.versioning import content_version

        return content_version(data_manifest())
    except Exception:  # noqa: BLE001 - a status helper reports, it does not raise
        return None


@lru_cache(maxsize=1)
def _panel_period_codes() -> tuple[str, ...]:
    """Published period codes in the processed panel (the expected period axis)."""
    try:
        path = get_settings().processed_dir / "crop_productivity.csv"
        if not path.exists():
            return ()
        codes = pd.read_csv(path, usecols=["period_code"])["period_code"].dropna()
        return tuple(sorted({str(code) for code in codes}))
    except Exception:  # noqa: BLE001
        return ()


# The sync state costs a probe plus a version read against PostgreSQL. Every
# required-mode read must still check identity before answering, but caching the
# verdict for a few seconds stops a single request - and the out-of-sync handler
# that used to recompute it - from probing the database several times over.
# Short enough that a database load performed out-of-band is noticed promptly.
_SYNC_TTL_SECONDS = 10.0
_sync_cache: tuple[float, tuple[object, dict]] | None = None


def canonical_sync_state() -> dict:
    """Whether the canonical dataset matches the processed build. Never raises.

    ``in_sync`` is ``True`` (the database serves the built dataset), ``False``
    (the database is reachable and holds data, but a *different* dataset) or
    ``None`` (the comparison cannot be made: the database is unreachable, empty,
    or the manifest is missing). Only the ``False`` case is an out-of-sync error;
    ``None`` keeps the existing DATABASE_UNAVAILABLE semantics.

    The verdict is memoised for a few seconds (see ``_SYNC_TTL_SECONDS``) so a
    request that reads several datasets - or the out-of-sync handler - does not
    re-probe PostgreSQL each time.
    """
    global _sync_cache
    cached = _sync_cache
    if cached is not None and (time.monotonic() - cached[0]) < _SYNC_TTL_SECONDS:
        return cached[1]
    state = _compute_sync_state()
    _sync_cache = (time.monotonic(), state)
    return state


def _compute_sync_state() -> dict:
    expected_version = expected_dataset_version()
    state: dict = {
        "expected_version": expected_version,
        "loaded_version": None,
        "in_sync": None,
        "expected_periods": None,
        "loaded_periods": None,
        "reason": None,
    }
    try:
        canonical = _canonical()
        probe = canonical.probe()
    except Exception as error:  # noqa: BLE001
        state["reason"] = f"canonical probe failed: {type(error).__name__}"
        return state

    state["reason"] = probe.get("reason")
    if probe.get("availability") != "ready":
        return state

    loaded = canonical.current_version() or {}
    state["loaded_version"] = loaded.get("version")
    if expected_version is None:
        state["reason"] = "processed manifest unavailable for comparison"
        return state

    state["in_sync"] = loaded.get("version") == expected_version
    if not state["in_sync"]:
        state["expected_periods"] = list(_panel_period_codes())
        try:
            state["loaded_periods"] = canonical.productivity_periods()
        except Exception:  # noqa: BLE001 - the counts are best-effort detail
            state["loaded_periods"] = None
        state["reason"] = "canonical_dataset_out_of_sync"
    return state


def _out_of_sync_error(dataset: str, sync: dict | None = None) -> DatasetOutOfSync:
    """Build the structured out-of-sync error from the current sync state.

    ``sync`` is the already-computed state from the read that detected the
    mismatch, so the out-of-sync path never probes PostgreSQL a second time.
    """
    sync = sync if sync is not None else canonical_sync_state()
    return DatasetOutOfSync(
        "the canonical database is serving a different dataset than the processed "
        f"build, so '{dataset}' cannot be answered consistently: expected version "
        f"{sync['expected_version']!r}, loaded {sync['loaded_version']!r}",
        expected_version=sync["expected_version"],
        loaded_version=sync["loaded_version"],
        expected_periods=sync["expected_periods"],
        loaded_periods=sync["loaded_periods"],
        reason=sync["reason"],
    )


def _read(dataset: str, fetch, fallback: Callable[[], pd.DataFrame]) -> pd.DataFrame:
    """Serve ``dataset`` from PostgreSQL when the mode and the database allow it.

    In ``required`` mode a database that cannot answer is a hard failure, not a
    silent downgrade: the whole point of the mode is that a production answer is
    never quietly sourced from a file.
    """
    mode = get_settings().canonical_mode

    if mode == "required":
        # The identity check runs *before* any read. A reachable database that
        # serves a different dataset than the image was built from is an
        # out-of-sync error, never a successful but inconsistent answer.
        sync = canonical_sync_state()
        if sync["in_sync"] is False:
            _SOURCES[dataset] = "out_of_sync"
            raise _out_of_sync_error(dataset, sync)
        if sync["in_sync"] is None:
            _SOURCES[dataset] = "unavailable"
            raise CanonicalDataUnavailable(
                f"the canonical database is required (CANONICAL_DATA_MODE=required) "
                f"but is not serving '{dataset}'"
            )
        try:
            frame = fetch()
        except Exception as error:  # noqa: BLE001 - report as unavailable
            _SOURCES[dataset] = "unavailable"
            raise CanonicalDataUnavailable(
                f"the canonical database is required (CANONICAL_DATA_MODE=required) "
                f"but the read for '{dataset}' failed"
            ) from error
        _SOURCES[dataset] = "postgres"
        return frame

    if mode != "file":
        try:
            if _canonical().is_ready():
                frame = fetch()
                _SOURCES[dataset] = "postgres"
                return frame
        except Exception:  # noqa: BLE001 - probe/read failure is handled below
            pass

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


def field_crop_observations() -> pd.DataFrame:
    """Optional approved plot-level area/production evidence."""
    return _load("field_crop_observations.csv")


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


def agricultural_practice_observation() -> pd.DataFrame:
    """Multi-period district context observations with domain-specific coverage.

    Long form: one row per period x geography x domain x indicator, carrying the
    published unit and the full source lineage (workbook, sheet, row). This is
    the processed dataset that surfaces the 78 SAS sheets which were previously
    mapped and ingested but exposed nowhere, so ``inventory_sas_workbooks`` can
    honestly report them as ``used``.

    Not routed through the canonical database: the schema does not model this
    long indicator form yet, so it reads the processed artefact. Nulls are
    published nulls (a district/period/indicator NISR did not tabulate has no
    row at all, never a zero).
    """
    return _load("agricultural_practice_observation.csv")


def fertilizer_source() -> pd.DataFrame:
    """National fertilizer type x supply-channel shares with source lineage."""
    return _load("fertilizer_source.csv")


def postharvest_use_multi_period() -> pd.DataFrame:
    """Multi-period crop post-harvest use shares (2024A-2026B), long form.

    The multi-period counterpart of :func:`postharvest_use`, which stays the
    2025 Season B single-release table its existing clients read.
    """
    return _load("crop_postharvest_use_multi_period.csv")


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
    """Drop cached tables and the memoised sync verdict (e.g. after a reload)."""
    global _sync_cache
    _sync_cache = None
    _read_csv.cache_clear()
    _csv_columns.cache_clear()
    _canonical_productivity.cache_clear()
    _canonical_observation.cache_clear()
    _panel_period_codes.cache_clear()
    _SOURCES.clear()
