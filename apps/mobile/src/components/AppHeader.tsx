import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { SUPPORTED_LANGUAGES, strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { colors, spacing, typography } from "../theme";
import { BrandMark } from "./BrandMark";

export function AppHeader({ back = false, showInfo = true }: { back?: boolean; showInfo?: boolean }) {
  const router = useRouter();
  const { language, setLanguage } = useAppStore();
  const t = strings(language);

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
        <Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.forest} />
        </Pressable>
      ) : (
        <BrandMark size={32} />
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
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: language === item.code ? colors.forest : colors.background,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: language === item.code ? colors.white : colors.slate700,
              }}
            >
              {item.code.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {showInfo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.aboutCropmatics}
          onPress={() => router.push("/more/about")}
          hitSlop={6}
        >
          <Ionicons name="information-circle-outline" size={22} color={colors.forest} />
        </Pressable>
      ) : null}
    </View>
  );
}
