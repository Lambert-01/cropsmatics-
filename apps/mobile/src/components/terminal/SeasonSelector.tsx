/**
 * Horizontal chip selector for a published period/season axis.
 *
 * Reused for the crop terminal's season view and the map's period control so
 * both present the same official axis identically. The `hint` slot carries an
 * optional qualifier (a season letter, a district count) under the label.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";

export interface SeasonOption {
  id: string;
  label: string;
  hint?: string | null;
}

export function SeasonSelector({
  options,
  value,
  onChange,
  label,
  accessibilityLabel,
}: {
  options: SeasonOption[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
  accessibilityLabel?: string;
}) {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!options.length) return null;
  return (
    <View style={{ gap: 5 }}>
      {label ? <Text style={typography.microCaps}>{label.toUpperCase()}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
              onPress={() => onChange(option.id)}
              hitSlop={6}
              style={[styles.chip, selected ? styles.chipSelected : null]}
            >
              <Text style={[styles.label, selected ? styles.labelSelected : null]}>{option.label}</Text>
              {option.hint ? (
                <Text style={[styles.hint, selected ? styles.hintSelected : null]}>{option.hint}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
    label: { fontSize: 13, fontWeight: "600", color: colors.slate700 },
    labelSelected: { color: colors.white },
    hint: { fontSize: 10, color: colors.slate500, fontVariant: ["tabular-nums"] },
    hintSelected: { color: colors.mintLight },
  });
