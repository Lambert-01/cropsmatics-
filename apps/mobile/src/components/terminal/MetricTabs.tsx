/**
 * Dense metric switcher: one chip per metric, each carrying the unit it will be
 * plotted in.
 *
 * The unit is on the chip, not only beside the value, so a user switching from
 * t/ha to kg/ha can see the change before the chart redraws. A disabled metric
 * still renders (dimmed) with its reason available, rather than vanishing and
 * leaving the reader to guess why it is missing.
 */

import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { radius, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useThemedStyles } from "../../theme/theme-context";
import type { ResolvedMetricOption } from "../../constants/analytical";

export function MetricTabs<Id extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: ResolvedMetricOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.id === value;
        const disabled = !option.enabled;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.unit ? `${option.label}, ${option.unit}` : option.label}
            accessibilityHint={disabled ? option.disabledReason ?? undefined : undefined}
            disabled={disabled}
            onPress={() => onChange(option.id)}
            hitSlop={6}
            style={[styles.chip, selected ? styles.chipSelected : null, disabled ? styles.chipDisabled : null]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>{option.label}</Text>
            {option.unit ? (
              <Text style={[styles.unit, selected ? styles.unitSelected : null]}>{option.unit}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      minHeight: 40,
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipDisabled: { opacity: 0.45 },
    label: { fontSize: 13, fontWeight: "600", color: colors.slate700 },
    labelSelected: { color: colors.white },
    unit: { fontSize: 10, color: colors.slate500, fontVariant: ["tabular-nums"] },
    unitSelected: { color: colors.mintLight },
  });
