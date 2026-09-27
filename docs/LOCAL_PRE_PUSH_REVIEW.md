# Local Pre-Push Review

**Everything here is local. Nothing was pushed.**

- **Baseline main SHA:** `002a70f2ba6beae6920de1dedc15a261aea4821b`
- **Reviewed feature head:** `ae06f3b6d0cb70d20d3ec91217d0191913b697b1`
- **Local branch:** `mobile-intelligence-v2-local`
- **Working tree:** uncommitted (no local commits made this session)

## What was built

### Phase 1 — backend scientific + privacy corrections

* **Inquiry privacy.** Public `GET /inquiries` list and bare
  `GET /inquiries/{id}` removed. `POST /inquiries` now returns a secret
  `receipt_token` + human reference once. `GET /inquiries/{id}/status?token=`
  returns only `{id, status, created_at, updated_at}`. Wrong token == 404.
  Token compared with `hmac.compare_digest`. PII path documented as
  **DEVELOPMENT / MVP STORAGE ONLY** (JSONL), production target PostgreSQL.
* **No cross-crop mean yield.** `assistant._district_context` no longer averages
  `yield_kg_ha` across crops. It reports crop count, largest production crops,
  practice adoption and period; `cross_crop_yield_mean` is explicitly `null`.
* **Indicator aggregation policy.** Every indicator declares
  `mean | crop_required | count | specialized`. `_indicator_aggregate` refuses to
  mean-aggregate anything not declared `mean`.
* **Indicator-specific provenance.** Each indicator carries its own
  `source_id`, `source_label`, `source_period` so irrigation never cites the crop
  table.
* **Post-harvest infrastructure registry bug fixed.** The registry keyed on a
  non-existent `indicator` column; it now uses `infrastructure_type`, so the
  indicator is correctly available (national, 2024/2025).
* **`national_indicator` intent advertised** in the assistant intent registry.
* **Language rendering layer.** `app/services/assistant_language.py` renders the
  same structured evidence into `en`/`rw`; numbers/evidence identical, with a
  documented Kinyarwanda fallback status.
* **URL-safe entity routes.** `app/services/slugs.py` + `GET /crops/{slug}` and
  `GET /geography/districts/{slug}`; featured topic routes use codes.
* **New district profile endpoint** `GET /mobile/districts/{slug}` (real inputs,
  land, water, erosion; no cross-crop yield).

### Mobile intelligence experience

* 5-tab navigation (Home · Explore · Maps · Ask · More), safe-area aware.
* Onboarding (3 slides) + language selection with AsyncStorage persistence and a
  first-run gate in `_layout.tsx`.
* New Home wired to `GET /mobile/home` (coverage, summary metrics, explore grid,
  featured insights, popular questions, provenance).
* Explore hub, unified search, crop list + crop detail (4 tabs), district list +
  district detail (4 tabs), indicator catalogue, compare, post-harvest.
* Flagship SVG choropleth map (memoized GeoJSON, 5-band legend, no-data grey,
  district bottom sheet).
* Grounded Ask with evidence panel, key figures, source/period/limitations,
  unsupported state, history persistence.
* Saved items, inquiry form + receipt + private history, More/Settings/Sources/
  Methodology/About/Privacy/Help.
* Centralized API error model; React Query with sensible staleTime/retry.
* Custom SVG chart primitives (line, bar, horizontal bar, donut).
* Legacy field operations moved to `app/field-operations/`, behind
  `EXPO_PUBLIC_ENABLE_FIELD_OPERATIONS` (default false).

## Files

- Modified: 37 files, `+1881 / -657` (tracked diff).
- New untracked: 25 entries (route groups `ask/`, `explore/`, `inquiry/`,
  `maps/`, `more/`, `onboarding/`, `saved/`; components `ui.tsx`, `charts.tsx`,
  `RwandaMap.tsx`; API clients `home/indicators/maps/postharvest/sources`;
  `utils/slug.ts`; backend `assistant_language.py`, `slugs.py`; tests).
- Moved: 9 legacy screens `app/*.tsx` → `app/field-operations/*.tsx`.

## Quality gates

| Gate | Result |
|---|---|
| Mobile `tsc --noEmit` | **PASS** |
| Mobile `eslint .` | **PASS** (0 errors, 0 warnings) |
| Mobile `vitest run` | **PASS** (28 tests) |
| Mobile `expo config --type public` | **PASS** |
| API `ruff check app tests` | **PASS** |
| API `pytest tests` | **PASS** (all green, 3 skipped) |
| Web `tsc --noEmit` | **PASS** |
| Web `next lint` | **PASS** (no warnings/errors) |
| Web `vitest` | **PASS** (26 tests) |
| Web production build | NOT RUN |
| ML / data pipeline | NOT RUN this session (untouched) |
| Android local run | NOT RUN |
| Physical Android test | NOT RUN |

## Security / privacy status

* Public inquiry list endpoint removed; token-gated sanitized status only.
* No PII in logs; inquiry store is git-ignored (`data/interim/`).
* No secrets, tokens, LAN IPs or personal emails added to source.
* Device stores its own receipt token locally; the API cannot enumerate inquiries.

## Screen matrix

| Screen | Status | Real data | EN | RW | Device-tested |
|---|---|---|---|---|---|
| Splash | COMPLETE (config) | n/a | n/a | n/a | no |
| Onboarding | COMPLETE | n/a | yes | yes | no |
| Language | COMPLETE | n/a | yes | yes | no |
| Home | COMPLETE | `/mobile/home` | yes | yes | no |
| Explore | COMPLETE | dictionaries | yes | yes | no |
| Search | COMPLETE | crops/districts/indicators | yes | yes | no |
| Crops | COMPLETE | `/crops` | yes | yes | no |
| Crop Detail | COMPLETE | analytics | yes | yes | no |
| Districts | COMPLETE | `/geography/districts` | yes | yes | no |
| District Detail | COMPLETE | `/mobile/districts/{slug}` | yes | yes | no |
| Maps | COMPLETE | `/maps/district-metrics` | yes | yes | no |
| Indicators | COMPLETE | `/mobile/indicators` | yes | yes | no |
| Compare | FUNCTIONAL — visual polish | analytics | yes | yes | no |
| Post-Harvest | COMPLETE | analytics + storage | yes | yes | no |
| Ask | COMPLETE | `/assistant/query` | yes | yes | no |
| Ask History | COMPLETE | local DB | yes | yes | no |
| Saved | COMPLETE | local DB | yes | yes | no |
| Inquiry | COMPLETE | `/inquiries` | yes | yes | no |
| Inquiry History | COMPLETE | token status | yes | yes | no |
| More | COMPLETE | n/a | yes | yes | no |
| Settings | COMPLETE | n/a | yes | yes | no |
| Data Sources | COMPLETE | `/meta/sources` | yes | yes | no |
| Methodology | COMPLETE | static | yes | yes | no |
| About | COMPLETE | static | yes | yes | no |
| Privacy | COMPLETE | static | yes | yes | no |
| Help | COMPLETE | static | yes | yes | no |
| Field Operations | PARTIAL — legacy, flag-gated | legacy | yes | yes | no |

## Known limitations / blockers

1. **No device or emulator run.** Visual polish rounds, smaller-screen (360×800)
   checks, and Android screenshots were not performed. These are mandatory before
   push.
2. **Kinyarwanda intelligence strings need native review** (see
   `docs/KINYARWANDA_REVIEW.md`).
3. Location/photo Android permissions remain declared in the static manifest.
   Prompts only occur inside Field Operations, but the manifest still exposes the
   permissions globally — investigate conditional build config.
4. Compare-crops chart depends on the exact `values` key shape returned by
   `/analytics/trends?compare=`; verify against live API.
5. `offlineCacheEnabled` persists but the AsyncStorage response cache is not yet
   wired; React Query already keeps last-good data in memory.
6. Field Operations screens are legacy and only lightly smoke-tested.

## Final product test — status

The end-to-end "new user" flow (open → language → Home → search Maize → crop
profile → trend → district → map → compare → post-harvest → Ask → save →
inquiry → sources → settings) is implemented and type-checked, but **not yet
exercised on a physical device**. That remains the single blocking item before a
push decision.
