import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Badge, Card, EmptyState, SectionHeader } from "../../src/components/ui";
import { listInquiryReceipts, updateInquiryReceiptStatus } from "../../src/database";
import { strings } from "../../src/i18n";
import { inquiryApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import type { InquiryReceipt } from "../../src/types";
import { spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";

export default function InquiryHistoryScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const [receipts, setReceipts] = useState<InquiryReceipt[]>(() => {
    try {
      return listInquiryReceipts();
    } catch {
      return [];
    }
  });
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const refresh = async (receipt: InquiryReceipt) => {
    setRefreshing(receipt.id);
    try {
      const status = await inquiryApi.status(receipt.id, receipt.receipt_token);
      updateInquiryReceiptStatus(receipt.id, status.status);
      setReceipts((prev) => prev.map((r) => (r.id === receipt.id ? { ...r, status: status.status } : r)));
    } catch {
      // offline: keep the last known status
    } finally {
      setRefreshing(null);
    }
  };

  return (
    <ScreenLayout back>
      <SectionHeader title={t.inquiryHistory} subtitle={t.inquiryHistorySubtitle} />
      {receipts.length ? (
        receipts.map((receipt) => (
          <Card key={receipt.id} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ ...typography.h3, flex: 1 }}>{receipt.reference}</Text>
              <Badge text={receipt.status} />
            </View>
            <Text style={typography.micro}>
              {t.inquirySubmittedOn.replace("{date}", receipt.created_at?.slice(0, 10) ?? "")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.inquiryRefreshStatus}
              onPress={() => void refresh(receipt)}
              style={styles.refresh}
            >
              <Ionicons name="refresh" size={15} color={colors.primaryStrong} />
              <Text style={styles.refreshText}>
                {refreshing === receipt.id ? t.inquiryChecking : t.inquiryCheckStatus}
              </Text>
            </Pressable>
          </Card>
        ))
      ) : (
        <EmptyState
          title={t.inquiryNoHistory}
          message={t.inquiryHistoryEmptyMessage}
          icon="document-text-outline"
        />
      )}
    </ScreenLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  refresh: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  refreshText: { color: colors.primaryStrong, fontWeight: "600", fontSize: 13 },
});
