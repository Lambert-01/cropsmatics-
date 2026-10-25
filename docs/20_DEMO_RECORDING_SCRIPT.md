# Cropmatics Rwanda Demo Recording Script

This script is for two short videos: a web decision-intelligence demo and a
mobile field-workflow demo. Keep both videos focused on one story:

> Official agricultural data identifies where action is needed; the mobile
> workflow helps field users act, record and follow up.

Do not try to show every page. A clear five-minute story is stronger than a
long tour of every feature.

## Video 1: Web Decision Intelligence

**Target length:** 3 to 4 minutes

**Recording setup**

- Use a clean browser window at 1440px wide if possible.
- Open `https://cropsmatics-web.vercel.app/dashboard` directly.
- Use the production API, not a local API.
- Select one crop, preferably Maize, and one published period before recording.
- Keep the browser zoom at 100% and close unrelated tabs and notifications.
- Do not show Markets, weather or any module that is failing during rehearsal.

### Shot list and narration

**0:00-0:20 — Problem and promise**

Show the dashboard title and map. Say:

> Agricultural decisions need more than a national average. Cropmatics uses
> official NISR crop data to show what is happening, where the gap is, and
> what deserves investigation.

**0:20-0:55 — National overview**

Show the KPI row, the Rwanda map and the trend panel. Select Maize and the
published period you prepared. Say:

> This overview brings the main signals together: observed yield, production,
> harvested area, district coverage and the current period. The values are
> served by the Python analytics API; the browser is only presenting them.

Point to the period/source disclosure briefly. Do not read every limitation
on screen.

**0:55-1:30 — Map to district evidence**

Click a district on the map, then open the productivity view. Show the
observed yield, benchmark and productivity gap. Say:

> The map moves from national context to a district question. A positive gap
> here means the observed yield is below the selected benchmark. It is a
> prioritisation signal, not proof of a cause.

Use the district ranking only long enough to show the comparison columns:
district, observed yield, benchmark, gap, area and production.

**1:30-2:00 — Associated factors**

Open the factors/evidence section for the selected crop. Say:

> Cropmatics separates association from causation. These factors are shown as
> relationships observed in the published district data, with sample size and
> interpretation, not as claims that one factor caused the yield outcome.

If the factor panel is empty for the selection, show the professional empty
state and say:

> When the evidence is not sufficient, the system withholds the result rather
> than filling the gap with a guess.

**2:00-2:45 — Intervention planning**

Open `/interventions`. Set a crop and period if needed. Adjust one weight,
such as the productivity gap, and show the ranking changing. Say:

> The planner turns evidence into an investigation list. The weights are
> transparent and adjustable. Districts above the benchmark are not labelled
> as productivity-shortfall priorities, and unavailable readiness or cost
> values remain unavailable rather than becoming invented zeros.

Do not claim projected yield gains, budgets, farmer counts or storage
capacity unless the page is displaying a verified value with a source.

**2:45-3:20 — Transparency and close**

Open `/transparency` or `/data-explorer` and show one source, period and
method. Say:

> Every important number can be followed from the interface to the API,
> analytical service and processed source table. Official statistics and
> voluntary operational data remain separate.

Close with:

> Cropmatics helps planners move from official evidence to a defensible next
> action, while making uncertainty visible.

## Video 2: Mobile Field Workflow

**Target length:** 3 to 4 minutes

**Recording setup**

- Use the production APK or a development build configured with
  `https://cropsmatics-api.onrender.com/api/v1`.
- Confirm the phone is online and the home screen has loaded before recording.
- Record in portrait orientation at the phone's native resolution.
- Turn on Do Not Disturb and hide personal notifications.
- Use English for the main recording; show the language switch briefly if it
  is stable enough to demonstrate.
- Keep a second take available for the offline save and later sync.

### Shot list and narration

**0:00-0:20 — Farmer-facing purpose**

Show the mobile home screen. Say:

> The mobile experience brings the same verified intelligence closer to field
> work. A user can explore crops and districts, compare evidence, ask a
> grounded question and record a harvest even when connectivity is limited.

**0:20-0:55 — Crop and district exploration**

Open Explore, then Crops. Select Maize and a published period. Open a crop
  or district detail page. Say:

> The user starts with a crop, not a spreadsheet. The period and source stay
> attached to the figures, and missing coverage is shown as unavailable.

**0:55-1:25 — Clickable map**

Open Maps, tap a district boundary, and open its detail view. Show the
district summary or crop list. Say:

> The map is an entry point, not decoration. Selecting a district opens its
> published crop and indicator context, so the user can move from geography
> to evidence with one tap.

If native map tiles are slow, use the district list as the accessible fallback
and say that the same district detail is available without the map.

**1:25-1:55 — Compare or Ask**

Open Compare and select two districts or two crops. Keep the comparison to
one question, such as observed yield or production. Alternatively open Ask
and submit:

> Which districts have the largest maize productivity gaps?

Say:

> The assistant answers from retrieved analytical results and identifies the
> period, unit and source. It does not invent a number when the published
> data cannot support the question.

**1:55-2:50 — Register a harvest**

Open Field Operations and Register Harvest. Complete the wizard with clearly
labelled demonstration values. Say:

> A field user can register an expected harvest with the farm, crop, quantity,
> dates, location and storage request. These operational records are kept
> separate from official NISR statistics.

Do not present demonstration input as an official national statistic.

**2:50-3:25 — Offline save and sync**

For the strongest mobile proof, record a second take:

1. Enable airplane mode.
2. Create and save the harvest registration.
3. Show the offline or queued status.
4. Re-enable connectivity.
5. Open Sync and show the queue resolving.

Say:

> The registration is saved locally first. When connectivity returns, the
> sync queue can send it to the backend. This keeps the field workflow useful
> in places where the network is intermittent.

Only show this if the queue completes successfully in rehearsal.

**3:25-3:45 — Close**

Say:

> The web platform helps decide where to investigate. The mobile app helps
> field users explore, record and follow up. Together they connect data to
> action without confusing observed statistics with operational reports.

## Rehearsal checklist

Before recording, verify:

- Web dashboard loads without 503 or 502 errors.
- Maize and the chosen period have published data.
- The map legend is visible and one district is clickable.
- The productivity ranking contains real rows.
- Intervention weights can be changed without an error.
- The transparency page shows sources and limitations.
- Mobile home, Explore, Maps, Compare and Ask load from the production API.
- The harvest form can be opened and saved.
- Offline save and sync work, or are removed from the final take.
- The APK has the correct production API URL.
- No fake values, unavailable forecasts or unverified capacities are shown.

## Recovery plan during recording

- If a chart fails, refresh once. If it fails again, skip it and use the
  transparency/data page rather than showing an error repeatedly.
- If a forecast is withheld, do not hide the limitation. Say that no validated
  forecast is published for the selection.
- If weather fails, omit it from the demo. It is contextual and not the core
  hackathon value proposition.
- If the mobile map is slow, use the district list and open the same detail
  page.
- If Ask returns an ungrounded response, do not use that take. Use one of the
  prepared example questions only after confirming the answer is sourced.

## Final presentation rule

The strongest demo is not the one with the most screens. It is the one where
the viewer can clearly answer four questions:

1. What agricultural problem does Cropmatics address?
2. Where did the displayed evidence come from?
3. What decision can a planner or field user make with it?
4. What does the system honestly refuse to claim?
