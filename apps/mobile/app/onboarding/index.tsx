import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandMark } from "../../src/components/BrandMark";
import { PrimaryButton } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

export default function OnboardingScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [slide, setSlide] = useState(0);

  const slides = [
    {
      icon: "leaf-outline" as const,
      title: t.appName,
      subtitle: "Rwanda Agricultural Intelligence in Your Pocket",
      body: t.onboardingDescription,
    },
    {
      icon: "analytics-outline" as const,
      title: t.heroTitle,
      subtitle: null,
      bullets: [t.exploreData, t.compare, t.trends],
      body: t.onboardingDescription,
    },
    {
      icon: "chatbubble-ellipses-outline" as const,
      title: t.askCropmatics,
      subtitle: "Ask. Explore. Understand.",
      body: t.askSubtitle,
    },
  ];

  const current = slides[slide];
  const isLast = slide === slides.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top", "bottom"]}>
      <View style={styles.progress}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[styles.dot, index === slide ? styles.dotActive : null]}
          />
        ))}
      </View>

      <ImageBackground
        source={require("../../assets/images/rwanda-farm-hero-mobile.jpg")}
        resizeMode="cover"
        style={styles.hero}
        imageStyle={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
      >
        <View style={styles.heroOverlay}>
          <BrandMark size={64} />
        </View>
      </ImageBackground>

      <View style={styles.body}>
        <Text style={styles.title}>{current.title}</Text>
        {current.subtitle ? <Text style={styles.subtitle}>{current.subtitle}</Text> : null}
        <Text style={typography.body}>{current.body}</Text>

        {"bullets" in current && current.bullets ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {current.bullets.map((item) => (
              <View key={item} style={styles.bullet}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={{ ...typography.body, flex: 1 }}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        {!isLast ? (
          <>
            <PrimaryButton label={t.continueButton} onPress={() => setSlide((s) => s + 1)} icon="arrow-forward" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.chooseLanguage}
              onPress={() => router.push("/onboarding/language")}
              style={styles.skip}
            >
              <Text style={styles.skipText}>{t.chooseLanguage}</Text>
            </Pressable>
          </>
        ) : (
          <PrimaryButton label={t.chooseLanguage} onPress={() => router.push("/onboarding/language")} icon="language-outline" />
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {slide > 0 ? (
            <View style={{ flex: 1 }}>
              <PrimaryButton label={t.back} onPress={() => setSlide((s) => s - 1)} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <PrimaryButton label={t.skip} onPress={() => router.replace("/")} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: 6, justifyContent: "center", paddingVertical: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 22 },
  hero: { height: 200, justifyContent: "center", alignItems: "center" },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,45,35,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  title: { ...typography.display },
  subtitle: { ...typography.h3, color: colors.primaryStrong },
  bullet: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footer: { padding: spacing.lg, gap: spacing.md },
  skip: { alignItems: "center", paddingVertical: 6 },
  skipText: { color: colors.slate500, fontSize: 14 },
});
