"""Storage/aggregation allocation (transportation problem via OR-Tools).

    min  sum_ij x_ij * (alpha*d_ij + beta*cost_j + gamma*risk_ij)
    s.t. sum_j x_ij <= supply_i
         sum_i x_ij <= capacity_j
         x_ij >= 0

Facilities with unverified capacity (``None``) are never assigned a fabricated
value; they are reported separately. See docs/13_OPTIMIZATION_ENGINE.md.
"""

from __future__ import annotations

from dataclasses import dataclass, field

ALPHA = 1.0    # distance weight
BETA = 1.0     # storage cost weight
GAMMA = 100.0  # post-harvest risk weight


@dataclass
class Source:
    id: str
    quantity_kg: float
    crop: str


@dataclass
class Facility:
    id: str
    capacity_kg: float | None
    storage_cost_per_kg: float = 0.0
    crops: list[str] = field(default_factory=list)
    cold_chain: bool = False


@dataclass
class AllocationResult:
    assignments: list[dict]
    unassigned: list[dict]
    total_cost: float
    status: str
    notes: list[str] = field(default_factory=list)
    capacity_not_verified: list[str] = field(default_factory=list)


def allocate(
    sources: list[Source],
    facilities: list[Facility],
    distances: dict[tuple[str, str], float],
    risks: dict[tuple[str, str], float] | None = None,
    max_distance_km: float | None = None,
) -> AllocationResult:
    from ortools.linear_solver import pywraplp

    risks = risks or {}
    notes: list[str] = []

    unverified = sorted({f.id for f in facilities if f.capacity_kg is None})
    if unverified:
        notes.append("capacity_not_verified")

    usable = [f for f in facilities if f.capacity_kg is not None and f.capacity_kg > 0]
    if not usable:
        return AllocationResult(
            [], [{"id": s.id, "reason": "no_usable_facility"} for s in sources],
            0.0, "INFEASIBLE", notes, unverified,
        )

    solver = pywraplp.Solver.CreateSolver("GLOP")
    if solver is None:
        return AllocationResult([], [], 0.0, "SOLVER_UNAVAILABLE", notes, unverified)

    x = {}
    for s in sources:
        for f in usable:
            if max_distance_km is not None and distances.get((s.id, f.id), 0.0) > max_distance_km:
                continue
            if f.crops and s.crop not in f.crops:
                continue
            x[(s.id, f.id)] = solver.NumVar(0, solver.infinity(), f"x_{s.id}_{f.id}")

    if not x:
        return AllocationResult(
            [], [{"id": s.id, "reason": "no_compatible_facility"} for s in sources],
            0.0, "INFEASIBLE", notes, unverified,
        )

    for s in sources:
        terms = [x[(s.id, f.id)] for f in usable if (s.id, f.id) in x]
        if terms:
            solver.Add(sum(terms) <= s.quantity_kg)
    for f in usable:
        terms = [x[(s.id, f.id)] for s in sources if (s.id, f.id) in x]
        if terms:
            solver.Add(sum(terms) <= f.capacity_kg)

    objective = []
    for (sid, fid), var in x.items():
        fac = next(f for f in usable if f.id == fid)
        d = distances.get((sid, fid), 0.0)
        r = risks.get((sid, fid), 0.0)
        objective.append(var * (ALPHA * d + BETA * fac.storage_cost_per_kg + GAMMA * r))
    solver.Minimize(sum(objective))

    status = solver.Solve()
    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return AllocationResult([], [], 0.0, "INFEASIBLE", notes, unverified)

    assignments = []
    assigned: dict[str, float] = {}
    for (sid, fid), var in x.items():
        qty = var.solution_value()
        if qty > 1e-6:
            assignments.append({"source": sid, "facility": fid, "quantity_kg": round(qty, 3)})
            assigned[sid] = assigned.get(sid, 0.0) + qty

    unassigned = [
        {"id": s.id, "quantity_kg": round(s.quantity_kg - assigned.get(s.id, 0.0), 3)}
        for s in sources
        if s.quantity_kg - assigned.get(s.id, 0.0) > 1e-6
    ]
    return AllocationResult(
        assignments, unassigned, round(solver.Objective().Value(), 3), "OPTIMAL", notes, unverified
    )
