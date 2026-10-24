"""Request/response models for the Manual Projection ("Build a projection") endpoint.

The contract keeps three things apart, in the schema itself rather than in a
footer:

* the **observed baseline** — published NISR observations the projection starts
  from (:class:`BaselineObservation`);
* the **user's assumptions** — what the caller stated (:class:`ProjectionCase`);
* the **projection** — the arithmetic result (:class:`ProjectedPoint`).

Every row of a :class:`ManualProjectionResponse` carries a ``value_kind`` of
``planning_projection`` so a downstream consumer, an export or an AI explanation
can never present it as an official statistic or a validated forecast.

``extra="forbid"`` on the request: an unknown field is rejected rather than
silently ignored, so engine-keyed vocabulary (``wg``, ``wv``…) and typos cannot
reach the engine as a no-op.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Provenance

MethodName = Literal["carry_forward", "percent_change", "personal"]
BaselineChoice = Literal["latest_observed", "median_window"]
MetricName = Literal["yield_kg_ha", "production_mt"]
Compounding = Literal["once", "per_step"]
CaseLabel = Literal["lower", "main", "higher"]


class ProjectionCase(BaseModel):
    """One named assumption case.

    Bands are *separate assumption cases*, not a statistical interval. The labels
    are deliberately lower/main/higher rather than 80% or 95%: no interval method
    has been evaluated for this engine, so calling the band a confidence interval
    would claim a coverage property that does not exist.
    """

    model_config = ConfigDict(extra="forbid")

    label: CaseLabel
    change_pct: float = Field(
        ...,
        ge=-95,
        le=500,
        description="the assumed change from the baseline, in percent",
    )


class ManualProjectionRequest(BaseModel):
    """A stateless projection specification.

    No field identifies a user or a farm: the calculation writes nothing and
    stores nothing. Personal assumptions live only in the request and the
    response the caller chose to keep.
    """

    model_config = ConfigDict(extra="forbid")

    crop: str = Field(..., min_length=1, max_length=120)
    geography: Literal["district", "national"] = "district"
    district: str | None = Field(
        None, max_length=120, description="required when geography is 'district'"
    )
    season: Literal["A", "B", "C"] = Field(
        ..., description="the season letter the horizon steps through, same as the origin"
    )
    origin_period: str | None = Field(
        None,
        max_length=8,
        description=(
            "the last observed same-season period to start from; defaults to the "
            "latest observed one. A historical origin restricts evidence to "
            "observations at or before it"
        ),
    )
    horizon_steps: int = Field(
        1, ge=1, le=3, description="how many same-season steps forward to project"
    )
    metric: MetricName = "yield_kg_ha"
    method: MethodName = Field(
        "carry_forward",
        description="how the projection is computed from the baseline",
    )
    baseline: BaselineChoice = Field(
        "latest_observed",
        description="how the observed baseline is chosen",
    )
    baseline_window: int | None = Field(
        None, ge=2, le=8, description="number of same-season observations for a median baseline"
    )
    change_pct: float | None = Field(
        None, ge=-95, le=500, description="the assumed change for the 'percent_change' method"
    )
    compounding: Compounding = Field(
        "once",
        description="whether the assumed change applies once or compounds per step",
    )
    assumed_yield_kg_ha: float | None = Field(
        None, gt=0, le=200_000, description="personal-plan yield assumption"
    )
    assumed_harvested_area_ha: float | None = Field(
        None, gt=0, le=10_000_000, description="personal-plan harvested-area assumption"
    )
    cases: list[ProjectionCase] | None = Field(
        None,
        max_length=3,
        description="optional lower/main/higher assumption bands for the same method",
    )
    # Export requests may carry the identity of the result currently visible in
    # the browser. These fields are verification guards, not calculation inputs:
    # the service excludes them from the calculation specification and refuses
    # an export if the underlying dataset or result has changed.
    expected_calculation_id: str | None = Field(
        None,
        min_length=3,
        max_length=80,
        description="calculation id shown by the caller before downloading an export",
    )
    expected_dataset_version: str | None = Field(
        None,
        min_length=1,
        max_length=160,
        description="dataset version shown by the caller before downloading an export",
    )


class BaselineObservation(BaseModel):
    """One published observation the projection starts from."""

    period_code: str
    period_label: str
    value: float
    unit: str
    source_id: str | None = None
    source_release: str | None = None
    source_workbook: str | None = None
    source_sheets: str | None = None
    row_scope: str | None = None
    farmer_scale: str | None = None
    geography: str = ""


class ProjectedPoint(BaseModel):
    period_code: str
    period_label: str
    value: float
    unit: str
    #: Always true: a future season code is a planning target, never an official
    #: published release.
    is_planning_target: bool = True


class ProjectionCaseResult(BaseModel):
    label: str
    change_pct: float | None = None
    compounding: str | None = None
    points: list[ProjectedPoint] = Field(default_factory=list)
    change_from_baseline_pct: float | None = None


class ResolvedSelection(BaseModel):
    crop: str
    crop_code: str | None = None
    geography: str
    district: str | None = None
    province: str | None = None
    season: str
    metric: str
    metric_unit: str
    origin_period: str
    origin_label: str
    #: ``observed`` when the origin is a published observation; ``assumed``
    #: when it is only a planning period (no published same-season data).
    origin_kind: Literal["observed", "assumed"] = "observed"
    horizon_steps: int
    target_periods: list[str] = Field(default_factory=list)


class EvidenceReference(BaseModel):
    """A compact, source-linked reference — never the whole raw workbook."""

    source_id: str | None = None
    period_code: str | None = None
    metric: str | None = None
    geography: str | None = None
    value: float | None = None
    unit: str | None = None
    value_kind: str = "observed"
    source_workbook: str | None = None
    source_sheets: str | None = None


class ProjectionExportRow(BaseModel):
    """One export-ready row.

    ``row_kind`` is what keeps an export honest: an assumption row is never
    labelled official even though its baseline came from NISR.
    """

    row_kind: Literal["observed_baseline", "assumption", "projection"]
    label: str
    period_code: str | None = None
    period_label: str | None = None
    metric: str
    value: float
    unit: str
    case: str | None = None
    source_id: str | None = None
    note: str | None = None


class ProjectionOriginOption(BaseModel):
    """One selectable planning origin, offered from the scope's actual coverage.

    ``observed`` options carry the published value they would start from;
    ``assumed`` options are period-axis planning periods (a personal plan with
    no published history) and carry no value — the two kinds are never mixed
    into one indistinguishable list.
    """

    period_code: str
    period_label: str
    kind: Literal["observed", "assumed"]
    value: float | None = None
    unit: str | None = None
    source_id: str | None = None


class ProjectionOriginsResponse(BaseModel):
    """Selectable origins for one crop/geography/season scope.

    Derived from the panel rather than a static list: a period with no
    published same-season observation for this scope is simply not offered,
    because selecting it would only ever produce ``origin_not_observed``.
    """

    season: str
    metric: str
    origins: list[ProjectionOriginOption] = Field(default_factory=list)
    #: Plain-language reason when the list is short or empty (no same-season
    #: history, axis without that season); None when the list is full coverage.
    note: str | None = None


class ManualProjectionResponse(BaseModel):
    calculation_id: str
    value_kind: str
    value_kind_label: str
    assumption_badge: str
    methodology_version: str
    dataset_version: str | None = None
    method: str
    method_label: str
    method_note: str
    baseline: str
    baseline_label: str
    baseline_value: float
    baseline_unit: str
    baseline_is_assumption: bool = False
    baseline_observations: list[BaselineObservation] = Field(default_factory=list)
    baseline_note: str | None = None
    assumptions: dict = Field(default_factory=dict)
    cases: list[ProjectionCaseResult] = Field(default_factory=list)
    units: str
    resolved: ResolvedSelection
    evidence: list[EvidenceReference] = Field(default_factory=list)
    rounding: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    export_rows: list[ProjectionExportRow] = Field(default_factory=list)
    provenance: Provenance
