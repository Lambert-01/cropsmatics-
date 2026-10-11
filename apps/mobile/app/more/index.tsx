import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { BottomNav } from "../../src/components/BottomNav";
import { Card, ListRow, SectionHeader } from "../../src/components/ui";
import { features } from "../../src/config/features";
import { strings, type Strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import type { Palette, Typography } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";
import { FIELD_OPERATIONS_ITEM, MENU_GROUPS } from "../../src/utils/menu";

export default function MoreScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));

  const label = (key: keyof Strings): string => t[key];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader showThemeToggle />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <SectionHeader title={t.moreTitle} subtitle={t.tagline} />
        {MENU_GROUPS.map((group) => (
          <View key={group.title} style={{ gap: spacing.sm }}>
            <Text style={styles.groupTitle}>{label(group.title as keyof Strings).toUpperCase()}</Text>
            <Card style={{ paddingVertical: 0 }}>
              {group.items.map((item) => (
                <ListRow
                  key={item.href}
                  title={label(item.label as keyof Strings)}
                  icon={item.icon as keyof typeof Ionicons.glyphMap}
                  onPress={() => router.push(item.href as never)}
                />
              ))}
            </Card>
          </View>
        ))}

        {features.fieldOperations ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.groupTitle}>{t.moreGroupFieldOperations.toUpperCase()}</Text>
            <Card style={{ paddingVertical: 0 }}>
              <ListRow
                title={t.moreFieldOperations}
                icon={FIELD_OPERATIONS_ITEM.icon as keyof typeof Ionicons.glyphMap}
                onPress={() => router.push(FIELD_OPERATIONS_ITEM.href as never)}
              />
            </Card>
          </View>
        ) : null}

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={{ ...typography.caption, flex: 1 }}>{t.moreFooterNote}</Text>
          </View>
        </Card>
      </ScrollView>
      <BottomNav active="more" />
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette, typography: Typography) =>
  StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  groupTitle: { ...typography.micro, fontWeight: "700", letterSpacing: 1, color: colors.slate500 },
});
