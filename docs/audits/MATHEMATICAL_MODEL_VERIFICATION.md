# Mathematical and Model Verification

Reviewed: 2026-10-28.

## Canonical formulas

### Published yield identity

Where the source publishes production and harvested area:

```text
implied_yield_kg_ha = 1000 * production_mt / harvested_area_ha
```

The factor 1,000 converts metric tonnes to kilograms. The product keeps the
published yield as the authoritative observation and uses the identity only for
reconciliation. A discrepancy is classified as rounding or source
inconsistency; it is never silently corrected.

### Productivity Gap Index

```text
PGI = 100 * (benchmark_yield_kg_ha - observed_yield_kg_ha)
      / benchmark_yield_kg_ha
```

Positive PGI means the observation is below the selected benchmark. Negative
PGI means it is above the benchmark. The benchmark strategy is returned with
the result and is not inferred by the frontend.

### Priority eligibility

Productivity-support priority is eligible only when a crop-specific benchmark
comparison exists and the shortfall is positive. Above-benchmark observations
cannot become high shortfall priorities. Missing readiness or cost components
remain unavailable and their weights are redistributed over available
components; missing is not converted to zero.

### Aggregation rules

- National aggregate yield is a ratio of production totals to harvested-area
  totals, not an average of crop yields.
- Crop yields are never averaged across unrelated crops.
- Practice percentages retain their survey denominator and are not presented as
  the share of all farmers using at least one practice.
- National published rows are not silently replaced by sums of district rows.
- A missing period or indicator is absent/null, not zero or interpolated.

## Implementation parity

The API implementation is in `services/api/app/analytics/productivity_gap.py`;
the ML helper is in `ml/src/models/productivity_gap.py`. Existing regression
tests cover benchmark strategies, PGI direction, missing benchmarks, priority
eligibility, component redistribution, scenario inputs and forecast gates.
The scientific validation command adds current-panel identity, lineage,
non-negativity and source-precedence checks.

## Forecasting status

Forecasts remain withheld unless a registered model has chronological,
rolling-origin validation for the requested target, scope and season. A
manual projection is a user-assumption planning tool and must not be labelled
as a statistical prediction, confidence interval or promised yield gain.

## Known limitations

The panel contains 89 official source rows where published yield does not
reconcile with production and harvested area beyond the tolerance
`max(1 kg/ha, 1% of published yield)`. Those rows are visible quality findings.
No mathematical review can convert them into verified observations without
reconciling against the original NISR publication.
