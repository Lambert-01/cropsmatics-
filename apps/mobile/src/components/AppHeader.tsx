import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { countPendingOutbox } from "../database";
import { SUPPORTED_LANGUAGES, strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { colors, spacing, typography } from "../theme";
import { BrandMark, InitialsAvatar } from "./BrandMark";

export function AppHeader({ back = false }: { back?: boolean }) {
  const router = useRouter();
  const { language, setLanguage } = useAppStore();
  const t = strings(language);
  const [badge, setBadge] = useState(0);

  // Notification badge counts real pending records, not a decorative number.
  useEffect(() => {
    let active = true;
    try {
      if (active) setBadge(countPendingOutbox());
    } catch {
      if (active) setBadge(0);
    }
    return () => {
      active = false;
    };
  }, []);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={colors.forest} />
        </Pressable>
      ) : (
        <BrandMark size={34} />
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...typography.h2, fontSize: 15 }}>
          {t.appName}
        </Text>
        <Text numberOfLines={1} style={{ ...typography.caption, fontSize: 10 }}>
          {t.tagline}
        </Text>
      </View>

      <View style={{ flexDirection: "row", borderRadius: 8, backgroundColor: colors.background }}>
        {SUPPORTED_LANGUAGES.map((item) => (
          <Pressable
            key={item.code}
            accessibilityRole="button"
            accessibilityLabel={`${t.language}: ${item.label}`}
            onPress={() => setLanguage(item.code)}
            style={{
              paddingHorizontal: 7,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: language === item.code ? colors.forest : colors.background,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: language === item.code ? colors.white : colors.slate,
              }}
            >
              {item.code.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.alerts}${badge ? `, ${badge}` : ""}`}
        onPress={() => router.push("/alerts")}
      >
        <View>
          <Ionicons name="notifications-outline" size={21} color={colors.forest} />
          {badge > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                minWidth: 15,
                height: 15,
                paddingHorizontal: 3,
                borderRadius: 8,
                backgroundColor: colors.danger,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.white, fontSize: 9, fontWeight: "700" }}>
                {badge > 9 ? "9+" : badge}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.profile}
        onPress={() => router.push("/profile")}
      >
        <InitialsAvatar size={28} />
      </Pressable>
    </View>
  );
}
