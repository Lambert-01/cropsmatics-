import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "../i18n";
import type { Strings } from "../i18n/en";
import { useAppStore } from "../store/useAppStore";
import { radius, shadow } from "../theme";
import { useTheme } from "../theme/theme-context";

const ITEMS = [
  { id: "home", label: "home", href: "/", icon: "home" as const, iconOff: "home-outline" as const },
  { id: "crops", label: "crops", href: "/explore/crops", icon: "leaf" as const, iconOff: "leaf-outline" as const },
  { id: "compare", label: "compare", href: "/explore/compare", icon: "git-compare" as const, iconOff: "git-compare-outline" as const },
  { id: "map", label: "map", href: "/maps", icon: "map" as const, iconOff: "map-outline" as const },
  { id: "more", label: "more", href: "/more", icon: "grid" as const, iconOff: "grid-outline" as const },
] satisfies {
  id: string;
  label: keyof Strings;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOff: keyof typeof Ionicons.glyphMap;
}[];

export function BottomNav({ active }: { active: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = strings(useAppStore((s) => s.language));

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 8,
        paddingHorizontal: 8,
        ...shadow.card,
      }}
    >
      {ITEMS.map((item) => {
        const selected = item.id === active;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t[item.label]}
            onPress={() => router.replace(item.href as never)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center" as const,
              gap: 3,
              minHeight: 52,
              paddingTop: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.primary : "transparent",
                minWidth: 48,
                alignItems: "center",
              }}
            >
              <Ionicons
                name={selected ? item.icon : item.iconOff}
                size={22}
                color={selected ? colors.white : colors.slate500}
              />
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10,
                fontWeight: selected ? "700" : "500",
                color: selected ? colors.primaryStrong : colors.slate500,
                letterSpacing: 0.2,
              }}
            >
              {t[item.label]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
