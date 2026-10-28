import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { radius, shadow } from "../theme";
import { useTheme } from "../theme/theme-context";
import {
  activeTabForSegments,
  normalizeActiveTab,
  TABS,
  type TabId,
} from "../utils/navigation";

/**
 * Five-destination bottom bar: Home, Crops, Insights, Map, Ask.
 *
 * The destinations come from `src/utils/navigation`, so the bar, the tests and
 * any future deep-link handling share one definition. Navigation uses
 * `router.replace` so switching tabs never stacks duplicate routes — the tab is
 * a destination, not a push — while detail screens keep their own back stack.
 *
 * Ask is a destination because the assistant is a way into the data, not a
 * settings item. More is not: it is a menu in the header, so nothing that used to
 * sit behind it became unreachable (see `MENU_ROOTS`).
 */

const ICONS: Record<TabId, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  home: { on: "home", off: "home-outline" },
  crops: { on: "leaf", off: "leaf-outline" },
  analyze: { on: "analytics", off: "analytics-outline" },
  map: { on: "map", off: "map-outline" },
  ask: { on: "chatbubbles", off: "chatbubbles-outline" },
};

export function BottomNav({ active }: { active?: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const t = strings(useAppStore((s) => s.language));
  // A screen may name its own tab; when that id is not a destination (a menu
  // screen, a field-operations form), the current route decides. Hard-coded ids
  // go stale silently - the route cannot.
  const activeId = normalizeActiveTab(active) ?? activeTabForSegments(segments as string[]);

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
