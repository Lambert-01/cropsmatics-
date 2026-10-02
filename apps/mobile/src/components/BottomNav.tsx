import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "../i18n";
import type { Strings } from "../i18n/en";
import { useAppStore } from "../store/useAppStore";
import { useTheme } from "../theme/theme-context";

/**
 * Primary navigation.
 *
 * Home leads with national intelligence; Crops and Compare are the analytical
 * watchlist and workspace; Map is district intelligence; More holds everything
 * else (Ask, Saved, Field Operations, Settings). Alerts live in the header bell
 * rather than a tab, so they stay contextual instead of a permanent destination.
 */
const ITEMS = [
  { id: "home", label: "home", href: "/", icon: "home-outline" as const },
  { id: "crops", label: "crops", href: "/explore/crops", icon: "leaf-outline" as const },
  { id: "compare", label: "compare", href: "/explore/compare", icon: "git-compare-outline" as const },
  { id: "map", label: "map", href: "/maps", icon: "map-outline" as const },
  { id: "more", label: "more", href: "/more", icon: "grid-outline" as const },
] satisfies {
  id: string;
  label: keyof Strings;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
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
        paddingBottom: Math.max(insets.bottom, 6),
        paddingTop: 6,
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
            style={{ flex: 1, alignItems: "center", gap: 3, minHeight: 48, paddingTop: 4 }}
          >
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: selected ? colors.mint : "transparent",
              }}
            >
              <Ionicons name={item.icon} size={21} color={selected ? colors.primary : colors.slate500} />
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                fontWeight: selected ? "700" : "500",
                color: selected ? colors.primary : colors.slate500,
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
