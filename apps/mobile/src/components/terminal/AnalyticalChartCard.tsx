/**
 * A complete analytical chart surface:
 *
 *   MetricHero (value · unit · period · change)
 *   ├── metric switcher (optional)
 *   ├── period-range selector  +  full-screen action
 *   ├── TimeSeriesChart (windowed)
 *   └── source & method disclosure
 *
 * One shared period window is applied with `applyAxisWindow` to *every* series,
 * so switching to "Latest 4" moves all series to the same four published
 * positions — it never slices each crop's non-null observations independently.
 * The hero figure is read from the same windowed points the chart draws, so the
 * headline and the line can never disagree.
 *
 * It performs no data fetching: the caller passes an already-fetched series.
 */

import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { chart, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";
import type { ResolvedMetricOption } from "../../constants/analytical";
import type { ChangeResult, PeriodRange, SeriesPoint } from "../../utils/analytics";
import { applyAxisWindow } from "../../utils/analytics";
import type { ChartSeries } from "../charts";
import { TimeSeriesChart } from "../charts";
import { SourceMethodSheet } from "../data-view";
import { ChartWorkspace } from "./ChartWorkspace";
import { MetricHero } from "./MetricHero";
import { MetricTabs } from "./MetricTabs";
import { PeriodRangeChips } from "./PeriodRangeChips";

/** The newest published point across a set of aligned series, or null. */
function latestPublishedPoint(
  points: readonly SeriesPoint[] | undefined,
): { value: number; label: string } | null {
  if (!points) return null;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point?.value !== null && point?.value !== undefined) {
      return { value: point.value, label: point.label };
    }
  }
  return null;
}

export function AnalyticalChartCard({
  title,
  metricLabel,
  metrics,
  metric,
  onMetricChange,
  series,
  unit,
  periodRange,
  onPeriodRangeChange,
  change,
  changeUnavailableNote,
  accessibilityLabel,
  emptyNote,
  heroPeriod,
  height = chart.tallHeight,
  source,
  period,
  coverage,
  method,
  limitations,
  warnings,
}: {
  title: string;
  metricLabel: string;
  metrics?: ResolvedMetricOption<string>[];
  metric?: string;
  onMetricChange?: (id: string) => void;
  series: ChartSeries[];
  unit?: string | null;
  periodRange: PeriodRange;
  onPeriodRangeChange: (range: PeriodRange) => void;
  change?: ChangeResult | null;
  changeUnavailableNote?: string;
  accessibilityLabel: string;
  emptyNote?: string;
  heroPeriod?: string | null;
  height?: number;
  source?: string | null;
  period?: string | null;
  coverage?: string | null;
  method?: string | null;
  limitations?: string[] | null;
  /** Data-honesty notes that must stay visible above the fold. */
  warnings?: ReactNode;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const [expanded, setExpanded] = useState(false);
  // One shared crosshair selection: the inline chart and its full-screen copy
  // are both controlled from here, so expanding keeps the chosen period.
  const [pointIndex, setPointIndex] = useState<number | null>(null);

  const windowed = useMemo(() => applyAxisWindow(series, periodRange), [series, periodRange]);
  // The headline is read from the same windowed points the chart draws, so
  // switching the period window moves the figure and the line together.
  const latest = latestPublishedPoint(windowed[0]?.points);

  const rangeChips = <PeriodRangeChips value={periodRange} onChange={onPeriodRangeChange} />;

  const expandButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.expandChart}
      onPress={() => setExpanded(true)}
      hitSlop={8}
      style={styles.expand}
    >
      <Ionicons name="expand-outline" size={15} color={colors.primaryStrong} />
      <Text style={styles.expandText}>{t.expandChart}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: spacing.sm }}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      <MetricHero
        label={metricLabel}
        value={latest?.value ?? null}
        unit={unit}
        period={heroPeriod ?? latest?.label ?? null}
        change={change}
        changeNote={change ? undefined : changeUnavailableNote}
      />

      {metrics && metric && onMetricChange ? (
        <MetricTabs
          options={metrics}
          value={metric}
          onChange={onMetricChange}
          accessibilityLabel={t.selectIndicator}
        />
      ) : null}

      <View style={styles.toolbarRow}>
        {rangeChips}
        {expandButton}
      </View>

      <TimeSeriesChart
        series={windowed}
        unit={unit}
        height={height}
        emptyNote={emptyNote}
        accessibilityLabel={accessibilityLabel}
        selectedIndex={pointIndex}
        onSelectIndex={(index) => setPointIndex(index)}
      />

      {warnings}

      <SourceMethodSheet
        title={t.sourceAndMethod}
        source={source}
        period={period}
        coverage={coverage}
        unit={unit}
        method={method}
        limitations={limitations}
      />

      <ChartWorkspace
        visible={expanded}
        title={`${metricLabel} — ${title}`.trim()}
        subtitle={period}
        onClose={() => setExpanded(false)}
      >
        <View style={{ gap: spacing.sm }}>
          {rangeChips}
          <TimeSeriesChart
            series={windowed}
            unit={unit}
            height={chart.tallHeight + 120}
            emptyNote={emptyNote}
            accessibilityLabel={accessibilityLabel}
            selectedIndex={pointIndex}
            onSelectIndex={(index) => setPointIndex(index)}
          />
          {change ? (
            <Text style={typography.micro}>
              {t.changeSameSeason
                .replace("{label}", change.previous.label)
                .replace("{value}", String(change.previous.value))}
            </Text>
          ) : null}
        </View>
      </ChartWorkspace>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    title: { fontSize: 16, fontWeight: "700", color: colors.forest },
    toolbarRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    expand: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 34 },
    expandText: { fontSize: 11, fontWeight: "700", color: colors.primaryStrong },
  });
