"""Shared response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


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


class Provenance(BaseModel):
    """Every analytical result exposes this so it can be traced and qualified."""

    source_id: str | None = None
    source_period: str | None = None
    model_version: str | None = None
    benchmark_strategy: str | None = None
    method: str | None = None
    limitations: list[str] = Field(default_factory=list)
