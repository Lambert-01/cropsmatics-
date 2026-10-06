import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { radius, spacing, toggledAppearance, touch } from "../theme";
import { useTheme } from "../theme/theme-context";
import { BrandMark } from "./BrandMark";

function HeaderAction({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        minWidth: touch.minTarget,
        minHeight: touch.minTarget,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.md,
          backgroundColor: colors.mintSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={colors.primaryStrong} />
      </View>
      {badge && badge > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 3,
            borderRadius: 999,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.white, fontSize: 9, fontWeight: "800" }}>
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function AppHeader({
  back = false,
  showInfo = true,
  context,
  showThemeToggle = false,
}: {
  back?: boolean;
  showInfo?: boolean;
  context?: string | null;
  /**
   * Render a one-tap light/dark toggle. Off by default so existing screens are
   * unchanged; the More screen opts in. Hidden when dark mode is unavailable in
   * the build, because a control that does nothing is worse than no control.
   */
  showThemeToggle?: boolean;
}) {
  const { colors, typography, mode, available } = useTheme();
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));
  const updateSettings = useAppStore((state) => state.updateSettings);

  const themeToggle = showThemeToggle && available;
  const toggleTheme = () => updateSettings({ appearance: toggledAppearance(mode) });

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        shadowColor: colors.forestDeep,
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          minHeight: 56,
        }}
      >
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.back}
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: radius.md,
              backgroundColor: colors.mintSoft,
              alignItems: "center" as const,
              justifyContent: "center" as const,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primaryStrong} />
          </Pressable>
        ) : (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.md,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BrandMark size={22} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={{ ...typography.h2, fontSize: 17, letterSpacing: -0.3 }}>
            {t.appName}
          </Text>
          {context ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.primary,
                }}
              />
              <Text
                numberOfLines={1}
                style={{ ...typography.micro, color: colors.slate700, flex: 1 }}
              >
                {context}
              </Text>
            </View>
          ) : null}
        </View>

        {showInfo || themeToggle ? (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {themeToggle ? (
              <HeaderAction
                // The icon shows the mode you would switch *to*.
                icon={mode === "dark" ? "sunny-outline" : "moon-outline"}
                label={mode === "dark" ? t.appearanceLight : t.appearanceDark}
                onPress={toggleTheme}
              />
            ) : null}
            {showInfo ? (
              <>
                <HeaderAction
                  icon="search-outline"
                  label={t.search}
                  onPress={() => router.push("/explore/search")}
                />
                <HeaderAction
                  icon="notifications-outline"
                  label={t.alerts}
                  onPress={() => router.push("/field-operations/alerts")}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
