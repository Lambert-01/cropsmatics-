/**
 * The selected-district information panel for the map.
 *
 * Opened by either tapping the shape or choosing from the accessible district
 * picker, so both input paths lead to the same panel. It never fabricates a
 * value: a district with no published observation shows "Not published" and the
 * same contextual actions are still offered.
 */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { radius, shadow, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";
import { formatValue } from "../../utils/analytics";

export interface DistrictDetailAction {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

export function DistrictDetailSheet({
  district,
  province,
  metricLabel,
  period,
  value,
  unit,
  onClose,
  actions = [],
}: {
  district: string;
  province?: string | null;
  metricLabel?: string | null;
  period?: string | null;
  value: number | null;
  unit?: string | null;
  onClose: () => void;
  actions?: DistrictDetailAction[];
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const published = value !== null && Number.isFinite(value);
  const meta = [province, metricLabel, period].filter(Boolean).join(" · ");

  return (
    <View style={styles.sheet} accessibilityRole="summary" accessibilityLabel={`${district}. ${meta}`}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.h3}>{district}</Text>
          {meta ? <Text style={typography.micro}>{meta}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={onClose}
          hitSlop={10}
          style={styles.close}
        >
          <Ionicons name="close" size={16} color={colors.slate700} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
        <Text
          style={{
            ...typography.numericLarge,
            fontSize: 26,
            color: published ? colors.forestDeep : colors.slate500,
            fontVariant: ["tabular-nums"],
          }}
        >
          {published ? formatValue(value) : t.notPublished}
        </Text>
        {published && unit ? <Text style={typography.unit}>{unit}</Text> : null}
      </View>

      {!published ? <Text style={typography.micro}>{t.mapNoVerifiedValue}</Text> : null}

      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [styles.action, pressed ? { opacity: 0.8 } : null]}
            >
              <Ionicons name={action.icon} size={15} color={colors.primaryStrong} />
              <Text numberOfLines={1} style={styles.actionText}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    sheet: {
      position: "absolute",
      left: spacing.md,
      right: spacing.md,
      bottom: spacing.sm,
      backgroundColor: colors.elevated,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
      ...shadow.sheet,
    },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    close: {
      width: 30,
      height: 30,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.mintSoft,
    },
    actions: { flexDirection: "row", gap: spacing.sm },
    action: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingHorizontal: 4,
    },
    actionText: { fontSize: 11, fontWeight: "700", color: colors.primaryStrong },
  });
