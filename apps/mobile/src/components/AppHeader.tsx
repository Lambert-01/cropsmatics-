import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { SUPPORTED_LANGUAGES, strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { colors, spacing, typography } from "../theme";

export function AppHeader({ back = false }: { back?: boolean }) {
  const router = useRouter();
  const { language, setLanguage } = useAppStore();
  const t = strings(language);
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: 12,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.forest} />
        </Pressable>
      ) : (
        <Ionicons name="leaf-outline" size={28} color={colors.brandGreen} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...typography.h2, fontSize: 16 }}>{t.appName}</Text>
        <Text numberOfLines={1} style={{ ...typography.caption, fontSize: 10 }}>{t.tagline}</Text>
      </View>
      <View style={{ flexDirection: "row", borderRadius: 8, backgroundColor: colors.background }}>
        {SUPPORTED_LANGUAGES.map((item) => (
          <Pressable
            key={item.code}
            accessibilityRole="button"
            accessibilityLabel={`${t.language}: ${item.label}`}
            onPress={() => setLanguage(item.code)}
            style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
              backgroundColor: language === item.code ? colors.forest : colors.background }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: language === item.code ? colors.white : colors.slate }}>
              {item.code.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t.alerts} onPress={() => router.push("/alerts")}>
        <Ionicons name="notifications-outline" size={21} color={colors.forest} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.profile} onPress={() => router.push("/profile")}>
        <Ionicons name="person-circle-outline" size={23} color={colors.forest} />
      </Pressable>
    </View>
  );
}
