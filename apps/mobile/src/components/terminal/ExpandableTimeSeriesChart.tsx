/**
 * A time series with the same expand-to-full-screen affordance the national
 * analytical card offers.
 *
 * The district series used to be a bare `TimeSeriesChart`, so a crop's *district*
 * history could not be opened full-screen while its *national* history could.
 * Both surfaces now present an identical control, and the workspace draws the
 * same already-fetched, already-windowed series — expanding never issues a new
 * analytics query.
 */

import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { chart, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";
import type { ChartSeries } from "../charts";
import { TimeSeriesChart } from "../charts";
import { ChartWorkspace } from "./ChartWorkspace";

export function ExpandableTimeSeriesChart({
  series,
  unit,
  height = chart.height,
  emptyNote,
  accessibilityLabel,
  title,
  subtitle,
  footer,
}: {
  series: ChartSeries[];
  unit?: string | null;
  height?: number;
  emptyNote?: string;
  accessibilityLabel: string;
  /** Workspace header. */
  title: string;
  subtitle?: string | null;
  /** Rendered directly beneath the plot in both views (e.g. a change badge). */
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const [expanded, setExpanded] = useState(false);
  // One shared crosshair selection across the inline plot and the workspace.
  const [pointIndex, setPointIndex] = useState<number | null>(null);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.toolbarRow}>
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
      </View>

      <TimeSeriesChart
        series={series}
        unit={unit}
        height={height}
        emptyNote={emptyNote}
        accessibilityLabel={accessibilityLabel}
        selectedIndex={pointIndex}
        onSelectIndex={(index) => setPointIndex(index)}
      />

      {footer}

      <ChartWorkspace
        visible={expanded}
        title={title}
        subtitle={subtitle}
        onClose={() => setExpanded(false)}
      >
        <View style={{ gap: spacing.sm }}>
          <TimeSeriesChart
            series={series}
            unit={unit}
            height={chart.tallHeight + 120}
            emptyNote={emptyNote}
            accessibilityLabel={accessibilityLabel}
            selectedIndex={pointIndex}
            onSelectIndex={(index) => setPointIndex(index)}
          />
          {footer}
        </View>
      </ChartWorkspace>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    toolbarRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
    expand: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 34 },
    expandText: { fontSize: 11, fontWeight: "700", color: colors.primaryStrong },
  });
