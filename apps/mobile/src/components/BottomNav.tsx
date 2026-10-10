import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { radius, shadow } from "../theme";
import { useTheme } from "../theme/theme-context";
import { normalizeActiveTab, TABS, type TabId } from "../utils/navigation";

/**
 * Five-destination bottom bar: Home, Crops, Analyze, Map, More.
 *
 * The destinations come from `src/utils/navigation`, so the bar, the tests and
 * any future deep-link handling share one definition. Navigation uses
 * `router.replace` so switching tabs never stacks duplicate routes — the tab is
 * a destination, not a push — while detail screens keep their own back stack.
 */

const ICONS: Record<TabId, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  home: { on: "home", off: "home-outline" },
  crops: { on: "leaf", off: "leaf-outline" },
  analyze: { on: "git-compare", off: "git-compare-outline" },
  map: { on: "map", off: "map-outline" },
  more: { on: "grid", off: "grid-outline" },
};

export function BottomNav({ active }: { active: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = strings(useAppStore((s) => s.language));
  const activeId = normalizeActiveTab(active);

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
      {TABS.map((tab) => {
        const selected = tab.id === activeId;
        const icon = ICONS[tab.id];
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t[tab.labelKey]}
            onPress={() => router.replace(tab.href as never)}
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
                name={selected ? icon.on : icon.off}
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
              {t[tab.labelKey]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
