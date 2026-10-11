import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, SectionHeader } from "../../src/components/ui";
import { strings, type Strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";

/**
 * The Analyze hub: what the tab opens.
 *
 * The tab used to drop straight into the comparison workspace, which made a
 * five-slot destination mean "show me a two-column comparison form". The tab now
 * leads with the four things a reader actually wants to do, and each one is a
 * labelled route. Comparison is one of them, not the whole tab.
 *
 * Every route here already existed, so nothing became unreachable and no screen
 * had to be rebuilt; the deep link parameters are the ones `compare.tsx` already
 * understood (`?mode=crops`, `?mode=districts`).
 */
const ACTIONS: {
  id: keyof Strings;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  desc: string;
}[] = [
  {
    id: "compareCrops",
    href: "/explore/compare?mode=crops",
    icon: "git-compare-outline",
    desc: "Several crops on one shared axis, absolute or indexed.",
  },
  {
    id: "compareDistricts",
    href: "/explore/compare?mode=districts",
    icon: "git-compare-outline",
    desc: "One crop, one period, the same indicator per district.",
  },
  {
    id: "districts",
    href: "/explore/districts",
    icon: "location-outline",
    desc: "Open a district and read its record.",
  },
  {
    id: "indicators",
    href: "/explore/indicators",
    icon: "analytics-outline",
    desc: "Productivity, inputs, irrigation and erosion indicators.",
  },
];

export default function AnalyzeScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));

  return (
    <ScreenLayout active="analyze">
      <SectionHeader title={t.analyze} subtitle={t.compareSubtitle} />
      {ACTIONS.map((action) => (
        <Card
          key={action.id}
          onPress={() => router.push(action.href as never)}
          accessibilityLabel={t[action.id]}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
        >
          <View style={styles.icon}>
            <Ionicons name={action.icon} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.h2}>{t[action.id]}</Text>
            <Text style={typography.caption}>{action.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
        </Card>
      ))}
    </ScreenLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    icon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.mintSoft,
      alignItems: "center",
      justifyContent: "center",
    },
  });
