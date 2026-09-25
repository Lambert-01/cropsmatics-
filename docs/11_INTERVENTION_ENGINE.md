# 11. Intervention Priority Engine

## Definition

```text
score = wg·Gap + wv·Vulnerability + wf·AffectedScale + wr·Readiness − wc·CostConstraint
```

All inputs are min-max normalized to `[0, 1]` across the candidate set before
weighting. Default weights:

| Weight | Meaning | Default |
|---|---|---|
| `wg` | productivity gap | 0.30 |
| `wv` | vulnerability / exposure | 0.20 |
| `wf` | affected scale (farmers/area) | 0.20 |
| `wr` | readiness | 0.20 |
| `wc` | cost constraint (subtracted) | 0.10 |

## Transparency

Every result returns the **weights** and **all component values** so a planner can
see exactly why an area ranked where it did. The score is clamped to `[0, 1]` and
mapped to bands: `LOW < 0.25 ≤ MEDIUM < 0.5 ≤ HIGH < 0.75 ≤ CRITICAL`.

Weights are adjustable from the planner interface in a later iteration; the
chosen configuration is stored with each `intervention_priority` row
(`weight_config`).

## MVP component proxies

Official 2025 Season B tables do not carry every ideal component. Current proxies
(clearly labelled in API responses under `limitations`):

- **vulnerability** ← crop perishability (`high/medium/low`)
- **readiness** ← erosion-protection adoption rate
- **cost_constraint** ← inverse agricultural-land share

These are placeholders, not measured quantities. Replace them as verified data
arrives and record the change.

## Status

This is **decision support**. It must not silently make binding decisions; humans
stay in the loop. Implementation: `ml/src/models/intervention_priority.py` and
`services/api/app/analytics/intervention_priority.py`.
