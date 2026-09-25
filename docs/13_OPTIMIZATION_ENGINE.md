# 13. Storage / Aggregation Optimization

## Model

Transportation problem. Decision variable `x_ij` = kg moved from source `i` to
facility `j`.

```text
min  Σ x_ij · (α·d_ij + β·cost_j + γ·risk_ij)
s.t. Σ_j x_ij ≤ supply_i        (never over-allocate a harvest)
     Σ_i x_ij ≤ capacity_j      (respect facility capacity)
     x_ij ≥ 0
```

Default objective weights: `α = 1.0` (distance), `β = 1.0` (storage cost),
`γ = 100` (post-harvest risk, scaled because risk ∈ [0,1] and cost is per-kg RWF).

## Constraints supported

- farmer/source available quantity;
- facility capacity;
- crop compatibility (`Facility.crops`);
- cold-chain flag;
- maximum distance (`max_distance_km`).

## Capacity is never fabricated

Facilities with `capacity_kg = None` are **excluded** from the solve and returned
under `capacity_not_verified`. The API surfaces this to the UI so it displays
"Capacity not verified" rather than a guessed value.

## Outputs

`assignments`, `unassigned` (with reasons), `total_cost`, `status`
(`OPTIMAL` / `INFEASIBLE` / `SOLVER_UNAVAILABLE`), `notes`, and
`capacity_not_verified`.

## Implementation

`ml/src/optimization/storage.py` and
`services/api/app/optimization/storage_allocation.py`, exposed at
`POST /api/v1/optimization/storage-allocation`.
