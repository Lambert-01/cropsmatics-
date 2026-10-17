# Data Card — Cropmatics Rwanda

A reviewer-facing summary of what data the product uses, what it computes, and
what it must **not** be used for. Detailed evidence is linked, not reproduced.

## Decision problem and intended users

NISR Track 1 (Agricultural Productivity). A planner, extension officer or
cooperative coordinator asks: *where is a crop's yield short of a defensible
benchmark, and what does the published evidence actually support?* Intended users
are agricultural planners, extension teams and cooperative coordinators.
Farmer-facing surfaces must use simple language and must never present a district
aggregate as advice about one farm.

## Sources

All figures come from the **Seasonal Agricultural Survey (SAS)** workbooks
published by NISR, read through the pipeline in `scripts/data/`. The raw
workbooks are immutable and are never edited to make a warning disappear.

Registered source releases in the current serving panel (from the processed
manifest), **not** a hand-written list:

| Release id | Used by |
|---|---|
| `NISR_SAS_2022_ANNUAL` … `NISR_SAS_2025_ANNUAL` | multi-period productivity panel |
| `NISR_SAS_2026A`, `NISR_SAS_2026B` | multi-period productivity panel |
| `MINAGRI_*` context tables | post-harvest and cold-chain program context |
| `REFERENCE_DICTIONARY` | district and crop dictionaries |

**Permission status: not asserted here.** Publication rights, attribution and any
licence are the owner's to declare; this document does not make that declaration.

## Canonical dataset identity

| Fact | Value (from `data/processed/` at the time of writing) |
|---|---|
| Pipeline version | `0.2.0` |
| Manifest git sha | `ae29d28` |
| Manifest build timestamp | `2026-10-14T07:40:57+00:00` |
| Productivity panel rows | 6,156 |
| Periods | 14 (`2022A`–`2026B`) |
| Districts with district rows | 30 |
| Canonical crops | 17 |

**Freshness note.** The processed manifest was built at an earlier commit than the
code in this session and the pipeline was **not** rebuilt here. These numbers are
therefore observations of the current artefacts, not constants: they must be
recomputed from the manifest, never hardcoded. A deploy must run the real
migration and load path, and the canonical database must be proven in sync (the
API already refuses to serve a mismatched dataset rather than answering with
stale figures).

## Geographic units, periods and definitions

* Geography is the NISR **district** (30) and **province**; national rows are the
  published national figures, never a sum of district rows presented as published.
* Periods are `YYYYS` (`2026B`). A period is **published** (the release exists)
  and **servable** (this deployment's canonical panel carries it) — two different
  facts the API reports separately.
* `farmer_scale` is preserved. National "all" rows are the published totals;
  small-scale and large-scale breakdowns are never combined with them.
* Yield is `kg/ha`; production `metric tonnes`; area `ha`. Units travel with
  every value.

## Missingness

A period or district a release did not tabulate has **no row**, and is returned as
`null` — never a zero. Missing cold-chain capacity is missing, not zero. An
untrained model is not "0% accurate". A user-entered range is not a confidence
interval. A derived district sum is labelled as derived, never substituted for a
published national total.

## How a number is produced (the four value kinds)

| Kind | Example | Evidence |
|---|---|---|
| **Published observation** | a district yield for `2026B` | source id + workbook/sheet lineage in the panel |
| **Deterministic transformation** | a yield gap against a chosen benchmark | benchmark strategy + inputs + algorithm version |
| **Expert-set rule** | a productivity-support priority score | components, effective weights, reference population |
| **Trained model** | a forecast, only when the publication gate allows | target, training window, folds, baseline comparison |
| **User assumption** | a manual projection | the user's own inputs; `value_kind = planning_projection` |

Statistical associations do **not** establish causal effects, and the product says
so wherever a correlation could be misread as one.

## Appropriate and inappropriate uses

**Appropriate:** exploring which districts show a crop-specific shortfall;
comparing the same crop and season across districts; planning where to
investigate; building a next-season plan from a stated baseline with explicit
assumptions.

**Inappropriate:** treating a district average as a farm's guaranteed yield;
reading program context as available storage capacity; presenting a manual
projection as an official forecast; inferring an intervention's causal return
from a correlation; treating a priority score or a robustness share as a
probability.

## Source precedence and worksheet coverage

The two standalone 2025B workbooks differ and are **not** interchangeable
duplicates; resolving precedence is an explicit source-management decision
(§4 of the brief) and is **not yet documented in
`docs/data/SAS_SOURCE_PRECEDENCE.md`** — that document is outstanding. Likewise,
not every worksheet becomes an app feature, and the honest disposition of the
unmapped instances in `docs/data/SAS_COVERAGE_AUDIT.md` is outstanding (§5).
Using the relevant, justified data is the acceptance criterion — not consuming
every sheet.

## Reproducibility

```bash
make data                 # validate -> normalize -> build
make migrate && make load # canonical PostgreSQL tables
make test-api test-data test-ml
cd apps/web && npx tsc --noEmit && npx vitest run
```

`2022`/`2023` productivity availability does **not** imply practices coverage:
those are separate datasets with their own period support. Missing price feeds and
withheld forecasts are reported as unavailable, with reasons.
