/**
 * Bottom-sheet selector for the comparison workspace.
 *
 * Replaces the long inline chip list that sat above the chart. It keeps a
 * *draft* selection while open, so cancelling restores the previous comparison
 * exactly — the previous behaviour applied every tap immediately and left no way
 * back. The maximum is enforced by ignoring extra taps (the tray shows full),
 * and search is diacritic-foldable so "Irish potatoes" and "Ibirayi" both find
 * their catalogue entries.
 */

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, shadow, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";
import { useAppStore } from "../../store/useAppStore";
import { strings } from "../../i18n";
import { filterByLabel, isSelectionFull, toggleSelection } from "../../utils/selection";

export interface SheetOption {
  id: string;
  label: string;
}

export function ComparisonSelectionSheet({
  visible,
  title,
  countTemplate,
  searchPlaceholder,
  options,
  selected,
  max,
  onApply,
  onCancel,
  normalize,
}: {
  visible: boolean;
  title: string;
  /** e.g. "{selected} of {max} crops selected" */
  countTemplate: string;
  searchPlaceholder: string;
  options: SheetOption[];
  selected: string[];
  max: number;
  onApply: (next: string[]) => void;
  onCancel: () => void;
  normalize?: (text: string) => string;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const t = strings(useAppStore((s) => s.language));
  const [draft, setDraft] = useState<string[]>(selected);
  const [query, setQuery] = useState("");

  // Re-seed the draft each time the sheet opens so Cancel is a real revert.
  useEffect(() => {
    if (visible) {
      setDraft(selected);
      setQuery("");
    }
    // Intentionally only re-seed on open, not on every parent `selected` change
    // while the sheet is visible (that would fight the user's in-sheet edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const byId = new Map(options.map((option) => [option.id, option.label]));
  const filtered = filterByLabel(options, query, normalize);
  const full = isSelectionFull(draft, max);
  const countText = countTemplate
    .replace("{selected}", String(draft.length))
    .replace("{max}", String(max));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.cancel}
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.h2}>{title}</Text>
                <Text style={typography.micro}>{countText}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.cancel}
                onPress={onCancel}
                hitSlop={10}
                style={styles.close}
              >
                <Ionicons name="close" size={18} color={colors.slate700} />
              </Pressable>
            </View>

            <View style={styles.search}>
              <Ionicons name="search" size={16} color={colors.slate500} />
              <TextInput
                accessibilityLabel={searchPlaceholder}
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.slate500}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>

            {draft.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedRow}
                keyboardShouldPersistTaps="handled"
              >
                {draft.map((id) => (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={`${byId.get(id) ?? id}`}
                    onPress={() => setDraft((current) => toggleSelection(current, id, max))}
                    style={styles.selectedChip}
                  >
                    <Text numberOfLines={1} style={styles.selectedChipText}>
                      {byId.get(id) ?? id}
                    </Text>
                    <Ionicons name="close" size={12} color={colors.white} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <ScrollView
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ gap: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.length ? (
                filtered.map((option) => {
                  const isSelected = draft.includes(option.id);
                  const blocked = !isSelected && full;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected, disabled: blocked }}
                      accessibilityLabel={option.label}
                      disabled={blocked}
                      onPress={() => setDraft((current) => toggleSelection(current, option.id, max))}
                      style={[styles.option, blocked ? { opacity: 0.45 } : null]}
                    >
                      <Ionicons
                        name={isSelected ? "checkbox" : "square-outline"}
                        size={19}
                        color={isSelected ? colors.primary : colors.slate500}
                      />
                      <Text numberOfLines={1} style={styles.optionText}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={typography.caption}>{t.noResults}</Text>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.cancel}
                onPress={onCancel}
                style={[styles.button, styles.buttonGhost]}
              >
                <Text style={styles.buttonGhostText}>{t.cancel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.applySelection}
                onPress={() => onApply(draft)}
                style={[styles.button, styles.buttonPrimary]}
              >
                <Text style={styles.buttonPrimaryText}>{t.applySelection}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(3,29,23,0.45)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      gap: spacing.sm,
      maxHeight: "86%",
      ...shadow.sheet,
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    close: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.mintSoft,
    },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.sm,
      minHeight: 46,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.slate900, paddingVertical: 10 },
    selectedRow: { flexDirection: "row", gap: 6, alignItems: "center", paddingRight: spacing.sm },
    selectedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      minHeight: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      maxWidth: 190,
    },
    selectedChipText: { fontSize: 12, fontWeight: "700", color: colors.white, flexShrink: 1 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    optionText: { fontSize: 15, color: colors.slate700, flex: 1 },
    footer: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs },
    button: {
      flex: 1,
      minHeight: 50,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonPrimary: { backgroundColor: colors.primary },
    buttonPrimaryText: { color: colors.white, fontSize: 15, fontWeight: "700" },
    buttonGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    buttonGhostText: { color: colors.slate700, fontSize: 15, fontWeight: "600" },
  });
