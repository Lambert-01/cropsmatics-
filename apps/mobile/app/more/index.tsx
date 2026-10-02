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
import { colors, spacing, typography } from "../../src/theme";

const GROUPS: { title: keyof Strings; items: { label: keyof Strings; href: string; icon: keyof typeof Ionicons.glyphMap }[] }[] = [
  {
    title: "moreGroupExploreData",
    items: [
      { label: "explore", href: "/explore", icon: "compass-outline" },
      { label: "askCropmatics", href: "/ask", icon: "chatbubble-ellipses-outline" },
    ],
  },
  {
    title: "moreGroupMyInformation",
    items: [
      { label: "savedItems", href: "/saved", icon: "bookmark-outline" },
      { label: "askHistory", href: "/ask/history", icon: "time-outline" },
      { label: "myInquiries", href: "/inquiry/history", icon: "document-text-outline" },
      { label: "inquiryTitle", href: "/inquiry/new", icon: "mail-outline" },
    ],
  },
  {
    title: "moreGroupCropmatics",
    items: [
      { label: "dataSources", href: "/more/data-sources", icon: "shield-checkmark-outline" },
      { label: "methodologyTitle", href: "/more/methodology", icon: "flask-outline" },
      { label: "settings", href: "/more/settings", icon: "settings-outline" },
      { label: "help", href: "/more/help", icon: "help-circle-outline" },
    ],
  },
  {
    title: "moreGroupAbout",
    items: [
      { label: "aboutCropmatics", href: "/more/about", icon: "information-circle-outline" },
      { label: "privacy", href: "/more/privacy", icon: "lock-closed-outline" },
    ],
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));

  const label = (key: keyof Strings): string => t[key];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <SectionHeader title={t.moreTitle} subtitle={t.tagline} />
        {GROUPS.map((group) => (
          <View key={group.title} style={{ gap: spacing.sm }}>
            <Text style={styles.groupTitle}>{t[group.title].toUpperCase()}</Text>
            <Card style={{ paddingVertical: 0 }}>
              {group.items.map((item) => (
                <ListRow
                  key={item.href}
                  title={label(item.label)}
                  icon={item.icon}
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
              <ListRow title={t.moreFieldOperations} icon="leaf-outline" onPress={() => router.push("/field-operations")} />
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

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  groupTitle: { ...typography.micro, fontWeight: "700", letterSpacing: 1, color: colors.slate500 },
});
