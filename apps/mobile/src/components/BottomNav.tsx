import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { strings } from "../i18n";
import type { Strings } from "../i18n/en";
import { useAppStore } from "../store/useAppStore";
import { colors } from "../theme";

const ITEMS = [
  { id: "home", label: "home", href: "/" as const, icon: "home-outline" as const },
  { id: "harvests", label: "harvestHistory", href: "/harvests" as const, icon: "leaf-outline" as const },
  { id: "insights", label: "recommendations", href: "/insights" as const, icon: "bar-chart-outline" as const },
  { id: "alerts", label: "alerts", href: "/alerts" as const, icon: "notifications-outline" as const },
  { id: "profile", label: "profile", href: "/profile" as const, icon: "person-outline" as const },
] satisfies { id: string; label: keyof Strings; href: string; icon: keyof typeof Ionicons.glyphMap }[];

export function BottomNav({ active }: { active: string }) {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border,
      backgroundColor: colors.surface, paddingBottom: 4 }}>
      {ITEMS.map((item) => {
        const selected = item.id === active;
        return (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={t[item.label]}
            onPress={() => router.push(item.href)}
            style={{ flex: 1, alignItems: "center", paddingVertical: 7, gap: 2,
              borderTopWidth: 3, borderTopColor: selected ? colors.brandGreen : "transparent" }}>
            <Ionicons name={item.icon} size={20} color={selected ? colors.brandGreen : colors.muted} />
            <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: selected ? "700" : "500",
              color: selected ? colors.brandGreen : colors.muted }}>
              {t[item.label]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
