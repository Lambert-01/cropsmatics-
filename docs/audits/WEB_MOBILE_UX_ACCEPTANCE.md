# Web and Mobile UX Acceptance

Reviewed: 2026-10-28. This document separates automated evidence from human and
physical-device evidence.

## Automated evidence available

- Web component suite: 445 tests passed in 31 files.
- Mobile component suite: 354 tests passed in 29 files.
- Existing Playwright route checks: 16/16 passed at desktop and mobile-web
  sample sizes.
- Existing axe scan: zero serious/critical findings on ten key routes.
- Mobile-web map check: 30 labelled focusable district controls observed at
  390x844.

The repository's `docs/submission/UX_VERIFICATION.md` contains the detailed
matrix and records the limits of those checks. Automated component tests do not
prove that an APK works on hardware.

## Route acceptance matrix

| Route | Primary acceptance | Current evidence | Status |
|---|---|---|---|
| `/dashboard` | map, key findings, ranking and trend remain readable | browser/unit coverage | PASS automated |
| `/productivity` | crop-specific district comparison and source disclosure | unit/browser coverage | PASS automated |
| `/yield-intelligence` | manual planning is separate from withheld forecast | unit/browser coverage | PASS automated |
| `/interventions` | eligibility and component rationale are visible | unit/browser coverage | PASS automated |
| `/post-harvest` | period and crop scope remain visible | component coverage | PASS automated |
| `/storage` | missing capacity is shown as unavailable | component/API coverage | PASS automated |
| `/maps` | districts are clickable and keyboard-labelled | 30 map controls at 390x844 | PASS automated |
| `/transparency` | source and quality warnings are discoverable | axe/browser coverage | PASS automated |
| `/assistant` | grounded answer/fallback states are distinct | component/API coverage | PASS automated |
| `/install` | public APK route redirects to artifact | route check | PASS download only |
| Native Android | map, Compare, Ask, harvest, offline sync | no device available in this run | NOT VERIFIED |
| Kinyarwanda | native-speaker wording review | reviewer not available | BLOCKED |

## Required final QA before submission

1. Inspect screenshots at 390x844, 768x1024, 1440x900 and 1920x1080 with
   populated data and with empty/error/partial-coverage states.
2. Run keyboard-only navigation, drawer focus restoration and chart/table
   resizing checks.
3. Install the exact release APK on a physical Android device and test map
   selection, Compare, Ask, harvest registration, offline restart and sync.
4. Have a fluent Kinyarwanda reviewer approve the visible translations.

These are release evidence tasks, not tasks that should be marked complete from
unit tests alone.
