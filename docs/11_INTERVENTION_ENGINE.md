# 11. Intervention Priority Engine

**Methodology version: 2.0.1** — reported in every response as
`methodology_version`. A version change means the *meaning* of a score changed;
record it whenever that happens so a published ranking can be recognised as
superseded.

## Two planning purposes

The engine answers two different questions, and a list answering one is never
presented as a list answering the other.

| Purpose | Question | Eligibility | Default weighting |
|---|---|---|---|
| `productivity_support` (default) | Where is there a verified productivity shortfall worth supporting? | a **published positive shortfall** below the selected benchmark | `wg .30 / wv .20 / wf .20 / wr .20 / wc .10` |
| `harvest_coordination` | Where is operational scale and perishability greatest? | a **measured harvested area** greater than zero | `wg 0 / wv .35 / wf .55 / wr .10 / wc 0` |

`harvest_coordination` is an operational ranking over what was actually produced.
It is not a productivity-shortfall ranking and must not be labelled as one.

## Definition

```text
score = wg·Shortfall + wv·Vulnerability + wf·Exposure + wr·Readiness − wc·CostConstraint
```

All inputs are min-max normalized to `[0, 1]` **across the stated reference
population** before weighting.

| Weight | Component | Default |
|---|---|---|
| `wg` | productivity shortfall | 0.30 |
| `wv` | vulnerability / exposure | 0.20 |
| `wf` | exposure (harvested area) | 0.20 |
| `wr` | readiness | 0.20 |
| `wc` | cost constraint (subtracted) | 0.10 |

### Eligibility, not a fabricated score

`gap_index = 100 · (1 − yield / benchmark)` is positive below the benchmark and
negative above it. Only the positive part is a shortfall:

```text
shortfall_pct = max(gap_index, 0)
```

A candidate at or above the benchmark is **ineligible** for productivity support.
It is reported with a reason (`PriorityResponse.ineligible`) and receives no
score — never a LOW band, which would still present it as a priority of some
degree. "No shortfall here" and "a small shortfall here" are different facts about
a district, and a planner acting on the list needs to be able to tell them apart.

The threshold is explicit (`shortfall_threshold_pct`, default `0.0`, i.e. any
published shortfall) rather than implied.

### The reference population is stated and stable

Components are normalized once, over the **reference scope**: the same crop,
period, benchmark and province, across all districts. Inspecting a single district
narrows what is *displayed*; it does not narrow the population, so it cannot
redefine that district's benchmark or move its score. Every response names the
population it used (`reference_population`, `reference_population_note`).

Scoring a district against a one-candidate population would exclude every
component (nothing to compare against) and must return an explicit unscorable-weight error, not build a score out of nothing —
historically one way a district above its benchmark reached the HIGH band.

### A component with no discriminating information is excluded

A component is excluded — its weight redistributed proportionally over the rest —
when either:

* the selected release does not carry it (`components_unavailable`), or
* it is **constant across the population** (`components_constant`).

A constant perishability value within a crop distinguishes no district, so
scoring it as a neutral `0.5` would manufacture evidence of differing
vulnerability. Excluding it is the honest option.

## Bands

`LOW < 0.25 ≤ MEDIUM < 0.5 ≤ HIGH < 0.75 ≤ CRITICAL`.

Bands are relative planning positions, not probabilities and not estimated
intervention effects. A CRITICAL band says "review this first", not "fixing this
returns X".

## Transparency

Every result returns the weights actually used and all component values, so a
planner can see why an area ranked where it did. Excluded components are identified explicitly and receive no weight. A zero in
an excluded normalized component is not a measured zero; inspect the exclusion
metadata before interpreting it. Missing underlying observations must remain missing.

## Component proxies

Official 2025 Season B tables do not carry every ideal component. Current proxies,
labelled in API responses under `limitations` and `component_availability`:

- **vulnerability** ← crop perishability (`high/medium/low`)
- **exposure** ← harvested area. This is an **exposure proxy**, not a measured
  count of farmers or beneficiaries.
- **readiness** ← erosion-protection adoption rate (2025B release only)
- **cost_constraint** ← inverse agricultural-land share (2025B release only)

These are placeholders, not measured quantities. Replace them as verified data
arrives and record the change with a methodology version bump.

## Where the rule lives

`services/api/app/analytics/intervention_priority.py` is the authority: the
ranking endpoint, the map, the scenario comparison, the sensitivity sweep and the
assistant's tools all read their eligibility and components from it, through
`analytics_service.priority_candidates_with_source`.

`ml/src/models/intervention_priority.py` mirrors the rule because the ML pipeline
installs without the API package. The two cannot be merged by import, so both are
tested against the same cases
(`services/api/tests/test_priority_eligibility.py`,
`ml/tests/test_intervention_priority.py`). Change one, change both.

## Status

This is **decision support**. It must not silently make binding decisions; humans
stay in the loop.
