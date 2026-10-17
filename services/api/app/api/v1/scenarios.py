"""Analytical scenario endpoints.

``POST /scenarios/yield`` re-runs the published yield analytics under two sets of
reviewable assumptions and reports what changed. ``POST /scenarios/priority``
does the same for the Intervention Planner's weighted ranking, and
``POST /scenarios/sensitivity`` re-ranks the same candidates under a reproducible
sweep of plausible weightings.

``POST /scenarios/manual-projection`` is the one route here that looks *forward*.
It computes a user-controlled projection from a published observed baseline and
the caller's explicit assumptions, and labels every value as
``planning_projection``. It is deliberately separate from ``/analytics`` (which
reports published observations) and from the validated-forecast status endpoint
(which reports what a gated model may publish). It writes nothing and cannot
mutate the canonical tables.

Every route here is a re-computation, not a prediction: see
``app.services.scenario_service`` and ``app.services.priority_scenario_service``.
They are intentionally read-only in effect even though they are POSTs - a
scenario has several parameters and is far clearer as a body than as a long query
string. They write nothing and mutate nothing.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.analytics.manual_projection import ProjectionError
from app.analytics.scenario import ScenarioError
from app.analytics.sensitivity import SensitivityError
from app.schemas.manual_projection import (
    ManualProjectionRequest,
    ManualProjectionResponse,
    ProjectionOriginsResponse,
)
from app.schemas.priority_scenario import PriorityScenarioRequest, PriorityScenarioResponse
from app.schemas.scenario import ScenarioRequest, ScenarioResponse
from app.schemas.sensitivity import SensitivityRequest, SensitivityResponse
from app.services import (
    manual_projection_service,
    period_service,
    priority_scenario_service,
    scenario_service,
    sensitivity_service,
)
from app.services.manual_projection_service import ProjectionUnavailable
from app.services.priority_scenario_service import UnknownSelectionError

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.post("/yield", response_model=ScenarioResponse)
def yield_scenario(payload: ScenarioRequest) -> ScenarioResponse:
    """Compare two analytical yield views for one crop.

    Rejects an unpublished period with 422 and an unknown crop with 404, rather
    than returning an empty comparison that would read as "no difference".
    """
    try:
        return scenario_service.run(payload)
    except period_service.UnknownPeriodError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except scenario_service.UnknownCropError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScenarioError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/priority", response_model=PriorityScenarioResponse)
def priority_scenario(payload: PriorityScenarioRequest) -> PriorityScenarioResponse:
    """Compare two weighted priority rankings over the same candidate universe.

    Rejects an unpublished period or an unsupported benchmark strategy with 422
    rather than returning an empty comparison that would read as "no difference".
    """
    try:
        return priority_scenario_service.run(payload)
    except period_service.UnknownPeriodError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (UnknownSelectionError, ScenarioError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/manual-projection", response_model=ManualProjectionResponse)
def manual_projection(payload: ManualProjectionRequest) -> ManualProjectionResponse:
    """Build a planning projection from a published baseline and stated assumptions.

    Returns ``422`` with a structured reason when the selection cannot be
    projected (no published same-season history, a window larger than the
    history, an incompatible personal-plan combination) rather than an all-null
    success. The response is a ``planning_projection``; it is never an official
    statistic and never a validated forecast.
    """
    try:
        return manual_projection_service.run(payload)
    except ProjectionUnavailable as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message": str(exc)}
        ) from exc
    except ProjectionError as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message": str(exc)}
        ) from exc


@router.get("/manual-projection/origins", response_model=ProjectionOriginsResponse)
def manual_projection_origins(
    crop: str = Query(..., min_length=1, max_length=120),
    season: str = Query(..., pattern="^(A|B|C)$", description="the season letter the plan targets"),
    district: str | None = Query(None, max_length=120),
    metric: str = Query("yield_kg_ha", pattern="^(yield_kg_ha|production_mt)$"),
    method: str = Query(
        "carry_forward",
        pattern="^(carry_forward|percent_change|personal)$",
        description="only a personal plan may start without a published observation",
    ),
) -> ProjectionOriginsResponse:
    """Which origins the origin selector may offer for this scope.

    Derived from the same panel the projection reads: every option is a period
    with a published same-season observation for this crop, geography and
    season (or — for a personal plan with no history — a same-season planning
    period, marked ``assumed``). A scope without coverage returns an empty list
    with the reason, not a list of periods that would only fail on calculate.
    """
    district = (district or "").strip() or None
    try:
        return manual_projection_service.available_origins(
            ManualProjectionRequest(
                crop=crop,
                geography="district" if district else "national",
                district=district,
                season=season,
                metric=metric,
                method=method,
            )
        )
    except ProjectionUnavailable as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message": str(exc)}
        ) from exc
    except ProjectionError as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message": str(exc)}
        ) from exc


@router.post("/sensitivity", response_model=SensitivityResponse)
def sensitivity(payload: SensitivityRequest) -> SensitivityResponse:
    """Re-rank the candidates under many plausible weightings.

    The reported share is a **robustness share across tested weightings, not a
    probability**. The sweep is deterministic for a given seed, so a result can be
    reproduced and reviewed.
    """
    try:
        return sensitivity_service.run(payload)
    except period_service.UnknownPeriodError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SensitivityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
