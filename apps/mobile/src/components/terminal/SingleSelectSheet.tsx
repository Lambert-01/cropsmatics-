/**
 * Single-select searchable sheet.
 *
 * The multi-select comparison sheet blocks extra taps once full, which is
 * correct for a comparison but useless for "pick the crop / district to
 * examine": a radio-style list must switch, not refuse. This sheet keeps the
 * same draft + Cancel/Apply contract so dismissing it never changes the screen
 * behind it.
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

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { radius, shadow, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";
import { filterByLabel } from "../../utils/selection";

export interface SingleSelectOption {
  id: string;
  label: string;
  hint?: string | null;
}

export function SingleSelectSheet({
  visible,
  title,
  subtitle,
  searchPlaceholder,
  options,
  selected,
  onApply,
  onCancel,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  searchPlaceholder: string;
  options: SingleSelectOption[];
  /** Currently applied value, or null for "nothing selected". */
  selected: string | null;
  onApply: (next: string | null) => void;
  onCancel: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const t = strings(useAppStore((s) => s.language));
  const [draft, setDraft] = useState<string | null>(selected);
  const [query, setQuery] = useState("");

  // Re-seed on open so Cancel is a real revert.
  useEffect(() => {
    if (visible) {
      setDraft(selected);
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const filtered = filterByLabel(options, query);

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
                {subtitle ? <Text style={typography.micro}>{subtitle}</Text> : null}
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

            <ScrollView
              style={{ maxHeight: 340 }}
              contentContainerStyle={{ gap: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.length ? (
                <View accessibilityRole="radiogroup" accessibilityLabel={title}>
                  {filtered.map((option) => {
                    const isSelected = draft === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
                        onPress={() => setDraft(option.id)}
                        style={styles.option}
                      >
                        <Ionicons
                          name={isSelected ? "radio-button-on" : "radio-button-off"}
                          size={19}
                          color={isSelected ? colors.primary : colors.slate500}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={styles.optionText}>
                            {option.label}
                          </Text>
                          {option.hint ? (
                            <Text numberOfLines={1} style={typography.micro}>
                              {option.hint}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
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
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    optionText: { fontSize: 15, color: colors.slate700 },
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
