import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useAlertsCount } from "../hooks/useAlertsCount";
import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { colors, spacing, touch, typography } from "../theme";
import { BrandMark } from "./BrandMark";

/** A header icon that always meets the minimum touch target. */
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      onPress={onPress}
      hitSlop={8}
      style={{
        minWidth: touch.minTarget,
        minHeight: touch.minTarget,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={22} color={colors.forest} />
      {badge && badge > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 999,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
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

/**
 * Compact analytical header.
 *
 * Brand on the left; global search and the notification bell on the right. The
 * language switch lives in More → Settings and the tagline is gone, so the
 * header no longer competes with the data below it. `showInfo` is kept as the
 * public prop name for the right-hand actions so existing screens keep working.
 *
 * `context` is the optional second row — a compact one-line summary of the
 * active data context, e.g. "Latest published period • National".
 */
export function AppHeader({
  back = false,
  showInfo = true,
  context,
}: {
  back?: boolean;
  showInfo?: boolean;
  context?: string | null;
}) {
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));
  const alertsCount = useAlertsCount();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 52,
        }}
      >
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.back}
            onPress={() => router.back()}
            hitSlop={8}
            style={{
              minWidth: touch.minTarget,
              minHeight: touch.minTarget,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: -spacing.sm,
            }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.forest} />
          </Pressable>
        ) : (
          <BrandMark size={28} />
        )}

        <Text numberOfLines={1} style={{ ...typography.h2, fontSize: 16, flex: 1 }}>
          {t.appName}
        </Text>

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
              badge={alertsCount}
              onPress={() => router.push("/field-operations/alerts")}
            />
          </>
        ) : null}
      </View>

      {context ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.sm,
            marginTop: -2,
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
          <Text numberOfLines={1} style={{ ...typography.micro, flex: 1, color: colors.slate700 }}>
            {context}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
