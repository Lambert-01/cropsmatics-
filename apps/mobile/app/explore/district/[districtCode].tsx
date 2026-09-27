import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HorizontalBarChart } from "../../../src/components/charts";
import { ScreenLayout } from "../../../src/components/ScreenLayout";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FilterChip,
  InfoRow,
  LoadingSkeleton,
  SectionHeader,
  SourceCard,
} from "../../../src/components/ui";
import { districtsApi } from "../../../src/services/api";
import type { MetricValue } from "../../../src/services/api/districts";
import { getSavedItem, removeSavedItem, saveItem } from "../../../src/database";
import { strings } from "../../../src/i18n";
import { useAppStore } from "../../../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../../../src/theme";

type Tab = "overview" | "crops" | "inputs" | "land";
type Metric = "production_mt" | "harvested_area_ha";

function percentRows(items: MetricValue[]) {
  return items
    .filter((m) => m.value != null)
    .map((m) => ({ label: m.label, value: m.value as number }));
}

export default function DistrictDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ districtCode: string }>();
  const slug = params.districtCode;
  const t = strings(useAppStore((s) => s.language));
  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<Metric>("production_mt");
  const [saved, setSaved] = useState(() => {
    try {
      return Boolean(getSavedItem("district", slug));
    } catch {
      return false;
    }
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["district-profile", slug],
    queryFn: () => districtsApi.profile(slug),
  });

  if (isError) {
    return (
      <ScreenLayout back active="explore">
        <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
      </ScreenLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <ScreenLayout back active="explore">
        <LoadingSkeleton height={120} />
        <LoadingSkeleton height={200} />
      </ScreenLayout>
    );
  }

  const cropRows = data.crops
    .filter((c) => c[metric] != null)
    .map((c) => ({ label: c.crop, value: c[metric] as number }))
    .sort((a, b) => b.value - a.value);

  return (
    <ScreenLayout back active="explore">
      <Card style={{ backgroundColor: colors.mintSoft }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={styles.heroIcon}>
            <Ionicons name="location" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.display}>{data.district}</Text>
            <Text style={typography.caption}>
              {data.province ?? "—"}
              {data.agro_ecological_zone ? ` · ${data.agro_ecological_zone}` : ""}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Badge text={data.district_code} />
          <Badge text={data.period_label ?? "—"} tone="blue" />
          <Badge text={`${data.n_crops_with_data} crops`} tone="slate" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? t.unsaveItem : t.saveItem}
            onPress={() => {
              try {
                if (saved) removeSavedItem("district", slug);
                else saveItem({ type: "district", entityKey: slug, title: data.district, subtitle: data.province });
                setSaved(!saved);
              } catch {
                // device storage unavailable
              }
            }}
            style={styles.action}
          >
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={17} color={colors.primaryStrong} />
            <Text style={styles.actionText}>{saved ? t.unsaveItem : t.saveItem}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.viewDistrictDetails}
            onPress={() => router.push(("/maps/district/" + data.district_code) as never)}
            style={styles.action}
          >
            <Ionicons name="map-outline" size={17} color={colors.primaryStrong} />
            <Text style={styles.actionText}>{t.maps}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.compareDistrict}
            onPress={() => router.push("/explore/compare")}
            style={styles.action}
          >
            <Ionicons name="git-compare-outline" size={17} color={colors.primaryStrong} />
            <Text style={styles.actionText}>{t.compare}</Text>
          </Pressable>
        </View>
      </Card>

      <View style={styles.tabs}>
        {(["overview", "crops", "inputs", "land"] as const).map((value) => (
          <FilterChip
            key={value}
            label={
              value === "overview"
                ? t.overview
                : value === "crops"
                  ? t.topCrops
                  : value === "inputs"
                    ? t.inputs
                    : t.soilErosion
            }
            selected={tab === value}
            onPress={() => setTab(value)}
          />
        ))}
      </View>

      {tab === "overview" ? (
        <Card>
          <SectionHeader title={t.overview} subtitle={data.period_label ?? undefined} />
          <InfoRow label={t.topCrops} value={String(data.n_crops_with_data)} note="crops with published data" />
          <InfoRow label="Largest production crop" value={data.largest_production_crops[0]?.crop ?? "Not available"} />
          <Text style={typography.caption}>
            Choose a crop to inspect crop-specific yield. A single average yield is not shown because crops have
            different natural yield scales.
          </Text>
          <SourceCard
            sourceLabel={data.provenance.source_id ?? undefined}
            period={data.period_label ?? undefined}
            coverage="district"
            limitations={data.provenance.limitations}
          />
        </Card>
      ) : null}

      {tab === "crops" ? (
        <Card>
          <SectionHeader title={t.topCrops} subtitle={data.period_label ?? undefined} />
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <FilterChip label={t.production} selected={metric === "production_mt"} onPress={() => setMetric("production_mt")} />
            <FilterChip label={t.harvestedArea} selected={metric === "harvested_area_ha"} onPress={() => setMetric("harvested_area_ha")} />
          </View>
          {cropRows.length ? (
            <HorizontalBarChart values={cropRows} unit={metric === "production_mt" ? "t" : "ha"} />
          ) : (
            <EmptyState title={t.noDataAvailable} icon="leaf-outline" />
          )}
        </Card>
      ) : null}

      {tab === "inputs" ? (
        <Card>
          <SectionHeader title={t.inputs} subtitle="Share of farmers reporting adoption" />
          {percentRows(data.factors).length ? (
            <HorizontalBarChart values={percentRows(data.factors)} unit="%" maxItems={10} />
          ) : (
            <EmptyState title={t.noDataAvailable} />
          )}
          <Text style={typography.micro}>These are shares of farmers, not of cultivated area.</Text>
        </Card>
      ) : null}

      {tab === "land" ? (
        <>
          <Card>
            <SectionHeader title={t.irrigation} subtitle="Irrigation methods and water sources" />
            {percentRows(data.irrigation.methods).length ? (
              <HorizontalBarChart values={percentRows(data.irrigation.methods)} unit="%" />
            ) : (
              <EmptyState title={t.noDataAvailable} />
            )}
            {percentRows(data.irrigation.sources).length ? (
              <HorizontalBarChart values={percentRows(data.irrigation.sources)} unit="%" />
            ) : null}
          </Card>
          <Card>
            <SectionHeader title={t.soilErosion} subtitle="Land use and erosion-control practices" />
            {data.land.filter((l) => l.value != null).length ? (
              <HorizontalBarChart
                values={data.land.filter((l) => l.value != null).map((l) => ({ label: l.label, value: l.value as number }))}
                unit=""
              />
            ) : null}
            {percentRows(data.erosion).length ? (
              <HorizontalBarChart values={percentRows(data.erosion)} unit="%" />
            ) : (
              <EmptyState title={t.noDataAvailable} />
            )}
          </Card>
          <SourceCard
            sourceLabel={data.provenance.source_id ?? undefined}
            period={data.period_label ?? undefined}
            coverage="district"
            limitations={data.provenance.limitations}
          />
        </>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { color: colors.primaryStrong, fontWeight: "600", fontSize: 13 },
});
