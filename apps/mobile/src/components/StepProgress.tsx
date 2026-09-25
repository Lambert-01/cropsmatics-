import { Text, View } from "react-native";

import { colors, radius, spacing } from "../theme";

export function StepProgress({ labels, current }: { labels: string[]; current: number }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {labels.map((label, index) => (
        <View key={label} style={{ flex: 1, alignItems: "center", gap: 5 }}>
          <View style={{ height: 28, width: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
            backgroundColor: index <= current ? colors.brandGreen : colors.border }}>
            <Text style={{ color: index <= current ? colors.white : colors.muted, fontWeight: "700", fontSize: 12 }}>{index + 1}</Text>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 10, color: index === current ? colors.forest : colors.muted }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
