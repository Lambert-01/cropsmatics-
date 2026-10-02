# Mobile Information Architecture

Cropmatics Mobile is a **public agricultural intelligence** app, not a farm
registration app. Field Operations is preserved but secondary and feature-flagged
off by default.

## Primary navigation

Bottom navigation (safe-area aware): **Home · Explore · Maps · Ask · More**.

| Tab | Icon | Route |
|---|---|---|
| Home | `home-outline` | `/` |
| Explore | `compass-outline` | `/explore` |
| Maps | `map-outline` | `/maps` |
| Ask | `chatbubble-ellipses-outline` | `/ask` |
| More | `grid-outline` | `/more` |

Active state = Cropmatics green pill + icon + stronger label. Inactive = slate.
Field Operations never appears in the primary navigation.

## Route tree

```
app/
├── _layout.tsx              # QueryClient, safe area, onboarding gate
├── index.tsx                # Home (intelligence)
├── onboarding/
│   ├── index.tsx            # 3-slide first-run sequence
│   └── language.tsx         # EN / RW large cards
├── explore/
│   ├── index.tsx            # discovery hub
│   ├── search.tsx           # unified search (crops/districts/indicators)
│   ├── crops.tsx            # crop list + category filter
│   ├── crop/[cropCode].tsx  # Overview | Trends | Districts | Post-harvest
│   ├── districts.tsx        # district list + province filter
│   ├── district/[districtCode].tsx  # Overview | Crops | Inputs | Land & Water
│   ├── indicators.tsx       # category cards + indicator detail
│   ├── compare.tsx          # crops (2-5) / districts (2-4)
│   └── post-harvest.tsx     # use-of-production + national context
├── maps/
│   ├── index.tsx            # SVG choropleth + legend + selection
│   └── district/[districtCode].tsx
├── ask/
│   ├── index.tsx            # grounded Ask composer + evidence panel
│   └── history.tsx
├── saved/index.tsx
├── inquiry/
│   ├── new.tsx
│   ├── success.tsx
│   └── history.tsx
├── more/
│   ├── index.tsx
│   ├── settings.tsx
│   ├── data-sources.tsx
│   ├── methodology.tsx
│   ├── about.tsx
│   ├── privacy.tsx
│   └── help.tsx
└── field-operations/        # legacy, feature-flagged
    ├── index.tsx  ├── harvests.tsx  ├── register-harvest.tsx
    ├── harvest-risk.tsx  ├── insights.tsx  ├── storage-options.tsx
    ├── sync.tsx  ├── alerts.tsx  ├── profile.tsx  └── share.tsx
```

## First-run flow

```
hydrate preferences (AsyncStorage)
  -> hasCompletedOnboarding? -> Home
  -> else -> /onboarding -> /onboarding/language -> Home
```

Persisted keys: `cropmatics.language`, `cropmatics.hasCompletedOnboarding`,
`cropmatics.settings`.

## URL-safe entities

Routes never contain a raw name. Crops use `crop_code` (`CROP-POT`) or a slug
(`irish-potato`); districts use `district_code` (`RW-NO-RUL`) or a slug. Helpers:
`apps/mobile/src/utils/slug.ts` mirrors `services/api/app/services/slugs.py`.

## Data-to-UI matrix

See `docs/MOBILE_DATA_TO_UI_MATRIX.md`.

## Kinyarwanda

See `docs/KINYARWANDA_REVIEW.md`.
