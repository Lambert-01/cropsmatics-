import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";

import { colors, radius, spacing } from "../theme";

export function QuickActionCard({ label, icon, onPress, color = colors.brandGreen }: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ flexBasis: "47%", flexGrow: 1, minHeight: 100, justifyContent: "space-between",
        backgroundColor: color, borderRadius: radius.lg, padding: spacing.md }}>
      <Ionicons name={icon} size={24} color={colors.white} />
      <Text style={{ color: colors.white, fontSize: 15, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
