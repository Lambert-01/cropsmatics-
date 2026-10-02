import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { radius, shadow, spacing } from "../theme";
import { useTheme } from "../theme/theme-context";

export function MetricCard({ title, value, note, icon, accent }: {
  title: string;
  value: string;
  note?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, minHeight: 112, padding: spacing.md,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, ...shadow.card }}>
      <Ionicons name={icon} size={19} color={accent ?? colors.brandGreen} />
      <Text style={{ ...typography.caption, marginTop: 6 }}>{title}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...typography.metric, marginTop: 2 }}>{value}</Text>
      {note ? <Text numberOfLines={2} style={{ ...typography.caption, marginTop: 2 }}>{note}</Text> : null}
    </View>
  );
}
