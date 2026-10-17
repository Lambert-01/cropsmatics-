"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import type { DashboardFilters } from "@/lib/filters";
import { fmtNumber } from "@/lib/format";
import { manualProjectionRequest } from "@/lib/manualProjection";
import { useManualProjection } from "@/services/hooks/useAnalytics";
import type {
  ManualProjectionRequest,
  ManualProjectionResponse,
  ProjectionBaseline,
  ProjectionCompounding,
  ProjectionMethod,
  ProjectionMetric,
} from "@/types";

/**
 * Build a projection — the *user-controlled* of the three future-looking
 * activities.
 *
 * Not a published observation, and not a validated model forecast: it is the
 * arithmetic of a stated baseline and explicit assumptions, computed in Python.
 * The badge, the copy and the export rows say so, and the projected series is
 * drawn dashed and labelled "Your projection" so it can never be read as
 * measured data.
 */

const METHODS: { id: ProjectionMethod; label: string }[] = [
  { id: "carry_forward", label: "Hold the baseline" },
  { id: "percent_change", label: "Apply a change" },
  { id: "personal", label: "Personal plan" },
];

const BASELINES: { id: ProjectionBaseline; label: string }[] = [
  { id: "latest_observed", label: "Latest observed value" },
  { id: "median_window", label: "Median of a window" },
];

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Spreadsheet formula-injection guard. A legitimate negative number must stay
  // numeric, so only non-numeric strings are prefixed.
  const numeric = /^-?\d+(\.\d+)?$/.test(text);
  const safe = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function safeFilename(response: ManualProjectionResponse): string {
  const parts = [
    response.resolved.crop,
    response.resolved.district || "national",
    response.resolved.season,
    "projection",
  ];
  return `${parts.join("-").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.csv`;
}

function downloadCsv(response: ManualProjectionResponse) {
  const header = [
    "row_kind",
    "label",
    "period_code",
    "metric",
    "value",
    "unit",
    "case",
    "source_id",
    "note",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of response.export_rows) {
    lines.push(
      [
        row.row_kind,
        row.label,
        row.period_code,
        row.metric,
        row.value,
        row.unit,
        row.case,
        row.source_id,
        row.note,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // A leading comment line keeps the assumption/observation split visible even
  // when the file is opened in a tool that hides the first column.
  const body = `# ${response.value_kind_label} — ${response.assumption_badge}. Not an official statistic.\n${lines.join("\n")}\n`;
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(response);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ManualProjectionWorkspace({ filters = {} }: { filters?: DashboardFilters }) {
  const motion = useChartMotion();
  const projection = useManualProjection();

  const crop = filters.crop ?? "";
  const district = filters.district ?? undefined;
  const season = (filters.period?.slice(-1).toUpperCase() as "A" | "B" | "C") || "B";

  const [method, setMethod] = useState<ProjectionMethod>("carry_forward");
  const [baseline, setBaseline] = useState<ProjectionBaseline>("latest_observed");
  const [horizon, setHorizon] = useState(2);
  const [metric, setMetric] = useState<ProjectionMetric>("yield_kg_ha");
  const [windowSize, setWindowSize] = useState(3);
  const [changePct, setChangePct] = useState(10);
  const [compounding, setCompounding] = useState<ProjectionCompounding>("once");
  const [assumedYield, setAssumedYield] = useState(1500);
  const [assumedArea, setAssumedArea] = useState(1);

  const submitted = projection.data;

  const request = useMemo<ManualProjectionRequest>(
    () =>
      manualProjectionRequest({
        crop,
        district,
        season,
        method,
        baseline,
        horizon,
        metric,
        windowSize,
        changePct,
        compounding,
        assumedYield,
        assumedArea,
      }),
    [
      crop, district, season, horizon, metric, method, baseline, windowSize,
      changePct, compounding, assumedYield, assumedArea,
    ],
  );

  const valid =
    Boolean(crop) &&
    (method !== "personal" || (assumedYield > 0 && assumedArea > 0)) &&
    (method !== "percent_change" || Number.isFinite(changePct));

  const chartData = useMemo(() => {
    const result = submitted;
    if (!result) return [];
    const byPeriod = new Map<
      string,
      { period: string; observed: number | null; projection: number | null }
    >();
    for (const obs of result.baseline_observations) {
      byPeriod.set(obs.period_code, {
        period: obs.period_label || obs.period_code,
        observed: obs.value,
        projection: null,
      });
    }
    const main = result.cases[0];
    if (main) {
      const originCode = result.resolved.origin_period;
      const anchor = byPeriod.get(originCode);
      if (anchor) anchor.projection = result.baseline_value;
      else
        byPeriod.set(originCode, {
          period: result.resolved.origin_label || originCode,
          observed: null,
          projection: result.baseline_value,
        });
      for (const point of main.points) {
        byPeriod.set(point.period_code, {
          period: point.period_label || point.period_code,
          observed: null,
          projection: point.value,
        });
      }
    }
    return [...byPeriod.values()];
  }, [submitted]);

  if (!crop) {
    return (
      <EmptyState
        title="Choose a crop to build a projection"
        hint="A projection needs one crop. Select one in the filters above, then set your assumptions here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Build a projection"
          subtitle="Planning only. Based on your assumptions — not an official statistic and not a validated forecast."
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Method">
            <select className={INPUT} value={method} onChange={(e) => setMethod(e.target.value as ProjectionMethod)}>
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
          {method !== "personal" ? (
            <Field label="Baseline">
              <select className={INPUT} value={baseline} onChange={(e) => setBaseline(e.target.value as ProjectionBaseline)}>
                {BASELINES.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </Field>
          ) : null}
          {method !== "personal" ? (
            <Field label="Metric">
              <select className={INPUT} value={metric} onChange={(e) => setMetric(e.target.value as ProjectionMetric)}>
                <option value="yield_kg_ha">Yield (kg/ha)</option>
                <option value="production_mt">Production (metric tonnes)</option>
              </select>
            </Field>
          ) : null}
          <Field label="Horizon (same-season steps)">
            <select className={INPUT} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          {method === "percent_change" ? (
            <>
              <Field label="Assumed change (%)">
                <input type="number" step={1} className={INPUT} value={changePct}
                  onChange={(e) => setChangePct(Number(e.target.value))} />
              </Field>
              <Field label="Applied">
                <select className={INPUT} value={compounding} onChange={(e) => setCompounding(e.target.value as ProjectionCompounding)}>
                  <option value="once">Once (level shift)</option>
                  <option value="per_step">Compounded per step</option>
                </select>
              </Field>
            </>
          ) : null}
          {baseline === "median_window" && method !== "personal" ? (
            <Field label="Window (observations)">
              <select className={INPUT} value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
          ) : null}
          {method === "personal" ? (
            <>
              <Field label="Your assumed yield (kg/ha)">
                <input type="number" min={1} className={INPUT} value={assumedYield}
                  onChange={(e) => setAssumedYield(Number(e.target.value))} />
              </Field>
              <Field label="Your assumed area (ha)">
                <input type="number" min={0.01} step={0.01} className={INPUT} value={assumedArea}
                  onChange={(e) => setAssumedArea(Number(e.target.value))} />
              </Field>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-forest/10 p-4">
          <button
            type="button"
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!valid || projection.isPending}
            onClick={() => projection.mutate(request)}
          >
            {projection.isPending ? "Calculating…" : "Calculate"}
          </button>
          <button
            type="button"
            className="rounded-md border border-forest/20 px-4 py-2 text-sm"
            onClick={() => {
              setMethod("carry_forward");
              setBaseline("latest_observed");
              setHorizon(2);
              setMetric("yield_kg_ha");
              setChangePct(10);
              setCompounding("once");
              projection.reset();
            }}
          >
            Reset
          </button>
          {submitted ? (
            <button
              type="button"
              className="rounded-md border border-forest/20 px-4 py-2 text-sm"
              onClick={() => downloadCsv(submitted)}
            >
              Export CSV
            </button>
          ) : null}
          <span className="rounded-full bg-amber/10 px-2 py-1 text-xs font-medium text-amber">
            Your assumptions
          </span>
        </div>
      </Card>

      {projection.error ? (
        <ErrorState
          message={
            "This projection could not be calculated. " +
            (projection.error instanceof Error ? projection.error.message : "Check the selected scope and assumptions.")
          }
          onRetry={() => projection.mutate(request)}
        />
      ) : null}

      {submitted ? (
        <Card>
          <CardHeader
            title={`${submitted.resolved.crop} · ${submitted.resolved.district || submitted.resolved.geography} · ${submitted.resolved.season}-season`}
            subtitle={`${submitted.method_label}. ${submitted.baseline_note ?? ""}`}
          />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis dataKey="period" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} width={72} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value, name) => [
                    value === null || value === undefined ? "—" : fmtNumber(Number(value), 1),
                    name === "observed" ? "Observed" : "Your projection",
                  ]}
                />
                <Legend
                  formatter={(value: string) => (value === "observed" ? "Observed" : "Your projection")}
                />
                <Line
                  type="monotone"
                  dataKey="observed"
                  stroke={CHART.primary}
                  dot
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={motion.isAnimationActive}
                />
                <Line
                  type="monotone"
                  dataKey="projection"
                  stroke={CHART.amber}
                  strokeDasharray="6 4"
                  dot
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={motion.isAnimationActive}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-slate-600">
              Solid is observed. Dashed is your projection. Unit: {submitted.units}.
            </p>

            {submitted.warnings.length ? (
              <ul className="mt-3 space-y-1 text-xs text-amber">
                {submitted.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            <details className="mt-3 border-t border-forest/10 pt-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-forest">Details</summary>
              <div className="mt-3 space-y-2">
                <p>{submitted.method_note}</p>
                <p>
                  Baseline: <strong>{submitted.baseline_label.toLowerCase()}</strong>
                  {submitted.baseline_is_assumption ? " (your assumption)" : ""} —{" "}
                  {fmtNumber(submitted.baseline_value, 2)} {submitted.baseline_unit}
                  {submitted.baseline_note ? ` (${submitted.baseline_note})` : ""}.
                </p>
                {submitted.baseline_observations.length ? (
                  <p>
                    Observed baseline from{" "}
                    {submitted.baseline_observations
                      .map((o) => `${o.period_label}${o.source_id ? ` [${o.source_id}]` : ""}`)
                      .join(", ")}
                    .
                  </p>
                ) : null}
                <p>
                  Dataset version {submitted.dataset_version ?? "unknown"} · method v
                  {submitted.methodology_version}.
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  {submitted.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

const INPUT = "w-full rounded-md border border-forest/20 bg-white px-2 py-1.5 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
