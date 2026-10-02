import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, ListRow, SectionHeader } from "../../src/components/ui";
import { features } from "../../src/config/features";
import { strings, type Strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

const ITEMS: { title: keyof Strings; href: string; icon: "add-circle-outline" | "time-outline" | "bar-chart-outline" | "warning-outline" | "business-outline" | "sync-outline" | "notifications-outline" | "person-outline" | "share-social-outline" }[] = [
  { title: "registerHarvest", href: "/field-operations/register-harvest", icon: "add-circle-outline" },
  { title: "harvestHistory", href: "/field-operations/harvests", icon: "time-outline" },
  { title: "recommendations", href: "/field-operations/insights", icon: "bar-chart-outline" },
  { title: "harvestRisk", href: "/field-operations/harvest-risk", icon: "warning-outline" },
  { title: "storageOptions", href: "/field-operations/storage-options", icon: "business-outline" },
  { title: "sync", href: "/field-operations/sync", icon: "sync-outline" },
  { title: "alerts", href: "/field-operations/alerts", icon: "notifications-outline" },
  { title: "profile", href: "/field-operations/profile", icon: "person-outline" },
  { title: "shareApp", href: "/field-operations/share", icon: "share-social-outline" },
];

export default function FieldOperationsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));

  if (!features.fieldOperations) {
    return (
      <ScreenLayout back>
        <Card>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.amber} />
            <Text style={{ ...typography.body, flex: 1 }}>{t.fieldOperationsDisabled}</Text>
          </View>
        </Card>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout back>
      <SectionHeader title={t.fieldOperationsTitle} subtitle={t.fieldOperationsSubtitle} />
      <Card style={{ paddingVertical: 0 }}>
        {ITEMS.map((item) => (
          <ListRow key={item.href} title={t[item.title]} icon={item.icon} onPress={() => router.push(item.href as never)} />
        ))}
      </Card>
      <Text style={typography.micro}>{t.fieldOperationsFooter}</Text>
    </ScreenLayout>
  );
}

