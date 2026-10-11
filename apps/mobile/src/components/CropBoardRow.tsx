/**
 * One crop board row.
 *
 * Identity, the latest published value with its unit and period, the
 * platform-computed same-season change, and a sparkline of the aligned series.
 *
 * Every number here is read from the national board response — the row derives
 * nothing itself, so the board, the home preview and the crop terminal can never
 * disagree about a value or a change.
 */

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { spacing } from "../theme";
import type { Palette, Typography } from "../theme";
import { useTheme, useThemedStyles } from "../theme/theme-context";
import type { NationalBoardCrop } from "../types";
import type { RawPoint } from "../utils/analytics";
import { boardPoints, changeFromApi, formatValue, toSeriesPoints } from "../utils/analytics";
import { Sparkline } from "./charts";
import { ChangeIndicator } from "./data-view";

/** Metrics the row can plot, in the board's own keys. */
export type BoardMetric = "production_mt" | "harvested_area_ha" | "yield_mt_ha";

export function CropBoardRow({
  crop,
  metric,
  metricLabel,
  periods,
  periodLabels,
  unit,
  changeNote,
  onPress,
  /** Optional trailing control, e.g. a watchlist toggle. */
  right,
  /** Row is still waiting for the board response. */
  loading = false,
}: {
  crop: NationalBoardCrop | null;
  metric: BoardMetric;
  metricLabel: string;
  periods: readonly string[];
  periodLabels: Record<string, string>;
  unit: string | null;
  /** Fallback wording when the API could not compute a change. */
  changeNote: string;
  onPress: () => void;
  right?: ReactNode;
  loading?: boolean;
}) {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const points: RawPoint[] = useMemo(
    () =>
      crop
        ? boardPoints(
            { periods, period_labels: periodLabels, series: crop.series },
            [metric],
          )
        : [],
    [crop, periods, periodLabels, metric],
  );

  const seriesPoints = useMemo(() => toSeriesPoints(points, metric), [points, metric]);
  const change = changeFromApi(crop?.changes?.[metric]);
  const latestIndex = useMemo(() => {
    for (let index = seriesPoints.length - 1; index >= 0; index -= 1) {
      if (seriesPoints[index].value !== null) return index;
    }
    return -1;
  }, [seriesPoints]);

  const latestValue = latestIndex >= 0 ? seriesPoints[latestIndex].value : null;
  const latestPeriod = latestIndex >= 0 ? periods[latestIndex] : null;
  const latestLabel = latestPeriod ? (periodLabels[latestPeriod] ?? latestPeriod) : null;
  const reason = crop?.changes?.[metric]?.reason ?? null;

  const valueText = latestValue === null ? t.notPublished : formatValue(latestValue);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        crop
          ? `${crop.crop}. ${metricLabel}: ${valueText}${unit ? ` ${unit}` : ""}${
              latestLabel ? `, ${latestLabel}` : ""
            }. ${
              change
                ? `${change.changePct.toFixed(1)} percent versus ${change.previous.label}`
                : (reason ?? changeNote)
            }`
          : metricLabel
      }
      accessibilityState={{ busy: loading }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      {/* Identity and the figure share one line so the numbers form a column. */}
      <View style={styles.top}>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>
            {crop?.crop ?? "—"}
          </Text>
          <Text numberOfLines={1} style={styles.seriesNote}>
            {latestLabel ?? (loading ? t.loading : t.noPublishedPeriod)}
          </Text>
        </View>
        {right}
        <View style={styles.figure}>
          <Text
            numberOfLines={1}
            style={[styles.value, latestValue === null ? styles.valueMissing : null]}
          >
            {loading ? "…" : valueText}
          </Text>
          {!loading && unit ? <Text numberOfLines={1} style={styles.unit}>{unit}</Text> : null}
        </View>
      </View>

      <Sparkline
        points={seriesPoints}
        accessibilityLabel={t.trendChartA11y
          .replace("{metric}", metricLabel)
          .replace("{selection}", crop?.crop ?? "")}
      />

      {change ? (
        <ChangeIndicator change={change} />
      ) : (
        <Text numberOfLines={2} style={typography.micro}>
          {reason ?? changeNote}
        </Text>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: Palette, typography: Typography) =>
  StyleSheet.create({
  /**
   * One stable height for every row so a board of 5, 15 or 30 crops scans as a
   * single grid instead of a ragged list. The value column is a fixed width so
   * figures line up vertically regardless of magnitude.
   */
  row: {
    minHeight: 96,
    paddingVertical: spacing.sm,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    justifyContent: "center",
  },
  rowPressed: { opacity: 0.72 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  identity: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.h3, fontSize: 15 },
  seriesNote: { ...typography.micro },
  figure: { width: 118, alignItems: "flex-end" },
  value: {
    ...typography.numeric,
    fontSize: 16,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
  valueMissing: { ...typography.numericSmall, color: colors.slate500 },
  unit: { ...typography.micro, color: colors.slate500 },
});
