# Mobile Restructure Audit

Generated as part of the Cropmatics Rwanda mobile restructuring task.

---

## Current Navigation (pre-restructure)

Bottom nav tabs (BottomNav.tsx):
- Home (`/`) — farmer dashboard
- Harvest History (`/harvests`) — local SQLite harvest list
- Recommendations (`/insights`) — risk results from server
- Alerts (`/alerts`) — sync failures, approaching harvest dates, data updates
- Profile (`/profile`) — language, farm profiles, sync status, share app

Stack screens (no tab):
- `/register-harvest` — multi-step harvest wizard
- `/harvest-risk` — risk result detail
- `/storage-options` — national infrastructure + OR-Tools scenario
- `/share` — QR code / install link
- `/sync` — sync status

---

## Current Screens

| File | Purpose | Keep? |
|---|---|---|
| `app/index.tsx` | Farmer home: local harvest KPIs, risk, quick actions | Redesign as intelligence home |
| `app/harvests.tsx` | Local harvest list | Move → field-operations |
| `app/insights.tsx` | Risk results + recommendations | Move → field-operations |
| `app/alerts.tsx` | Sync/date/data alerts | Adapt → notifications concept |
| `app/profile.tsx` | Language, farms, sync, share | Adapt → more/settings |
| `app/register-harvest.tsx` | Harvest wizard | Move → field-operations |
| `app/harvest-risk.tsx` | Risk detail | Move → field-operations |
| `app/storage-options.tsx` | Storage infrastructure | Move → field-operations |
| `app/share.tsx` | QR install | Move → more |
| `app/sync.tsx` | Sync status | Move → field-operations |

---

## Reusable Components

| Component | Reusable | Notes |
|---|---|---|
| `AppHeader.tsx` | YES | Extend with HOME/DETAIL variants |
| `BottomNav.tsx` | YES | Replace items with new 5-tab nav |
| `BrandMark.tsx` | YES | Keep, extend for splash |
| `MetricCard.tsx` | YES | Keep as-is |
| `ScreenLayout.tsx` | YES | Keep, minor updates |
| `QuickActionCard.tsx` | YES | Keep for explore grid |
| `DataBadge.tsx` | YES | Keep |
| `StepProgress.tsx` | FIELD-OPS | Move with wizard |
| `AttachmentFields.tsx` | FIELD-OPS | Move with wizard |
| `DateField.tsx` | FIELD-OPS | Move with wizard |

---

## Components to Move to field-operations

- `StepProgress.tsx`
- `AttachmentFields.tsx`
- `DateField.tsx`
- All wizard step logic from `register-harvest.tsx`

---

## Components to Preserve (do not delete)

- All database code (`src/database/`)
- All sync code (`src/sync/queue.ts`)
- All existing types (`src/types/index.ts`)
- `src/constants/reference.ts` (CROPS, DISTRICTS)
- All tests (`tests/`)

---

## Missing Dependencies (need to add)

- `@expo/vector-icons` already present (Ionicons)
- No chart library — need lightweight solution (react-native-svg already present)
- No map library — need lightweight SVG choropleth (react-native-svg present)
- AsyncStorage for settings persistence — need `@react-native-async-storage/async-storage`

---

## API Endpoints Available

From `services/api/app/api/v1/`:

| Endpoint | File | Status |
|---|---|---|
| `GET /crops` | crops.py | ✅ |
| `GET /geography/districts` | geography.py | ✅ |
| `GET /geography/provinces` | geography.py | ✅ |
| `GET /meta/data-coverage` | meta.py | ✅ |
| `GET /meta/sources` | meta.py | ✅ |
| `GET /meta/data-version` | meta.py | ✅ |
| `GET /meta/models` | meta.py | ✅ |
| `GET /meta/algorithms` | meta.py | ✅ |
| `POST /assistant/query` | assistant.py | ✅ |
| `GET /analytics/*` | analytics.py | ✅ |
| `GET /maps/*` | maps.py | ✅ |
| `GET /facilities/*` | facilities.py | ✅ |
| `POST /harvests` | harvests.py | ✅ |
| `POST /risk/post-harvest` | risk.py | ✅ |

---

## API Endpoints Needed (new)

| Endpoint | Purpose |
|---|---|
| `GET /mobile/home` | Compact home summary (counts, latest period, popular questions) |
| `GET /mobile/crops/{crop}` | Single crop profile with metrics + trend |
| `GET /mobile/districts/{district}` | Single district profile |
| `POST /inquiries` | Submit information inquiry |
| `GET /inquiries/{id}` | Track inquiry status |

---

## Missing Source Data

- Rwanda district GeoJSON for choropleth map — check `data/` directory
- Crop imagery/illustrations — not present, need placeholder system

---

## Branding / Assets Status

- `assets/images/rwanda-farm-hero.png` — exists (1 image)
- No app icon configured in app.json (no `icon` field)
- No splash configured in app.json
- No adaptive icon configured
- `BrandMark.tsx` renders a leaf icon from Ionicons (no PNG/SVG logo)

---

## i18n Status

- EN: complete (all farmer-operation strings)
- RW: complete (mirrors EN)
- Missing keys needed: explore, crops, districts, indicators, maps, post-harvest, ask, saved, inquiry, more, settings, errors, empty states, data coverage

---

## Accessibility Issues

- Touch targets generally adequate (Pressable with hitSlop)
- No `accessibilityHint` on most interactive elements
- Charts: none exist yet
- Color-only risk indicators: partially addressed (icon + text + color)

---

## Current Test Coverage

- `tests/harvest.test.ts` — quantity conversion, date handling
- `tests/i18n.test.ts` — key parity, language resolution, reference lists
- `tests/schema.test.ts` — SQLite schema (assumed)
- No tests for: navigation, screens, API clients, settings, offline behavior

---

## Production Blockers

1. No app icon or splash screen configured
2. No onboarding flow
3. Primary UX is farmer data-collection, not intelligence exploration
4. No crop/district/indicator browse screens
5. No map screen
6. No Ask screen
7. No inquiry system
8. No saved items
9. No settings screen (language only in profile)
10. i18n missing keys for new screens
