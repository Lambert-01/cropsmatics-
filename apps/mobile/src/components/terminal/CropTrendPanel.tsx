/**
 * The national-series panel of the crop terminal.
 *
 * Presentational: the screen owns the board query and the metric / period state
 * and passes an already-fetched, already-aligned series in. Everything that
 * decides what the number *means* — the hero figure, the shared period window,
 * the single-point warning and the source disclosure — lives here, so the
 * national surface is described in exactly one place.
 */

import { useMemo } from "react";

import { strings } from "../../i18n";
import { nationalMetrics, metricLabel, resolveMetricOptions, type NationalMetricId } from "../../constants/analytical";
import { useAppStore } from "../../store/useAppStore";
import { chart } from "../../theme";
import type { ChangeResult, PeriodRange } from "../../utils/analytics";
import type { ChartSeries } from "../charts";
import { DataSection, DataWarning } from "../data-view";
import { EmptyState, ErrorState, LoadingSkeleton } from "../ui";
import { AnalyticalChartCard } from "./AnalyticalChartCard";
import { SeasonSelector } from "./SeasonSelector";

export type PeriodView = "all" | "same-season";

export function CropTrendPanel({
  selectionLabel,
  loading,
  error,
  onRetry,
  empty,
  published,
  metric,
  onMetricChange,
  units,
  unit,
  series,
  periodRange,
  onPeriodRangeChange,
  change,
  periodView,
  onPeriodViewChange,
  seasonLetter,
  periodLabel,
  source,
  method,
  limitations,
}: {
  /** Name shown on the line and in the "no published …" sentence. */
  selectionLabel: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** True when the selection has no published point at all. */
  empty: boolean;
  /** Number of published observations in the current window. */
  published: number;
  metric: NationalMetricId;
  onMetricChange: (id: NationalMetricId) => void;
  /** The response's own unit map when it carries one; wins over configured units. */
  units?: Record<string, string | null | undefined> | null;
  unit?: string | null;
  series: ChartSeries[];
  periodRange: PeriodRange;
  onPeriodRangeChange: (range: PeriodRange) => void;
  change?: ChangeResult | null;
  periodView: PeriodView;
  onPeriodViewChange: (view: PeriodView) => void;
  seasonLetter: string | null;
  periodLabel: string | null;
  source?: string | null;
  method?: string | null;
  limitations?: string[] | null;
}) {
  const t = strings(useAppStore((s) => s.language));
  const label = metricLabel(t, metric);

  const metricOptions = useMemo(
    () => resolveMetricOptions(nationalMetrics, t, units),
    [t, units],
  );

  return (
    <DataSection title={t.nationalSeries} subtitle={t.pulseSubtitle} first>
      <SeasonSelector
        label={t.period}
        options={[
          { id: "all", label: t.allPublishedPeriods },
          {
            id: "same-season",
            label: t.sameSeasonView,
            hint: seasonLetter ? `${t.seasonWord} ${seasonLetter}` : null,
          },
        ]}
        value={periodView}
        onChange={(id) => onPeriodViewChange(id as PeriodView)}
      />

      {error ? (
        <ErrorState message={t.errorGeneric} onRetry={onRetry} />
      ) : loading ? (
        <LoadingSkeleton height={chart.tallHeight} />
      ) : empty ? (
        <EmptyState
          title={t.noDataAvailable}
          /* Names the selection. `.toLowerCase()` on a translated string is also
             wrong: it is a no-op in Kinyarwanda and mangles German-style nouns,
             so the sentence is composed from a template instead. */
          message={t.noPublishedSelection
            .replace("{metric}", label)
            .replace("{selection}", selectionLabel)}
        />
      ) : (
        <AnalyticalChartCard
          title=""
          metricLabel={label}
          metrics={metricOptions}
          metric={metric}
          onMetricChange={(id) => onMetricChange(id as NationalMetricId)}
          series={series}
          unit={unit}
          periodRange={periodRange}
          onPeriodRangeChange={onPeriodRangeChange}
          change={change}
          changeUnavailableNote={t.noComparableChange}
          accessibilityLabel={t.trendChartA11y
            .replace("{metric}", label)
            .replace("{selection}", selectionLabel)}
          source={source}
          period={periodLabel}
          coverage="national crop series"
          method={method}
          limitations={limitations}
          warnings={
            <>
              {/* A single published point is not a trend. */}
              {published === 1 ? <DataWarning tone="slate" text={t.singlePointNote} /> : null}
              {periodView === "same-season" ? (
                <DataWarning tone="slate" text={t.sameSeasonNotSeries} />
              ) : null}
            </>
          }
        />
      )}
    </DataSection>
  );
}
