import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MultiSeriesChart } from "../../src/components/charts";
import { DataWarning } from "../../src/components/data-view";
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
import { analyticsApi, indicatorsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, seriesColor, spacing, typography } from "../../src/theme";

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

  // National input/practice adoption trend. Only series the endpoint actually
  // publishes a value for are drawn, so a missing practice never reads as 0%.
  const adoption = useQuery({
    queryKey: ["input-adoption"],
    queryFn: analyticsApi.inputAdoption,
  });
  const adoptionSeries = useMemo(() => {
    const points = adoption.data?.points ?? [];
    const defs = [
      { key: "improved_seed_pct", label: t.improvedSeed },
      { key: "inorganic_fertilizer_pct", label: t.inorganicFertilizer },
      { key: "organic_fertilizer_pct", label: t.organicFertilizer },
      { key: "pesticide_pct", label: t.pesticide },
      { key: "irrigation_pct", label: t.irrigation },
      { key: "anti_erosion_pct", label: t.erosionProtection },
    ];
    return defs
      .map((def, index) => ({
        key: def.key,
        label: def.label,
        color: seriesColor(index),
        points: points.map((point) => ({
          label: point.label ?? point.period,
          value: point.values?.[def.key] ?? null,
        })),
      }))
      .filter((serie) => serie.points.some((point) => point.value !== null));
  }, [adoption.data, t]);

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

          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title={t.inputAdoptionTitle} subtitle={t.inputAdoptionSubtitle} />
            {adoption.isError ? (
              <Text style={typography.caption}>{t.errorGeneric}</Text>
            ) : adoption.isLoading ? (
              <LoadingSkeleton height={220} />
            ) : adoptionSeries.length ? (
              <>
                <MultiSeriesChart
                  series={adoptionSeries}
                  unit="%"
                  height={240}
                  accessibilityLabel={t.inputAdoptionTitle}
                />
                <DataWarning text={t.inputAdoptionNote} tone="slate" />
              </>
            ) : (
              <EmptyState title={t.noDataAvailable} icon="flask-outline" />
            )}
          </Card>

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
                        <InfoRow label={t.sheetUnit} value={indicator.unit ?? "—"} />
                        <InfoRow label={t.sheetPeriod} value={indicator.period ?? "—"} />
                        <InfoRow label={t.sheetCoverage} value={indicator.coverage_level ?? "—"} />
                        <InfoRow label={t.aggregation} value={indicator.aggregation.replace(/_/g, " ")} />
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
