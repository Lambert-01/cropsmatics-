import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { BottomNav } from "../../src/components/BottomNav";
import { Card, SearchBar, SectionHeader } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";

const SECTIONS = [
  { id: "crops", href: "/explore/crops", icon: "leaf-outline", desc: "Browse every published crop" },
  { id: "districts", href: "/explore/districts", icon: "location-outline", desc: "All 30 districts and their data" },
  { id: "indicators", href: "/explore/indicators", icon: "analytics-outline", desc: "Productivity, inputs, soil, irrigation" },
  { id: "postHarvest", href: "/explore/post-harvest", icon: "cube-outline", desc: "How production is used after harvest" },
  { id: "compare", href: "/explore/compare", icon: "git-compare-outline", desc: "Compare crops or districts" },
  { id: "maps", href: "/maps", icon: "map-outline", desc: "District-level patterns on a map" },
  { id: "dataSources", href: "/more/data-sources", icon: "shield-checkmark-outline", desc: "The official sources behind the numbers" },
] as const;

export default function ExploreScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <SearchBar placeholder={t.searchPlaceholder} onFocus={() => router.push("/explore/search")} />
        <SectionHeader title={t.exploreTitle} subtitle={t.exploreSubtitle} />
        {SECTIONS.map((section) => (
          <Card
            key={section.id}
            onPress={() => router.push(section.href as never)}
            accessibilityLabel={t[section.id as keyof typeof t]}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          >
            <View style={styles.icon}>
              <Ionicons name={section.icon} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h2}>{t[section.id as keyof typeof t]}</Text>
              <Text style={typography.caption}>{section.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
          </Card>
        ))}
      </ScrollView>
      <BottomNav active="explore" />
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
