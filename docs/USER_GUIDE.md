# Cropmatics User Guide

Cropmatics helps a planner move from a published observation to a transparent
question for investigation.

## Web workflow

1. Open **Overview** and choose a published period or keep the full period
   timeline. The scope line tells you whether the figures are national or
   district-level.
2. Select a crop and district to inspect observed yield, benchmark, gap,
   harvested area and production. Click map districts or the ranking table.
3. Open **Productivity** for district comparison and associated factors. The
   wording is intentionally "associated with", not "caused by".
4. Open **Interventions** to adjust transparent weights and see which positive
   productivity shortfalls deserve investigation. Missing readiness or cost
   values stay unavailable.
5. Open **Crops**, **Post-Harvest**, **Storage**, **Reports** or **Data Explorer**
   for the focused question rather than adding every chart to Overview.
6. Open **Data and Models** to inspect coverage, source identity, limitations
   and model availability.
7. Use **Ask** for natural-language questions. Answers are grounded in the
   analytics API and include the source, period, unit and limitations.

## Fertilizer insight

The Dashboard and Productivity pages include **Fertilizer supply channels**.
It is national context, so the card remains labelled national-only even when a
district is selected. For district-level fertilizer-source shares, use
Productivity practice indicators, Reports or Data Explorer and select the
`fertilizer_source_district` domain.

## Mobile workflow

The Expo app uses five primary areas: Home, Explore, Maps, Ask and More.

- Home summarizes selected crop and published context.
- Explore opens crops, districts, indicators, comparisons and post-harvest use.
- Maps allows district selection and opens district detail.
- Ask uses the same grounded API evidence as the web assistant.
- Field Operations can register harvest information locally when enabled. The
  record stays on the device until synchronization is available.

Mobile data is operational input, not a replacement for official NISR data.
Android installation requires downloading the APK and approving installation;
Android does not allow a browser to install an APK silently.

## Reading missing data

An empty result can mean the selected release did not publish that crop or
indicator. It does not mean zero. Season C has a narrower crop set, and some
practice, storage and forecast indicators have different coverage from the
productivity panel.

Forecasts, prices and unverified storage capacity are shown as unavailable
when their evidence requirements are not met. The product never substitutes a
realistic-looking number to make a chart complete.
