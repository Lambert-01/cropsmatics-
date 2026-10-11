/**
 * Period-window selector over the published axis (All / Latest 4 / Latest 8).
 *
 * Extracted from the analytical card so every multi-period chart — national,
 * district, and the compare workspace — offers the identical control and the
 * identical labels. The window is applied with `applyAxisWindow` against one
 * shared axis; it never slices each series' own non-null observations.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { radius } from "../../theme";
import type { Palette } from "../../theme";
import { useThemedStyles } from "../../theme/theme-context";
import type { PeriodRange } from "../../utils/analytics";
import { PERIOD_RANGES, periodWindowCount } from "../../utils/analytics";

type LabelSource = { latestCount: string; allPublishedPeriods: string };

export function periodRangeLabel(t: LabelSource, range: PeriodRange): string {
  const count = periodWindowCount(range);
  return count === null ? t.allPublishedPeriods : t.latestCount.replace("{count}", String(count));
}

export function PeriodRangeChips({
  value,
  onChange,
}: {
  value: PeriodRange;
  onChange: (range: PeriodRange) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  return (
    <View style={styles.rangeRow}>
      {PERIOD_RANGES.map((range) => {
        const selected = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={periodRangeLabel(t, range)}
            onPress={() => onChange(range)}
            hitSlop={6}
            style={[styles.rangeChip, selected ? styles.rangeChipSelected : null]}
          >
            <Text style={[styles.rangeText, selected ? styles.rangeTextSelected : null]}>
              {periodRangeLabel(t, range)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    rangeRow: { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" },
    rangeChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      minHeight: 34,
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    rangeChipSelected: { backgroundColor: colors.mint, borderColor: colors.primary },
    rangeText: { fontSize: 11, fontWeight: "700", color: colors.slate700 },
    rangeTextSelected: { color: colors.primaryStrong },
  });
