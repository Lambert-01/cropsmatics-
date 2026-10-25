import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { PrimaryButton } from "../../src/components/ui";
import { SUPPORTED_LANGUAGES, strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { radius, spacing } from "../../src/theme";
import { useTheme } from "../../src/theme/theme-context";

export default function LanguageScreen() {
  const { colors, typography } = useTheme();
  const router = useRouter();
  const { language, setLanguage, setOnboardingComplete } = useAppStore();
  const t = strings(language);

  const description: Record<string, string> = {
    en: "Explore official agricultural data in English.",
    rw: "Reba amakuru y'ubuhinzi yemewe mu Kinyarwanda.",
    fr: "Explorez les données agricoles officielles en français.",
  };

  return (
    <ScreenLayout back scroll={false}>
      <View style={{ flex: 1, gap: spacing.lg, justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <Ionicons name="language-outline" size={40} color={colors.primary} />
          <Text style={{ ...typography.display, textAlign: "center" }}>{t.chooseLanguage}</Text>
        </View>

        <View style={{ gap: spacing.md }}>
          {SUPPORTED_LANGUAGES.map((item) => {
            const selected = language === item.code;
            return (
              <Pressable
                key={item.code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={item.label}
                onPress={() => setLanguage(item.code)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  borderWidth: 2,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.mintSoft : colors.surface,
                  borderRadius: radius.lg,
                  padding: spacing.md,
                  minHeight: 84,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: selected ? colors.primary : colors.mintSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: selected ? colors.white : colors.primaryStrong, fontWeight: "700", fontSize: 16 }}>
                    {item.code.toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h2}>{item.label}</Text>
                  <Text style={typography.caption}>{description[item.code]}</Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton
          label={t.continueButton}
          icon="arrow-forward"
          onPress={() => {
            setOnboardingComplete(true);
            router.replace("/");
          }}
        />
      </View>
    </ScreenLayout>
  );
}
