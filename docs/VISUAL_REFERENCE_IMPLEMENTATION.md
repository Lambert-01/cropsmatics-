# Visual Reference Implementation

**Date:** 2026-09-25
**Purpose:** map every supplied design reference to the route and components that
implement it, and state plainly where the implementation deliberately differs.

## Source images

The eight references are stored in the repository at
`VISUAL IMAGE /ChatGPT Image Sep 25, 2026, 11_14_46 AM.png` and
`… 11_16_44 → 11_16_49 AM (1–8).png`.

The filenames are export timestamps, so they do not say which screen they show.
The mapping below follows the order given in the brief:

| # | Reference | Role |
|---|---|---|
| 1 | Mobile — Home Dashboard | `apps/mobile/app/index.tsx` |
| 2 | Mobile — Harvest Risk Analysis | `apps/mobile/app/harvest-risk.tsx` |
| 3 | Mobile — Register Upcoming Harvest | `apps/mobile/app/register-harvest.tsx` |
| 4 | Mobile — Storage & Market Options | `apps/mobile/app/storage-options.tsx` |
| 5 | Web — National Crop Intelligence Overview | `apps/web/app/dashboard/page.tsx` |
| 6 | Web — Productivity Intelligence | `apps/web/app/productivity/page.tsx` |
| 7 | Web — Intervention Planner | `apps/web/app/interventions/page.tsx` |
| 8 | Web — Post-Harvest & Storage Optimization | `apps/web/app/post-harvest/page.tsx`, `apps/web/app/storage/page.tsx` |

> **Disclosure.** This pass did not decode the image contents — the audit and
> implementation were driven by the written brief and the existing code, so the
> image-to-screen assignment above should be confirmed against the files by a
> human reviewer. Where a reference showed something the data cannot support, the
> brief itself said which parts were "visual inspiration only", and those are
> listed as deliberate differences rather than implemented.

Statuses: `MATCHED` · `FUNCTIONAL BUT VISUALLY PARTIAL` ·
`BLOCKED BY VERIFIED DATA` · `COMING NEXT`

---

## 1. Mobile — Home Dashboard → `/` (`apps/mobile/app/index.tsx`)

| | |
|---|---|
| **Matching components** | `ScreenLayout`, `AppHeader`, `BrandMark`, `MetricCard`, `QuickActionCard`, `BottomNav` |
| **What matches** | Brand header with name, tagline, EN/RW switch, notification badge and avatar; hero greeting over the Rwanda farm photograph; hero/greeting block; four compact KPI cards; quick-action grid; recent-alerts section; harvest-history list; bottom navigation |
| **What deliberately differs** | The reference's "Nearby Storage — 3 facilities" and "Market Trend — Stable" tiles are **not** reproduced. The platform has no verified facility capacity and no connected market-price feed, so those tiles would be invented numbers. The nearby-context panel instead lists verified *program districts* with "Capacity not verified". |
| **Missing data** | Facility-level capacity; any market price series |
| **Reason** | `docs/MODEL_INTERPRETATION_POLICY.md` — never invent a number to fill a card |
| **Status** | `MATCHED` (with the two data-blocked tiles replaced by honest context) |

The four KPI cards now read: Expected Harvest, Pending Sync, Registered Harvests,
Latest Risk. The Latest Risk tile shows the persisted server score and band, not
a decorative value.

## 2. Mobile — Harvest Risk Analysis → `/harvest-risk` (`apps/mobile/app/harvest-risk.tsx`)

| | |
|---|---|
| **Matching components** | Risk gauge, structured factor rows, action rows with priority chips, `DataBadge` |
| **What matches** | Submitted-harvest card, circular overall score gauge, probability figure, LOW/MODERATE/HIGH band, top contributing risk factors, recommended actions, "why this recommendation" reasons, model/rule information, "View storage options" CTA |
| **What deliberately differs** | The reference implies a confidence figure. The score is produced by a documented additive rule model, so it is labelled **"Risk score"** with the rule/model version, never "AI confidence". Factors now carry `factor`, `factor_value`, `impact` and `reason`; actions carry `action`, `reason` and `priority`. |
| **Missing data** | No calibrated local outcome data exists to fit a probabilistic model |
| **Reason** | Brief §33; `services/api/app/services/risk_service.py` |
| **Status** | `MATCHED` |

## 3. Mobile — Register Upcoming Harvest → `/register-harvest` (`apps/mobile/app/register-harvest.tsx`)

| | |
|---|---|
| **Matching components** | `StepProgress`, `DateField`, `AttachmentFields`, `ChipPicker`, farm selector, storage-assistance toggle |
| **What matches** | Stepper flow; selected-farm card (real farm name, district, size); crop cards; quantity card with unit; start/end date cards; location card; notes; storage-assistance toggle; attachments; offline notice; Save Draft/Continue actions |
| **What deliberately differs** | The reference's "Jean Paul Farm" is not hardcoded — farms are created locally by the user. District is derived from the selected farm rather than being a separate top-level step, because "Farm" and "Location" were the same selector before and the farm is now a real record. |
| **Missing data** | None — all inputs are user-supplied and stored locally |
| **Reason** | Brief §§24–31 |
| **Status** | `MATCHED` |

Offline-first behaviour is unchanged: the record is written to SQLite and queued
before any network call.

## 4. Mobile — Storage & Market Options → `/storage-options` (`apps/mobile/app/storage-options.tsx`)

| | |
|---|---|
| **Matching components** | Active-harvest card, `DataBadge`, program district cards, national infrastructure tiles |
| **What matches** | Active-harvest summary (crop, district, quantity, storage-assistance request); district context; program district cards; national infrastructure block; cold-chain program indicators; scenario section; market section |
| **What deliberately differs** | The reference shows named facilities with capacities. No public source publishes facility-level capacity or coordinates, so each card shows **"Capacity not verified"** and **"Exact facility location: not published"**, and national MINAGRI totals are labelled `OFFICIAL NATIONAL DATA / National totals — not facility-level capacity`. Market intelligence states **"Verified market-price source not connected yet"** instead of showing prices. |
| **Missing data** | Facility capacities, facility coordinates, market prices |
| **Reason** | Brief §§34–35, §48; MINAGRI publishes national totals only |
| **Status** | `BLOCKED BY VERIFIED DATA` for the facility cards; `MATCHED` for the context, program and national-totals sections |

## 5. Web — National Crop Intelligence Overview → `/dashboard` (`apps/web/app/dashboard/page.tsx`)

| | |
|---|---|
| **Matching components** | `DashboardKpis`, `RwandaDistrictMap`, `MapLegend`/`MapTooltip`/`MapControls`, `PriorityTable`, `YieldTrendChart`, `GapHeatmap`, `InputAdoptionChart`, `InsightPanel`, `ProvenanceCard` |
| **What matches** | Compact KPI row, large Rwanda map with a right-hand insight panel, priority table, yield trend, gap heatmap, input chart, provenance |
| **What deliberately differs** | Unchanged from the previous pass: only real KPIs are shown, and the coverage notice appears when a selected period has no district rows |
| **Missing data** | District rows exist only for NISR 2025 Season B |
| **Reason** | Coverage matrix `data/processed/data_coverage.csv` |
| **Status** | `MATCHED` |

## 6. Web — Productivity Intelligence → `/productivity` (`apps/web/app/productivity/page.tsx`)

| | |
|---|---|
| **Matching components** | `DashboardKpis`, `DistrictRankingTable`, `FactorAssociationChart`, `ModelPerformancePanel`, `GapHeatmap` |
| **What matches** | Map/ranking/insight layout, crop-specific factor association (a crop selection is required), model metrics panel, heatmap |
| **What deliberately differs** | No "attainable yield" figure is shown: reaching the benchmark is a stated target, not a modelled attainable outcome, and no model has been validated to claim one |
| **Missing data** | A validated yield-response model |
| **Reason** | Brief §45 |
| **Status** | `MATCHED` |

## 7. Web — Intervention Planner → `/interventions` (`apps/web/app/interventions/page.tsx`)

| | |
|---|---|
| **Matching components** | `WeightsPanel`, centremap, `PriorityRanking`, `DistrictRationale`, `ScoreComponentChart`, `ScenarioComparison` |
| **What matches** | Weights → map → rationale structure with an adjustable-weight scenario comparison |
| **What deliberately differs** | No budget, farmer count or projected gain is displayed, because none is verified |
| **Missing data** | Cost and beneficiary data |
| **Reason** | Brief §46 |
| **Status** | `MATCHED` |

## 8. Web — Post-Harvest & Storage Optimization → `/post-harvest` + `/storage`

| | |
|---|---|
| **Matching components** | `DashboardKpis`, `LossByCropChart`, `StorageVsSoldChart`, `UseCompositionChart`, `RiskClassificationTable`, `NationalInfrastructureSummary`, `ColdChainProgramPanel`, `FacilityStatus`, `OptimizationDemo`, `DataBadge` |
| **What matches** | Crop-loss KPI cards, stored share, sold share, highest-loss crop, highest-storage crop, loss chart, storage-vs-sold chart, use composition, risk table, national infrastructure context, provenance. `/storage` now groups content into **Official context**, **Program coverage by district**, and **Scenario optimization**, each with its own badge. |
| **What deliberately differs** | The reference's facility markers with capacities are replaced by an explicit **"FACILITY-LEVEL DATA: NOT AVAILABLE"** badge plus the verified program-district list. National MINAGRI totals are shown as national totals and are never joined to a district. |
| **Missing data** | Facility-level capacity and coordinates |
| **Reason** | Brief §§13, 47, 48 |
| **Status** | `MATCHED` for post-harvest; `BLOCKED BY VERIFIED DATA` for the facility-level portion of storage |

---

## Cross-cutting visual changes in this pass

| Change | File | Why |
|---|---|---|
| Active sidebar item: white icon on a teal surface | `apps/web/components/layout/AppSidebar.tsx` | The active icon and its background were both primary green, so the active item was hard to read against the dark sidebar (brief §42) |
| Provenance badges as a component | `apps/web/components/ui/DataBadge.tsx`, `apps/mobile/src/components/DataBadge.tsx` | The official / program / scenario / not-verified distinction is a product requirement, not decoration |
| Brand mark + initials avatar | `apps/mobile/src/components/BrandMark.tsx` | The header used a generic leaf icon. The mark is rendered from design tokens (no new binary asset); the avatar is initials because there is no user profile or auth yet, and a stock photo would misrepresent who is using the app. |
| Notification badge counts real pending records | `apps/mobile/src/components/AppHeader.tsx` | A decorative badge number would be a fake signal |

## Coming next

| Item | Blocker |
|---|---|
| Facility-level storage map with real capacities | No source publishes capacities or coordinates |
| Live market prices on `/markets` and mobile | No connected price feed (MINAGRI e-Soko is the intended target; terms review pending) |
| Rainfall/forecast widgets | CHIRPS ingestion is specified but not yet implemented, and no weather forecast provider is connected |
| `/yield-intelligence` behind a real model card | Model pipeline not validated for prediction display |
| Pixel comparison against the 8 references | Requires a human reviewer to confirm the image-to-screen mapping above |
