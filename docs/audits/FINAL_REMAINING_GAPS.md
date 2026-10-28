# Final Remaining Gaps

Reviewed: 2026-10-28.

## Release blockers

1. Rebuild the data pipeline on the release commit and confirm the manifest and
   scientific report show the same code/data identity.
2. Run database-backed API and canonical loader tests against an isolated
   PostGIS database; do not point them at production.
3. Confirm the exact Render and Vercel deployment commits after merge.
4. Install the release APK on a physical Android device and verify map
   selection, Compare, Ask, harvest registration, offline persistence and
   reconnect/sync.
5. Complete human keyboard/focus review and obtain a fluent Kinyarwanda review.

## Scientific limitations that must remain visible

- 89 official productivity rows remain beyond the yield reconciliation
  tolerance. They are source findings, not corrected values.
- Detailed cell-level lineage is not available for every derived aggregate;
  current lineage exposes workbook, sheets, metric source tables and source
  row references.
- Forecasts remain withheld where chronological validation is not registered.
- Market prices, facility capacities, farmer counts, budgets and expected gains
  remain unavailable unless attributable evidence is added.
- No causal effect or field impact has been measured.

## Desirable follow-up

- Build a metric-keyed source-cell sidecar for multi-table aggregates.
- Add approved screenshot artifacts and a reviewer-signoff table.
- Add an isolated CI PostGIS service to remove database-test skips.
- Conduct a small, consented planner usability study and report task completion
  without fabricating adoption or agricultural outcomes.
- Extract a shared productivity-gap package so API and ML cannot drift.
