/**
 * Full-screen workspace for a chart.
 *
 * A time series on a phone is cramped; this presents the *same* chart (the
 * caller passes the already-windowed series, so no new analytics query is made)
 * with more height and a focused header. It is a real modal, so Android's
 * hardware Back closes it through `onRequestClose` before the screen beneath.
 */

import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { radius, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";

export function ChartWorkspace({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={typography.h2}>
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={typography.micro}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t.collapseChart}, ${t.close}`}
            onPress={onClose}
            hitSlop={10}
            style={styles.close}
          >
            <Ionicons name="contract-outline" size={20} color={colors.primaryStrong} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    close: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  });
