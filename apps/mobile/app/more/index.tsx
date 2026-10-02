import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { BottomNav } from "../../src/components/BottomNav";
import { Card, ListRow, SectionHeader } from "../../src/components/ui";
import { features } from "../../src/config/features";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

const GROUPS = [
  {
    title: "Explore data",
    items: [
      { label: "explore", href: "/explore", icon: "compass-outline" as const },
      { label: "askCropmatics", href: "/ask", icon: "chatbubble-ellipses-outline" as const },
    ],
  },
  {
    title: "My information",
    items: [
      { label: "savedItems", href: "/saved", icon: "bookmark-outline" as const },
      { label: "askHistory", href: "/ask/history", icon: "time-outline" as const },
      { label: "myInquiries", href: "/inquiry/history", icon: "document-text-outline" as const },
      { label: "inquiryTitle", href: "/inquiry/new", icon: "mail-outline" as const },
    ],
  },
  {
    title: "Cropmatics",
    items: [
      { label: "dataSources", href: "/more/data-sources", icon: "shield-checkmark-outline" as const },
      { label: "methodology" as never, href: "/more/methodology", icon: "flask-outline" as const },
      { label: "settings", href: "/more/settings", icon: "settings-outline" as const },
      { label: "help", href: "/more/help", icon: "help-circle-outline" as const },
    ],
  },
  {
    title: "About",
    items: [
      { label: "aboutCropmatics", href: "/more/about", icon: "information-circle-outline" as const },
      { label: "privacy", href: "/more/privacy", icon: "lock-closed-outline" as const },
    ],
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));

  const label = (key: string): string => {
    if (key === "methodology") return "Methodology";
    return (t as Record<string, string>)[key] ?? key;
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <SectionHeader title={t.moreTitle} subtitle={t.tagline} />
        {GROUPS.map((group) => (
          <View key={group.title} style={{ gap: spacing.sm }}>
            <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
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
            <Text style={styles.groupTitle}>FIELD OPERATIONS</Text>
            <Card style={{ paddingVertical: 0 }}>
              <ListRow title="Field operations" icon="leaf-outline" onPress={() => router.push("/field-operations")} />
            </Card>
          </View>
        ) : null}

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={{ ...typography.caption, flex: 1 }}>
              Cropmatics transforms Rwanda's official agricultural data into information anyone can explore.
            </Text>
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
