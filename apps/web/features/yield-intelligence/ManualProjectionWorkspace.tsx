"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import { api } from "@/lib/api";
import type { DashboardFilters } from "@/lib/filters";
import { fmtNumber } from "@/lib/format";
import {
  isStalePlan,
  manualProjectionRequest,
  nextSameSeasonCodes,
  parsePlan,
  serializePlan,
  type ManualProjectionForm,
} from "@/lib/manualProjection";
import { useManualProjection, useProjectionOrigins } from "@/services/hooks/useAnalytics";
import type {
  ManualProjectionRequest,
  ProjectionBaseline,
  ProjectionCompounding,
  ProjectionCase,
  ProjectionMethod,
  ProjectionMetric,
} from "@/types";

/**
 * Plan next season — the *user-controlled* of the three future-looking
 * activities.
 *
 * Not a published observation, and not a validated model forecast: it is the
 * arithmetic of a stated baseline and explicit assumptions, computed in Python.
 * The badge, the copy and the export rows say so, and the projected series is
 * drawn dashed and labelled "Your projection" so it can never be read as
 * measured data.
 *
 * The workspace also refuses three classes of silent drift: it only offers
 * origins the calculation would accept (from the panel's real coverage),
 * it marks a result outdated the moment an input changes, and it restores a
 * shared plan only after validating it — an unknown plan version or an
 * out-of-range assumption is reported, never coerced.
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

type Notice = { kind: "restored" | "error" | "info"; message: string };

export function ManualProjectionWorkspace({ filters = {} }: { filters?: DashboardFilters }) {
  const motion = useChartMotion();
  const projection = useManualProjection();
  const searchParams = useSearchParams();
  const pathname = usePathname();

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
  const [originPeriod, setOriginPeriod] = useState("");
  const [showCases, setShowCases] = useState(false);
  const [caseLower, setCaseLower] = useState(5);
  const [caseHigher, setCaseHigher] = useState(15);

  const submitted = projection.data;
  /** The exact request that produced the displayed result — the export and the
   *  outdated check both work from this, never from today's form. */
  const [calculatedRequest, setCalculatedRequest] = useState<ManualProjectionRequest | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const planParam = searchParams.get("plan");
  const appliedPlanRef = useRef<string | null>(null);

  const origins = useProjectionOrigins({
    crop,
    district,
    season,
    metric: method === "personal" ? "production_mt" : metric,
    method,
  });

  const bandsRequested = method === "percent_change" && showCases;
  const bandsOrdered = caseLower <= changePct && changePct <= caseHigher;
  const cases = useMemo<ProjectionCase[] | null>(
    () =>
      bandsRequested
        ? [
            { label: "lower", change_pct: caseLower },
            { label: "main", change_pct: changePct },
            { label: "higher", change_pct: caseHigher },
          ]
        : null,
    [bandsRequested, caseLower, caseHigher, changePct],
  );

  const form = useMemo<ManualProjectionForm>(
    () => ({
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
      originPeriod: originPeriod || null,
      cases,
    }),
    [
      crop, district, season, method, baseline, horizon, metric, windowSize,
      changePct, compounding, assumedYield, assumedArea, originPeriod, cases,
    ],
  );
  const request = useMemo(() => manualProjectionRequest(form), [form]);

  const valid =
    Boolean(crop) &&
    (method !== "personal" || (assumedYield > 0 && assumedArea > 0)) &&
    (method !== "percent_change" || Number.isFinite(changePct)) &&
    (!bandsRequested || bandsOrdered);

  /** True the moment the form differs from what Python last computed. */
  const outdated = isStalePlan(calculatedRequest, request);

  const shareHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("plan", serializePlan(form));
    return `${pathname}?${params.toString()}`;
  }, [searchParams, pathname, form]);

  const targetPeriods = useMemo(() => {
    const start = originPeriod || origins.data?.origins.at(-1)?.period_code || "";
    return nextSameSeasonCodes(start, horizon);
  }, [originPeriod, origins.data, horizon]);

  // Restore a shared plan exactly once per distinct `?plan=` value. A plan the
  // build cannot read is reported and applied not at all.
  useEffect(() => {
    if (!planParam || appliedPlanRef.current === planParam) return;
    appliedPlanRef.current = planParam;
    const restored = parsePlan(planParam);
    if (!restored.ok) {
      setNotice({ kind: "error", message: restored.error });
      return;
    }
    const f = restored.form;
    setMethod(f.method);
    setBaseline(f.baseline);
    setHorizon(f.horizon);
    setMetric(f.metric);
    setWindowSize(f.windowSize ?? 3);
    setChangePct(f.changePct ?? 10);
    setCompounding(f.compounding ?? "once");
    setAssumedYield(f.assumedYield ?? 1500);
    setAssumedArea(f.assumedArea ?? 1);
    setOriginPeriod(f.originPeriod ?? "");
    const plannedCases = f.cases ?? [];
    const lower = plannedCases.find((c) => c.label === "lower")?.change_pct;
    const main = plannedCases.find((c) => c.label === "main")?.change_pct;
    const higher = plannedCases.find((c) => c.label === "higher")?.change_pct;
    setShowCases(plannedCases.length > 0);
    if (lower !== undefined) setCaseLower(lower);
    if (higher !== undefined) setCaseHigher(higher);
    if (main !== undefined) setChangePct(main);
    const mismatch =
      f.crop !== crop || (f.district ?? null) !== (district ?? null) || f.season !== season;
    const linkScope = `${f.crop}${f.district ? ` · ${f.district}` : ""} · ${f.season}-season`;
    const pageScope = `${crop}${district ? ` · ${district}` : ""} · ${season}-season`;
    setNotice({
      kind: "restored",
      message: mismatch
        ? `Plan restored from the link — it was built for ${linkScope}, but the page selection is ${pageScope}. Match the selection in the filters above before calculating.`
        : "Plan restored from the link. Review the assumptions, then press Calculate.",
    });
  }, [planParam, crop, district, season]);

  // A chosen origin that the current selection no longer observes would only
  // fail on calculate: drop back to the default and say so, once.
  useEffect(() => {
    const options = origins.data?.origins;
    if (!originPeriod || !options) return;
    if (options.some((option) => option.period_code === originPeriod)) return;
    setOriginPeriod("");
    setNotice({
      kind: "info",
      message: `The origin ${originPeriod} has no observation for the current selection, so the plan now starts from the latest observed season.`,
    });
  }, [origins.data, originPeriod]);

  const chartData = useMemo(() => {
    const result = submitted;
    if (!result) return [];
    type Row = {
      period: string;
      observed: number | null;
      projection: number | null;
      lower: number | null;
      higher: number | null;
    };
    const byPeriod = new Map<string, Row>();
    const row = (code: string, label: string): Row => {
      const existing = byPeriod.get(code);
      if (existing) return existing;
      const fresh: Row = {
        period: label || code,
        observed: null,
        projection: null,
        lower: null,
        higher: null,
      };
      byPeriod.set(code, fresh);
      return fresh;
    };
    for (const obs of result.baseline_observations) {
      row(obs.period_code, obs.period_label || obs.period_code).observed = obs.value;
    }
    const mainCase = result.cases.find((c) => c.label === "main") ?? result.cases[0];
    if (mainCase) {
      const originCode = result.resolved.origin_period;
      row(originCode, result.resolved.origin_label || originCode).projection = result.baseline_value;
      for (const point of mainCase.points) {
        row(point.period_code, point.period_label || point.period_code).projection = point.value;
      }
    }
    for (const band of ["lower", "higher"] as const) {
      const found = result.cases.find((c) => c.label === band);
      for (const point of found?.points ?? []) {
        row(point.period_code, point.period_label || point.period_code)[band] = point.value;
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

  const hasBands = submitted
    ? submitted.cases.some((c) => c.label === "lower" || c.label === "higher")
    : false;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Plan next season"
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
          <Field label="Origin (start season)">
            <select className={INPUT} value={originPeriod} onChange={(e) => setOriginPeriod(e.target.value)}>
              <option value="">Latest observed (default)</option>
              {(origins.data?.origins ?? []).map((option) => (
                <option key={option.period_code} value={option.period_code}>
                  {option.period_label || option.period_code}
                  {option.kind === "assumed"
                    ? " (assumed)"
                    : option.value != null
                      ? ` — ${fmtNumber(option.value, 1)}${option.unit ? ` ${option.unit}` : ""}`
                      : ""}
                </option>
              ))}
            </select>
            {origins.isPending ? (
              <span className="block text-xs text-slate-500">Loading available origins…</span>
            ) : null}
            {origins.error ? (
              <span className="block text-xs text-red-600">
                The origin list could not be loaded; Calculate will validate the origin instead.
              </span>
            ) : null}
            {origins.data && origins.data.origins.length === 0 && origins.data.note ? (
              <span className="block text-xs text-slate-500">{origins.data.note}</span>
            ) : null}
          </Field>
          <Field label="Horizon (same-season steps)">
            <select className={INPUT} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <div className="block min-w-0 space-y-1">
            <span className="block text-xs font-medium text-slate-600">Planning target</span>
            <div
              className="rounded-md border border-forest/15 bg-slate-50 px-2 py-1.5 text-sm text-slate-700"
              title="Same-season periods this plan will project, from the chosen origin"
            >
              {targetPeriods.length ? targetPeriods.join(", ") : "—"}
            </div>
          </div>
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
              <Field label="Assumption bands">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showCases}
                    onChange={(e) => setShowCases(e.target.checked)}
                  />
                  Show lower &amp; higher cases
                </label>
              </Field>
              {showCases ? (
                <>
                  <Field label="Lower change (%)">
                    <input type="number" step={1} className={INPUT} value={caseLower}
                      onChange={(e) => setCaseLower(Number(e.target.value))} />
                  </Field>
                  <Field label="Higher change (%)">
                    <input type="number" step={1} className={INPUT} value={caseHigher}
                      onChange={(e) => setCaseHigher(Number(e.target.value))} />
                  </Field>
                </>
              ) : null}
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
          {bandsRequested && !bandsOrdered ? (
            <p className="text-xs text-red-600 sm:col-span-2 lg:col-span-4">
              The lower band must not exceed your assumed change ({changePct}%), and your assumed
              change must not exceed the higher band ({caseHigher}%). Calculate stays disabled until
              the bands are ordered — no band is silently dropped.
            </p>
          ) : null}
          {bandsRequested && bandsOrdered ? (
            <p className="text-xs text-slate-600 sm:col-span-2 lg:col-span-4">
              Your assumed change ({changePct}%) is the main case; lower and higher frame the band
              around it.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-forest/10 p-4">
          <button
            type="button"
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!valid || projection.isPending}
            onClick={() =>
              projection.mutate(request, {
                onSuccess: (_data, variables) => setCalculatedRequest(variables),
              })
            }
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
              setWindowSize(3);
              setChangePct(10);
              setCompounding("once");
              setAssumedYield(1500);
              setAssumedArea(1);
              setOriginPeriod("");
              setShowCases(false);
              setCaseLower(5);
              setCaseHigher(15);
              setCalculatedRequest(null);
              setNotice(null);
              setExportError(null);
              projection.reset();
            }}
          >
            Reset
          </button>
          {submitted ? (
            <button
              type="button"
              className="rounded-md border border-forest/20 px-4 py-2 text-sm disabled:opacity-50"
              disabled={exporting}
              onClick={() => {
                void exportCsv();
              }}
            >
              {exporting ? "Preparing…" : "Export CSV"}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-forest/20 px-4 py-2 text-sm"
            onClick={() => {
              void copyShareLink();
            }}
          >
            {copied ? "Copied!" : "Copy plan link"}
          </button>
          <a
            className="rounded-md border border-forest/20 px-4 py-2 text-sm text-forest"
            href={shareHref}
            title="Opens this plan as a shareable URL"
          >
            Open plan link
          </a>
          <span className="rounded-full bg-amber/10 px-2 py-1 text-xs font-medium text-amber">
            Your assumptions
          </span>
          {exportError ? (
            <span className="text-xs text-red-600" role="alert">{exportError}</span>
          ) : null}
        </div>
      </Card>

      {notice ? (
        <div
          role="status"
          className={
            notice.kind === "error"
              ? "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              : "rounded-md border border-forest/15 bg-forest/5 p-3 text-sm text-slate-700"
          }
        >
          {notice.message}
        </div>
      ) : null}

      {projection.error ? (
        <ErrorState
          message={
            "This projection could not be calculated. " +
            (projection.error instanceof Error ? projection.error.message : "Check the selected scope and assumptions.")
          }
          onRetry={() => projection.mutate(request)}
        />
      ) : null}

      {outdated ? (
        <div role="status" className="rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">
          Inputs changed since this result was calculated. Press Calculate to refresh — the result
          below still shows the previous inputs.
        </div>
      ) : null}

      {submitted ? (
        <Card>
          <CardHeader
            title={`${submitted.resolved.crop} · ${submitted.resolved.district || submitted.resolved.geography} · ${submitted.resolved.season}-season`}
            subtitle={`${submitted.method_label}. ${submitted.baseline_note ?? ""}`}
            action={
              outdated ? (
                <span className="rounded-full bg-amber/10 px-2 py-1 text-xs font-medium text-amber">
                  Outdated
                </span>
              ) : null
            }
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
                    name === "observed"
                      ? "Observed"
                      : name === "lower"
                        ? "Lower assumption"
                        : name === "higher"
                          ? "Higher assumption"
                          : "Your projection",
                  ]}
                />
                <Legend
                  formatter={(value: string) =>
                    value === "observed"
                      ? "Observed"
                      : value === "lower"
                        ? "Lower assumption"
                        : value === "higher"
                          ? "Higher assumption"
                          : "Your projection"
                  }
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
                {hasBands ? (
                  <Line
                    type="monotone"
                    dataKey="lower"
                    stroke={CHART.amber}
                    strokeDasharray="2 4"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={motion.isAnimationActive}
                  />
                ) : null}
                {hasBands ? (
                  <Line
                    type="monotone"
                    dataKey="higher"
                    stroke={CHART.amber}
                    strokeDasharray="10 4"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={motion.isAnimationActive}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-slate-600">
              Solid is observed. Dashed is your projection
              {hasBands ? "; the dotted lines are your lower and higher assumption bands" : ""}.
              Unit: {submitted.units}.
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

  /** The export downloads what is on screen — the calculated request, not the
   *  form as it stands now — as a Python-generated file named by calculation id. */
  async function exportCsv(): Promise<void> {
    if (!calculatedRequest) return;
    setExporting(true);
    setExportError(null);
    try {
      await api.manualProjectionCsv(calculatedRequest);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "The CSV export could not be downloaded.",
      );
    } finally {
      setExporting(false);
    }
  }

  /** Copy the share URL; when the clipboard API is unavailable the "Open plan
   *  link" anchor stays as the universal fallback. */
  async function copyShareLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(new URL(shareHref, window.location.origin).href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
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
