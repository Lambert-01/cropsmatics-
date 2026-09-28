"""Analytical scenario endpoints.

``POST /scenarios/yield`` re-runs the published yield analytics under two sets of
reviewable assumptions and reports what changed. It is a re-computation, not a
prediction: see ``app.services.scenario_service``.

The route is intentionally read-only in effect even though it is a POST - a
scenario has six parameters and is far clearer as a body than as a long query
string. It writes nothing and mutates nothing.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.analytics.scenario import ScenarioError
from app.schemas.scenario import ScenarioRequest, ScenarioResponse
from app.services import period_service, scenario_service

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
