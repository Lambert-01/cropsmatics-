/**
 * One-line coverage/period/source strip that heads an analytical view.
 *
 * It states *what is measured, where, when and from which source* in the same
 * place on every screen, so a reader never has to hunt for the period a figure
 * belongs to. A missing part is simply omitted — never rendered as a placeholder
 * that could be mistaken for real metadata.
 */

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { radius } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";

export function CoverageStatus({
  period,
  coverage,
  source,
  unit,
}: {
  period?: string | null;
  coverage?: string | null;
  source?: string | null;
  unit?: string | null;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const parts = [period, coverage, unit, source].filter(Boolean) as string[];
  if (!parts.length) return null;
  return (
    <View style={styles.strip}>
      <Ionicons name="shield-checkmark-outline" size={12} color={colors.primaryStrong} />
      <Text numberOfLines={2} style={styles.text}>
        {parts.join(" · ")}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    strip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
      maxWidth: "100%",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.sm,
      backgroundColor: colors.mint,
    },
    text: { fontSize: 10, fontWeight: "700", color: colors.primaryStrong, flexShrink: 1, lineHeight: 14 },
  });
