import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Badge, Card, PrimaryButton, SecondaryButton } from "../../src/components/ui";
import { listInquiryReceipts } from "../../src/database";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

export default function InquirySuccessScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ id?: string }>();

  const receipt = useMemo(() => {
    try {
      return listInquiryReceipts().find((r) => r.id === params.id) ?? listInquiryReceipts()[0] ?? null;
    } catch {
      return null;
    }
  }, [params.id]);

  return (
    <ScreenLayout back scroll={false}>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.lg }}>
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <View style={styles.icon}>
            <Ionicons name="checkmark-circle" size={44} color={colors.primary} />
          </View>
          <Text style={typography.display}>{t.inquirySuccess}</Text>
        </View>

        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ ...typography.h3, flex: 1 }}>{t.inquiryReferenceNumber}</Text>
            <Badge text={receipt?.status ?? "RECEIVED"} />
          </View>
          <Text style={styles.reference}>{receipt?.reference ?? "—"}</Text>
          <Text style={typography.caption}>{t.inquiryReceiptNote}</Text>
        </Card>

        <PrimaryButton label={t.inquiryHistory} icon="time-outline" onPress={() => router.replace("/inquiry/history")} />
        <SecondaryButton label={t.home} icon="home-outline" onPress={() => router.replace("/")} />
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  reference: { fontSize: 24, fontWeight: "700", color: colors.forestDeep, letterSpacing: 1 },
});
