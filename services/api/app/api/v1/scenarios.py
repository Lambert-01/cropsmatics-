"""Analytical scenario endpoints.

``POST /scenarios/yield`` re-runs the published yield analytics under two sets of
reviewable assumptions and reports what changed. ``POST /scenarios/priority``
does the same for the Intervention Planner's weighted ranking, and
``POST /scenarios/sensitivity`` re-ranks the same candidates under a reproducible
sweep of plausible weightings.

Every route here is a re-computation, not a prediction: see
``app.services.scenario_service`` and ``app.services.priority_scenario_service``.
They are intentionally read-only in effect even though they are POSTs - a
scenario has several parameters and is far clearer as a body than as a long query
string. They write nothing and mutate nothing.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.analytics.scenario import ScenarioError
from app.analytics.sensitivity import SensitivityError
from app.schemas.priority_scenario import PriorityScenarioRequest, PriorityScenarioResponse
from app.schemas.scenario import ScenarioRequest, ScenarioResponse
from app.schemas.sensitivity import SensitivityRequest, SensitivityResponse
from app.services import (
    period_service,
    priority_scenario_service,
    scenario_service,
    sensitivity_service,
)
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
