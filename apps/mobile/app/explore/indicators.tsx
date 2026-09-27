import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InfoRow,
  LoadingSkeleton,
  SectionHeader,
  SourceCard,
} from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { indicatorsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Productivity: "trending-up-outline",
  Inputs: "flask-outline",
  Irrigation: "water-outline",
  "Soil & Erosion": "layers-outline",
  "Post-Harvest": "cube-outline",
  Infrastructure: "business-outline",
};

export default function IndicatorsScreen() {
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ id?: string }>();
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["indicators"],
    queryFn: indicatorsApi.list,
  });

  const selected = data?.indicators.find((i) => i.id === params.id) ?? null;

  return (
    <ScreenLayout back active="explore">
      {isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <>
          <LoadingSkeleton height={90} />
          <LoadingSkeleton height={90} />
          <LoadingSkeleton height={90} />
        </>
      ) : (
        <>
          <SectionHeader title={t.indicatorsTitle} subtitle={t.indicatorsSubtitle} />
          <Badge text={`Latest: ${data?.latest_period_label ?? "—"}`} tone="blue" />

          {(data?.categories ?? []).map((category) => {
            const items = (data?.indicators ?? []).filter(
              (i) => i.category === category.label && i.available,
            );
            const expanded = open === category.id || selected?.category === category.label;
            return (
              <Card key={category.id} style={{ gap: spacing.sm }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={category.label}
                  onPress={() => setOpen(expanded ? null : category.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
                >
                  <View style={styles.icon}>
                    <Ionicons name={CATEGORY_ICON[category.label] ?? "analytics-outline"} size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h2}>{category.label}</Text>
                    <Text style={typography.caption}>
                      {category.available_count} available indicator{category.available_count === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.slate300} />
                </Pressable>

                {expanded
                  ? items.map((indicator) => (
                      <View key={indicator.id} style={styles.indicator}>
                        <Text style={typography.h3}>{indicator.label}</Text>
                        <InfoRow label="Unit" value={indicator.unit ?? "—"} />
                        <InfoRow label="Period" value={indicator.period ?? "—"} />
                        <InfoRow label="Coverage" value={indicator.coverage_level ?? "—"} />
                        <InfoRow label="Aggregation" value={indicator.aggregation.replace(/_/g, " ")} />
                        <SourceCard sourceLabel={indicator.source_label} period={indicator.period} coverage={indicator.coverage_level} />
                      </View>
                    ))
                  : null}
              </Card>
            );
          })}

          {!data?.indicators.some((i) => i.available) ? <EmptyState title={t.noDataAvailable} /> : null}
        </>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
});
