/**
 * Identity + primary actions header for an analytical screen.
 *
 * Presentational: the caller supplies the crop/district name, the save state and
 * the action handlers. It exists so the crop terminal and district view present
 * the same heading, the same save affordance and the same action row.
 */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";

export interface ToolbarAction {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

export function AnalyticalToolbar({
  title,
  subtitle,
  saved,
  saveLabel,
  unsaveLabel,
  onToggleSave,
  actions = [],
}: {
  title: string;
  subtitle?: string | null;
  saved?: boolean;
  saveLabel?: string;
  unsaveLabel?: string;
  onToggleSave?: () => void;
  actions?: ToolbarAction[];
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onToggleSave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(saved) }}
            accessibilityLabel={saved ? unsaveLabel ?? "Remove" : saveLabel ?? "Save"}
            onPress={onToggleSave}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={19}
              color={colors.primaryStrong}
            />
          </Pressable>
        ) : null}
      </View>

      {actions.length ? (
        <View style={styles.actionRow}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              hitSlop={6}
              style={({ pressed }) => [styles.action, pressed ? { opacity: 0.8 } : null]}
            >
              <Ionicons name={action.icon} size={16} color={colors.primaryStrong} />
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { fontSize: 22, fontWeight: "700", color: colors.forestDeep },
    subtitle: { fontSize: 12, color: colors.muted },
    iconButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
    action: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 88,
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionText: { color: colors.primaryStrong, fontWeight: "600", fontSize: 13 },
  });
