# Current Status

Review date: **2026-10-17**. Scope: the implementation preserved in commit
`f24bc09`, followed by documentation consolidation. This is an engineering MVP
with known defects, not a claim of complete production readiness.

This file replaces overlapping session reports. Detailed methods remain in their
domain documents. The executable next-task brief is
[REMAINING_BUILD_PROMPT.md](REMAINING_BUILD_PROMPT.md).

## Implemented

| Area | Current implementation | Boundary |
|---|---|---|
| Data | Multi-period crop panel, practice and post-harvest observations, canonical database loader | Not all source sheets mapped; source conflicts unresolved |
| Analytics | Productivity gaps, associated factors, priority methodology 2.0.1, risk and optimization | Selected-district benchmark defect remains outside the priority engine |
| Web | Overview, productivity, interventions, maps, reports, explorer and transparency routes | Route existence does not prove full requested UX acceptance |
| Manual planning | Stateless Python calculation API and web form for carry-forward, percentage assumptions and personal plans | Edge cases, saved plans and complete exports remain unfinished |
| Maps | Metric-aware legends, missing-data states, priority bands and yield-shortfall layer | Negative gap interpolation still defective |
| Assistant | Retrieved evidence, optional provider, numeric/citation/claim guards | Demonstrated entity-attribution bypasses remain |
| Mobile | Expo screens, SQLite creation, offline queue, EN/RW structure | Farm/harvest server persistence contract remains incomplete |
| Toolchain | Mobile now declares React 19 DOM types directly | Current CI result must be verified against the pushed commit |

Observed statistics, manual assumptions and validated model forecasts are
different value kinds. Validation-withheld forecasts, missing market prices and
unverified storage capacity must remain unavailable.

## Open Correctness Findings

| Priority | Finding and reproduction | Primary files |
|---|---|---|
| P1 | Maize/2026B: Bugesera's benchmark changes from 1159.1443 to its own 952.1516 kg/ha after district selection; gap becomes 0 instead of about 17.8574% | `services/api/app/services/analytics_service.py` |
| P1 | Mobile sends farm, dates, coordinates, notes and storage intent that the harvest API does not persist; local farm branch marks synced without uploading | `apps/mobile/src/sync/queue.ts`, API harvest schema/route/models |
| P1 | Claim guard accepts an evidence value assigned to an unlisted district, and two district values swapped in one sentence | `services/api/app/ai/claim_guard.py`, `output_validator.py` |
| P1 | Wheat/Bugesera/C personal production plan with origin 2025C and empty history reaches `observations[-1]` and returns HTTP 500 | `manual_projection_service.py` |
| P1 | Same personal Season C request without origin can resolve baseline 2026B and target 2027B while echoing season C | `manual_projection_service.py` |
| P2 | Frontend year=2026 + period=2026B query drops available 2025B comparison because previous-period probe retains current year | `analytics_service.py` |
| P2 | Personal historical origin exposes later observations in its evidence window; partial assumption cases can be numerically reversed | `manual_projection_service.py` |
| P2 | Negative gaps -40 and -10 share the same fill under domain [-50,20]; legend normalization needs alignment | `apps/web/features/maps/colors.ts`, `MapLegend.tsx` |
| P2 | Explorer HTTP router ignores indicator filters; literal `[` search returns HTTP 500 | `api/v1/data.py`, `dataset_service.py` |
| P2 | Expanded source notes overflow a 1440 px viewport to 1624 px | `SourceDisclosure.tsx`, dashboard chart containers |

These are tested audit reproductions, not claims that every user encounters every
case. Current green tests do not cover all these failures. They are deliberately
not marked repaired by this documentation cleanup.

## Remaining Delivery Work

1. Repair the correctness findings with focused regression tests.
2. Resolve 2025B workbook precedence and worksheet exclusions; add precise
   per-metric lineage and reviewed data-quality evidence.
3. Complete manual origin controls, assumption comparisons, Python export and
   save/restore/share workflows without publishing user plans as official data.
4. Finish dedicated Maps, Reports, Data Explorer, Data & Models and Settings
   workflows using the new multi-period data and coverage-aware filters.
5. Complete native mobile clarity, clickable maps, Compare, Ask and lossless sync.
6. Complete the browser/device QA matrix, accessibility checks, native-speaker
   Kinyarwanda review and approved screenshots.
7. Verify actual GitHub CI, deployment commit parity, live endpoints and an APK
   built against the hosted API. Do not infer deployment from a push alone.

## Verification Evidence

The 2026-10-17 source audit ran these checks before documentation consolidation:

| Check | Observed result |
|---|---|
| API + scripts + ML pytest | 932 passed, 28 skipped, exit 0 |
| Web Vitest | 415 passed, 28 files, exit 0 |
| Mobile Vitest | 341 passed, 25 files, exit 0 |
| Ruff, web/mobile lint, web/mobile TypeScript | Passed in existing installations |
| Next.js production build with hosted API URL | Passed; 19 static pages generated |
| Ordinary manual plan | Calculated in browser at 1440x900, 1920x1080, 768x1024 and 390x844; CSV downloaded |
| Edge-case correctness checks | Failures reproduced as listed above |

The cleanup also ran mobile from a fresh isolated `npm ci` installation outside
the parent workspace: typecheck, lint, all 341 tests and Expo public configuration
passed with exit 0. The missing React DOM types are now declared and locked.
This establishes local clean-install evidence, not an assumed GitHub CI pass.

Limits: 27 API database-backed tests and one script test were skipped locally;
no new physical-device test, native-language sign-off, credentialed provider
evaluation or complete all-route browser matrix was performed. Temporary browser
captures are not approved submission screenshots.

## Release State

The pre-push production observation on 2026-10-17 showed a ready database and
dataset `0.2.0-646a72d53cd349df`, but no manual-projection route and no two new
multi-period explorer entries. These observations are time-bound, not a promise
of current deployment parity. The GitHub workflow at baseline `cdffdf7` failed
the mobile job; a fresh workflow on the new release must establish its result.

Repository visibility, production records and paid EAS builds are not changed by
this cleanup. No source datasets or maintained regression suites were deleted.

## Documentation Cleanup

Superseded progress/repair reports, pre-restructure audits, the outdated root
research plan and generated tree/test inventories were removed after preserving
them in Git history. The historical production smoke JSON and one-off inventory
generator were also removed. Current source policies, architecture, operations,
data dictionaries, submission evidence and automated tests are retained.
