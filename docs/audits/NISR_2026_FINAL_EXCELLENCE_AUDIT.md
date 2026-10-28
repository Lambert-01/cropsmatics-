# Cropmatics Rwanda — Consolidated NISR 2026 Readiness Audit

**Team:** DataSprout (Lambert and Joyeuse)  
**Competition:** NISR 2026 Big Data Hackathon — Track 1: Agricultural Productivity  
**Reviewed:** 28 October 2026  
**Audited implementation commit:** `78e760c` on `codex/final-excellence-2026` (based on main `9c1d01f`)
**Integrated into main:** `c761956` (documentation consolidation and release integration)
**Scope:** Scientific release validation, software and usability evidence, deployment boundaries and competition readiness. This is an internal assessment, **not** an official NISR result.

## Executive decision

**Ready to rehearse and record a controlled web demonstration. Not certified as fully validated production software or a field-proven agricultural intervention system.**

Cropmatics combines official NISR Seasonal Agricultural Survey statistics, district-and-crop productivity comparisons, interpretable intervention-priority scenarios, documented source evidence, a grounded assistant and an Expo mobile app. The defensible problem statement is:

> Use official crop-production statistics to identify district productivity shortfalls, compare evidence-supported investigation priorities, and support transparent planning decisions.

Do not claim it delivers validated future yield forecasts, market prices, facility capacities, proven causal yield gains or measured farmer outcomes where no such evidence exists.

## Scientific validation

New executable check: `scripts/data/scientific_validation.py` through `make scientific-validation`; regression tests in `scripts/tests/test_scientific_validation.py`.

| Local report from the audited branch | Result |
|---|---:|
| Passed checks | 11 |
| Failed checks | 0 |
| Skipped checks | 0 |
| Unresolved findings | 2 |

The two unresolved findings are (1) **89 materially inconsistent official published yield observations** compared with `1000 × production_mt / harvested_area_ha`, and (2) the checked-in processed manifest predates the deterministic **pipeline-source content hash**. The manifest now records that hash rather than relying on Git HEAD alone; rebuild the dataset once on the selected release code and rerun the scientific gate. The 89 findings are source-quality issues to investigate and disclose, **not values to overwrite**.

The documented canonical panel has **6,156 observations, 14 released periods (2022A–2026B), 30 districts and 17 crops**. Check current output rather than treating these as fixed constants. The validator checks natural-key uniqueness, non-negativity, source-release precedence, lineage fields, data dimensions and version identity. It does **not** prove every original workbook cell or every displayed UI number is independently audited.

**Equations and interpretation:**
- `implied_yield_kg_ha = 1000 × production_mt / harvested_area_ha` for reconciliation; published yield remains the source observation
- `PGI (%) = 100 × (benchmark - observed) / benchmark`, defined for positive benchmark
- Top-quartile comparable-district benchmarking now uses **median** consistently in the API and ML helper
- National aggregate yields require a ratio of compatible production and area totals, not a simple cross-crop yield average
- Missing observations remain missing, not fabricated zeros
- Priority weights are heuristic decision-support parameters, not estimated causal effects or probabilities
- User-input planning projections are not validated forecasts or confidence intervals
- Forecasts remain withheld when chronological backtesting does not pass publication criteria

Source proof: [SAS coverage audit](../data/SAS_COVERAGE_AUDIT.md) · [Data Card](../submission/DATA_CARD.md) · [Detailed traceability](../submission/DATA_TO_NUMBER_TRACEABILITY.md) · [Model interpretation](../MODEL_INTERPRETATION_POLICY.md) · [Forecast validation](../forecasting/FORECAST_VALIDATION.md).

**Traceability boundary:** workbook/sheet/table/source-row metadata are supplied; exact per-metric Excel cell resolution for every multi-table derived figure is still incomplete.

## Engineering and interface evidence

The development agent reported: **445 web tests** and **354 mobile tests** passed, plus API, script and ML suites; the prior repository report records **16/16 Playwright checks** and **zero serious/critical automated axe findings** on ten sampled routes. The scientific feature branch itself had no independent GitHub Actions run at audit time; the base `main` commit had passing CI. Do not merge the two claims.

Web dashboards, crop analytics, district maps, intervention rankings, planning calculations, provenance and error states have automated coverage. **Not yet accepted end-to-end:** full rendered browser review, export and share-link behavior under all scopes, keyboard/drawer flows and approval of all important screenshots.

**Android:** built/available APK and component tests do not replace installation and field testing on a physical phone. Map selection, Compare, Ask, any enabled Field Operations, offline persistence, reconnect and idempotent sync require real-device evidence. Field Operations are feature-flagged off by default; never demonstrate them as enabled without confirming the build.

**AI:** deterministic grounded answers and claim-guard tests are supported, but a real credentialed Groq/Gemini response, human-scored answer quality and native Kinyarwanda meaning have not been verified for this branch.

See the maintained [UX verification matrix](../submission/UX_VERIFICATION.md), [AI evaluation](../submission/AI_EVALUATION.md) and [language review](../KINYARWANDA_REVIEW.md).

## Release status

The audited implementation is now integrated into `main` at `c761956`. Render
and Vercel deployment identity still require external verification; prior
production evidence must not be used to certify a later deployment without
checking the deployed commit and dataset version.

Before promoting a release:
1. Run `make data && make scientific-validation` on the chosen release commit; retain the JSON output and investigate every failed/unresolved result.
2. Run database and migration/ownership checks on an **isolated PostGIS database**; never point destructive tests at production.
3. Verify GitHub Actions, Vercel and Render commit identities and the live canonical dataset version.
4. Execute read-only production smoke tests and verify actual browser interactions.
5. Test the exact Android APK on a physical device and obtain needed manual accessibility/Kinyarwanda review.
6. Verify source-use rights, AI-use disclosure, exact submission attachments and team sign-off.

See [Release checklist](../PRODUCTION_READINESS.md), [Current Status](../CURRENT_STATUS.md) and [Submission alignment](../submission/NISR_WEBINAR_ALIGNMENT.md).

## Five NISR criteria — internal readiness estimates

| Criterion | Estimated readiness / 10 | Remaining evidence preventing a fully defensible 9–10 |
|---|---:|---|
| Problem understanding and relevance | **8.5** | User-tested district decision journey and explicit practical need |
| Data use and methodology | **8.5** | Rebuild manifest with the pipeline-source hash, review published inconsistencies, finish exact metric lineage |
| Technical innovation | **8.0** | Demonstrate verified end-to-end deployment and native workflows |
| Usability and design | **7.5** | Physical device testing, visual review, keyboard checks, translation approval |
| Tangible practical impact | **6.5** | No independently measured pilot use or field outcomes |

These scores are **subjective engineering assessments, not NISR marks**. Coding more features cannot by itself turn impact into 10/10; field use and measured results require real evidence.

## Recommended demo

Show one internally consistent example: choose a published period and crop (for example **Maize, Bugesera, 2026B**), inspect district observed yield and a **named** benchmark, open the productivity gap and its non-causal interpretation, show an intervention priority explanation, calculate a clearly labelled assumption-based scenario and disclose the source and limitations. Rehearse each step on the **live** application first.

The webinar-alignment record specifies a **maximum-three-minute submission recording**. Confirm the submission form's video count and file/link requirements before attaching supplemental media.

## Remaining scientific limits

The reported **89 yield source inconsistencies** remain disclosed; **exact multi-source cell lineage** remains incomplete; forecasts without adequate evidence remain withheld; absent markets/capacities are not invented; measured field impact is not established. These are honest boundaries, not grounds to fabricate better numbers.

**Bottom line:** excellent progress toward a rigorous, judge-readable release. Close the data-build identity mismatch and device/production acceptance steps rather than generating more duplicate reports.
