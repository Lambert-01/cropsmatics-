"""Shared response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class HealthOut(BaseModel):
    status: str = "ok"
    service: str = "cropmatics-api"
    version: str = "0.1.0"


class MetaOut(BaseModel):
    project: str = "Cropmatics Rwanda"
    version: str = "0.1.0"
    data_policy: str = (
        "Official statistics and voluntary app data are kept separate. "
        "Operational app signals are not official national statistics."
    )
    disclaimer: str = (
        "Model output describes associations and priorities for investigation, "
        "not proven causal effects."
    )


class ReadinessOut(BaseModel):
    """Data-readiness probe. Contains no secrets and no filesystem paths."""

    status: str = "ready"
    version: str = "0.1.0"
    datasets: dict[str, bool] = Field(default_factory=dict)
    row_counts: dict[str, int | None] = Field(default_factory=dict)
    dictionaries: bool = False
    database: str = "optional/unavailable"
    model: str = "unavailable"
    checks: list[dict] = Field(default_factory=list)


class DataVersionOut(BaseModel):
    """Safe projection of the processed-data manifest (no hashes, no paths)."""

    available: bool = False
    pipeline_version: str | None = None
    git_sha: str | None = None
    build_timestamp: str | None = None
    row_counts: dict[str, int] = Field(default_factory=dict)
    validation: dict = Field(default_factory=dict)
    dataset_count: int = 0


class Provenance(BaseModel):
    """Every analytical result exposes this so it can be traced and qualified."""

    # `model_version` is part of the public contract and is reported, not
    # computed, so opt out of pydantic's `model_` protected namespace instead of
    # renaming the field (renaming would break existing API clients).
    model_config = ConfigDict(protected_namespaces=())

    source_id: str | None = None
    source_period: str | None = None
    model_version: str | None = None
    benchmark_strategy: str | None = None
    method: str | None = None
    limitations: list[str] = Field(default_factory=list)
