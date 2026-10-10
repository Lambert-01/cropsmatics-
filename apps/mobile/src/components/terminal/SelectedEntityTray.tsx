/**
 * Persistent tray of the entities a comparison is currently using.
 *
 * It sits directly above the comparison chart and is driven by screen state, not
 * a global store, so it survives switching metric tabs and opening the expanded
 * chart but is *not* accidentally persisted across navigation. Each chip can be
 * removed in place, and the Edit affordance opens the full selection sheet.
 */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";

export interface TrayEntity {
  id: string;
  label: string;
}

export function SelectedEntityTray({
  entities,
  onRemove,
  onEdit,
  editLabel = "Edit",
  removeLabel = "Remove",
  emptyLabel,
}: {
  entities: TrayEntity[];
  onRemove: (id: string) => void;
  onEdit?: () => void;
  editLabel?: string;
  removeLabel?: string;
  emptyLabel?: string;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!entities.length) {
    return emptyLabel ? <Text style={typography.micro}>{emptyLabel}</Text> : null;
  }

  return (
    <View style={styles.tray}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {entities.map((entity) => (
          <View key={entity.id} style={styles.chip}>
            <Text numberOfLines={1} style={styles.chipText}>
              {entity.label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${removeLabel}: ${entity.label}`}
              onPress={() => onRemove(entity.id)}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={15} color={colors.primaryStrong} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editLabel}
          onPress={onEdit}
          hitSlop={8}
          style={styles.edit}
        >
          <Ionicons name="options-outline" size={14} color={colors.primaryStrong} />
          <Text style={styles.editText}>{editLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    tray: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    row: { flexDirection: "row", gap: 6, alignItems: "center", paddingRight: spacing.sm },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingLeft: 11,
      paddingRight: 7,
      paddingVertical: 5,
      minHeight: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.mint,
      borderWidth: 1,
      borderColor: colors.hairline,
      maxWidth: 200,
    },
    chipText: { fontSize: 12, fontWeight: "700", color: colors.primaryStrong, flexShrink: 1 },
    edit: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
    editText: { fontSize: 12, fontWeight: "700", color: colors.primaryStrong },
  });
