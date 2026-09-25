import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../theme";

export function MetricCard({ title, value, note, icon, accent = colors.brandGreen }: {
  title: string;
  value: string;
  note?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
}) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, minHeight: 112, padding: spacing.md,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, ...shadow.card }}>
      <Ionicons name={icon} size={19} color={accent} />
      <Text style={{ ...typography.caption, marginTop: 6 }}>{title}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...typography.metric, marginTop: 2 }}>{value}</Text>
      {note ? <Text numberOfLines={2} style={{ ...typography.caption, marginTop: 2 }}>{note}</Text> : null}
    </View>
  );
}
