# Data Card — Cropmatics Rwanda

**Reviewed:** 2026-10-28. The checked-in panel is the current verified data
artefact; the release gate requires rebuilding it on the release commit so the
manifest, code and submitted report share one identity.

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

Official crop observations come from the **Seasonal Agricultural Survey (SAS)**
workbooks published by NISR, read through the pipeline in `scripts/data/`.
Other registered sources and user assumptions are distinguished below. The raw
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
| Local manifest build commit | `09e82e0` |
| Manifest build timestamp | `2026-10-28T07:19:04+00:00` |
| Dataset version | `0.2.0-5b51d2c390e4d101` |
| Productivity panel rows | 6,156 |
| Periods | 14 (`2022A`–`2026B`) |
| Districts with district rows | 30 |
| Canonical crops | 17 |

**Freshness note.** The pipeline has an idempotent content-addressed rebuild and
the manifest now records a deterministic `pipeline_source_sha256` for the data
transformation code. Git SHA remains historical provenance, but a docs-only
commit no longer invalidates an otherwise identical dataset. Run `make data`
followed by `make scientific-validation`; the validation report must show no
pipeline-source identity mismatch before submission.

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

## How a number is produced (the five value kinds)

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

`SAS_2025_ANNUAL` is the canonical serving source for 2025A/B/C in this
release. The two distinct standalone 2025B workbooks remain archive-only and
are not loaded into the serving panel because no source-authority record proves
that either supersedes the annual release. They must not be mixed or selected
by filename. The full decision and promotion checklist is in
[`docs/data/SAS_SOURCE_PRECEDENCE.md`](../data/SAS_SOURCE_PRECEDENCE.md).

Not every worksheet becomes an app feature. The inventory records all 440
worksheet instances: 134 are used by the analytical pipeline, 304 remain
unmapped/archive-only, and 2 are metadata sheets. This is an explicit scope
decision, not silent data loss; the coverage audit names the current disposition.

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
