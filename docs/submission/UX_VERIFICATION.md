# UX Verification Matrix

Status: **mostly NOT RUN**. This file is deliberately honest about what has and
has not been observed. A screenshot captured automatically is evidence *captured*,
not owner-approved design; the `Reviewer` and `Approved` columns are reserved for
a real human.

## How to read this

| Status | Meaning |
|---|---|
| **PASS** | observed here, in the stated environment |
| **FAIL** | observed a defect |
| **BLOCKED** | could not be attempted (missing device / access / data) |
| **NOT RUN** | not attempted |

Three test classes are kept separate and never substituted for one another:

1. **Rendered unit/component tests** — the web suite (vitest) and mobile tests.
2. **Browser matrix** — Playwright / a real browser at a real viewport.
3. **Physical device** — a real Android build on real hardware.

A passing component test is **not** a browser pass, and a mobile-web screenshot is
**not** a native pass.

## Latest local audit, 2026-10-17

The latest follow-up observed the ordinary Planning calculation at 1440x900,
1920x1080, 768x1024 and 390x844 without horizontal overflow or uncaught page
errors. Desktop Python CSV download, outdated-result warning and a full
three-step plan-link restoration passed. All four Dashboard source disclosures
were expanded after requests settled at each size; document width matched the
viewport. This repairs the earlier 1624 px overflow at a 1440 px viewport.

These are sampled local browser checks against the production web build with
requests redirected to the local file-mode API, not production verification,
the full route/state/language matrix or owner-approved screenshots. Temporary
evidence is outside the repository; no approved screenshot bundle is claimed.

Fresh mobile `npm ci` in an isolated directory passed typecheck, lint and Expo
configuration in the earlier pass. Latest mobile has 347 passing tests and a
passing typecheck after the sync/auth changes. Neither is a native-device check.

## Earlier implementation-session checks

| Route / target | Environment | Check | Result |
|---|---|---|---|
| `apps/web` (whole app) | Node 20, CI-style | `tsc --noEmit` | **PASS** |
| `apps/web` (whole app) | Node 20 | `next lint` | **PASS** |
| `apps/web` (whole app) | Node 20, vitest | 392 component/unit tests | **PASS** |
| `apps/web` (whole app) | Node 20 | `next build` (with API base URL set) | **PASS** |
| API (whole suite) | Python 3.11, no DB | 717 passed, 27 skipped | **PASS** |

Skipped (not failures): PostGIS integration tests, which require an explicit
`CANONICAL_TEST_DATABASE_URL` (CI provides an isolated `postgis/postgis:16-3.4` container).

## Browser matrix

The brief's required rows. Sampled audit results are recorded below; other rows
remain unverified. Attach portable evidence and obtain actual reviewer sign-off.

| Route | Viewport | Language | State | Task | Expected | Observed | Status |
|---|---|---|---|---|---|---|---|
| `/dashboard` | 1440×900 | EN | normal | read headline + map | latest district snapshot named; history separate | — | NOT RUN |
| `/dashboard` | all four required sizes | EN | all four sources expanded | confirm no horizontal overflow | document fits viewport | widths 1440/1920/768/390 match viewport | PASS (sample) |
| `/interventions` | 1440×900 | EN | Nyagatare maize 2026B | inspect eligibility | "no yield shortfall" for productivity support | — | NOT RUN |
| `/yield-intelligence` | 1440×900 | EN | forecast withheld | build a projection | projection calculated and labelled "Your assumptions" | ordinary carry-forward calculation and CSV download | PASS (sample) |
| `/yield-intelligence` | 390×844 | EN | narrow | planning form usable | controls reachable, no overlap | ordinary carry-forward calculated; no document overflow | PASS (sample) |
| `/maps` | 1920×1080 | EN | crop+metric change | legend semantics | legend explains the metric, not just endpoints | — | NOT RUN |
| `/reports` | 1440×900 | EN | district selected | download | export honours the selected scope | — | NOT RUN |
| `/data-explorer` | 1440×900 | EN | multi-period dataset | filter + export | full filtered result downloads, not just the page | — | NOT RUN |
| `/transparency` | 1440×900 | EN | warnings present | quality register | warnings discoverable, not hidden | — | NOT RUN |
| `/settings` | 1440×900 | EN | toggle sources | effect observable | disclosure expands/collapses | — | NOT RUN |
| `/install` | 390×844 | EN | fresh visitor | download APK | real approved artifact | — | BLOCKED (no built APK) |
| any | 768×1024 | RW | — | Kinyarwanda review | native-approved wording | — | BLOCKED (no reviewer) |

Cross-cutting checks still outstanding: page-level overflow with sources expanded,
menu/drawer focus order, chart resizing, filter propagation, deep links, table
pagination, downloaded file contents, and keyboard-only journeys.

## Physical device — NOT RUN

Required native tasks: map selection, Compare, Ask, harvest registration,
reconnect-and-sync. Record the actual model, OS, APK build id and network when
these are performed. **No behaviour may be marked PASS here because a mocked
component test succeeded.**

| Task | Device | OS | APK build | Network | Result |
|---|---|---|---|---|---|
| map district selection | — | — | — | — | NOT RUN |
| Compare two districts | — | — | — | — | NOT RUN |
| Ask a supported question | — | — | — | — | NOT RUN |
| register a harvest offline | — | — | — | — | NOT RUN |
| reconnect and sync | — | — | — | — | NOT RUN |

## Accessibility and language — NOT RUN

Automated accessibility checks, the manual keyboard journey, focus restoration after
drawers close, and native-speaker Kinyarwanda review are all outstanding. Dictionary
key parity does not prove translation; a phrase is not "reviewed" because AI
generated a plausible rendering. See `docs/KINYARWANDA_REVIEW.md`.
