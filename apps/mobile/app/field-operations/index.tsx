import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, ListRow, SectionHeader } from "../../src/components/ui";
import { features } from "../../src/config/features";
import { colors, spacing, typography } from "../../src/theme";

const ITEMS = [
  { title: "Register harvest", href: "/field-operations/register-harvest", icon: "add-circle-outline" as const },
  { title: "Harvest history", href: "/field-operations/harvests", icon: "time-outline" as const },
  { title: "Recommendations", href: "/field-operations/insights", icon: "bar-chart-outline" as const },
  { title: "Harvest risk", href: "/field-operations/harvest-risk", icon: "warning-outline" as const },
  { title: "Storage options", href: "/field-operations/storage-options", icon: "business-outline" as const },
  { title: "Sync", href: "/field-operations/sync", icon: "sync-outline" as const },
  { title: "Alerts", href: "/field-operations/alerts", icon: "notifications-outline" as const },
  { title: "Profile", href: "/field-operations/profile", icon: "person-outline" as const },
  { title: "Share app", href: "/field-operations/share", icon: "share-social-outline" as const },
];

export default function FieldOperationsScreen() {
  const router = useRouter();

  if (!features.fieldOperations) {
    return (
      <ScreenLayout back>
        <Card>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.amber} />
            <Text style={{ ...typography.body, flex: 1 }}>
              Field Operations is disabled in this build. Set EXPO_PUBLIC_ENABLE_FIELD_OPERATIONS=true to enable it.
            </Text>
          </View>
        </Card>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout back>
      <SectionHeader title="Field Operations" subtitle="Secondary tools for field data collection" />
      <Card style={{ paddingVertical: 0 }}>
        {ITEMS.map((item) => (
          <ListRow key={item.href} title={item.title} icon={item.icon} onPress={() => router.push(item.href as never)} />
        ))}
      </Card>
      <Text style={typography.micro}>
        Field Operations records harvests on this device and is separate from the public intelligence experience.
        Location and photos are only requested here.
      </Text>
    </ScreenLayout>
  );
}

