import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DonutChart, HorizontalBarChart, LineChart } from "../../../src/components/charts";
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
import { getSavedItem, removeSavedItem, saveItem } from "../../../src/database";
import { strings } from "../../../src/i18n";
import { cropsApi, postHarvestApi } from "../../../src/services/api";
import { useAppStore } from "../../../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../../../src/theme";

type Tab = "overview" | "trends" | "districts" | "postharvest";
type Metric = "yield_kg_ha" | "production_mt" | "harvested_area_ha";

const METRIC_LABEL: Record<Metric, string> = {
  yield_kg_ha: "Yield (kg/ha)",
  production_mt: "Production (t)",
  harvested_area_ha: "Harvested area (ha)",
};

export default function CropDetailScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ cropCode: string }>();
  const slug = params.cropCode;
  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<Metric>("production_mt");
  const [saved, setSaved] = useState(() => {
    try {
      return Boolean(getSavedItem("crop", slug));
    } catch {
      return false;
    }
  });

  const crop = useQuery({ queryKey: ["crop", slug], queryFn: () => cropsApi.get(slug) });
  const name = crop.data?.crop_name;

  const productivity = useQuery({
    queryKey: ["crop-productivity", name],
    queryFn: () => cropsApi.productivity(name as string),
    enabled: Boolean(name),
  });
  const trends = useQuery({
    queryKey: ["crop-trends", name],
    queryFn: () => cropsApi.trends(name as string),
    enabled: Boolean(name),
  });
  const postHarvest = useQuery({
    queryKey: ["crop-postharvest", name],
    queryFn: () => postHarvestApi.summary({ crop: name as string }),
    enabled: Boolean(name) && tab === "postharvest",
  });

  const latest = useMemo(() => {
    const rows = productivity.data?.rows ?? [];
    const withData = rows.filter((r) => r.yield_kg_ha != null || r.production_mt != null);
    return {
      production: withData.reduce((sum, r) => sum + (r.production_mt ?? 0), 0),
      area: withData.reduce((sum, r) => sum + (r.harvested_area_ha ?? 0), 0),
      districts: withData.length,
    };
  }, [productivity.data]);

  const districtRows = useMemo(() => {
    const rows = (productivity.data?.rows ?? []).filter((r) => r[metric] != null);
    return rows
      .map((r) => ({ label: r.district ?? "—", value: r[metric] as number }))
      .sort((a, b) => b.value - a.value);
  }, [productivity.data, metric]);

  const share = postHarvest.data?.crops?.[0];

  if (crop.isError) {
    return (
      <ScreenLayout back active="explore">
        <ErrorState message={t.errorGeneric} onRetry={() => void crop.refetch()} />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout back active="explore">
      {/* Hero */}
      <Card style={{ backgroundColor: colors.mintSoft, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={styles.heroIcon}>
            <Text style={{ fontSize: 30 }}>🌿</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.display}>{crop.data?.crop_name ?? slug}</Text>
            <Text style={typography.caption}>
              {crop.data?.category ?? "—"}
              {crop.data?.kinyarwanda_name ? ` · ${crop.data.kinyarwanda_name}` : ""}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Badge text={crop.data?.crop_code ?? slug} />
          {productivity.data?.period ? <Badge text={productivity.data.period} tone="blue" /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? t.unsaveItem : t.saveItem}
            onPress={() => {
              try {
                if (saved) removeSavedItem("crop", slug);
                else saveItem({ type: "crop", entityKey: slug, title: crop.data?.crop_name ?? slug, subtitle: crop.data?.category });
                setSaved(!saved);
              } catch {
                // device storage unavailable — no crash
              }
            }}
            style={styles.action}
          >
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={17} color={colors.primaryStrong} />
            <Text style={styles.actionText}>{saved ? t.unsaveItem : t.saveItem}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.compare}
            onPress={() => router.push("/explore/compare")}
            style={styles.action}
          >
            <Ionicons name="git-compare-outline" size={17} color={colors.primaryStrong} />
            <Text style={styles.actionText}>{t.compare}</Text>
          </Pressable>
        </View>
      </Card>

      <View style={styles.tabs}>
        {(["overview", "trends", "districts", "postharvest"] as const).map((value) => (
          <FilterChip
            key={value}
            label={value === "postharvest" ? t.postHarvest : t[value === "overview" ? "overview" : value === "trends" ? "trends" : "districts"]}
            selected={tab === value}
            onPress={() => setTab(value)}
          />
        ))}
      </View>

      {tab === "overview" ? (
        productivity.isLoading ? (
          <LoadingSkeleton height={120} />
        ) : (
          <Card>
            <SectionHeader title={t.overview} subtitle={productivity.data?.period ?? undefined} />
            <InfoRow label={t.production} value={latest.production ? `${latest.production.toLocaleString(undefined, { maximumFractionDigits: 0 })} t` : "Not available"} />
            <InfoRow label={t.harvestedArea} value={latest.area ? `${latest.area.toLocaleString(undefined, { maximumFractionDigits: 0 })} ha` : "Not available"} />
            <InfoRow label={t.districts} value={String(latest.districts)} note="with published figures" />
            <SourceCard
              sourceLabel={productivity.data?.provenance?.source_id ?? undefined}
              period={productivity.data?.period ?? undefined}
              coverage="district"
              limitations={productivity.data?.provenance?.limitations}
            />
          </Card>
        )
      ) : null}

      {tab === "trends" ? (
        trends.isLoading ? (
          <LoadingSkeleton height={200} />
        ) : trends.data?.points?.length ? (
          <Card>
            <SectionHeader title={t.trends} subtitle="National series" />
            <LineChart
              values={trends.data.points.map((p) => ({
                label: p.label ?? p.period,
                value: p.values?.production_mt ?? p.values?.yield_mt_ha ?? null,
              }))}
              unit={trends.data.metric_units?.production_mt ?? ""}
            />
            <SourceCard
              sourceLabel={trends.data.provenance?.source_id ?? undefined}
              coverage="national"
              limitations={trends.data.provenance?.limitations}
            />
          </Card>
        ) : (
          <EmptyState title={t.noDataAvailable} icon="trending-up-outline" />
        )
      ) : null}

      {tab === "districts" ? (
        productivity.isLoading ? (
          <LoadingSkeleton height={200} />
        ) : (
          <Card>
            <SectionHeader title={t.districts} subtitle={productivity.data?.period ?? undefined} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {(Object.keys(METRIC_LABEL) as Metric[]).map((key) => (
                <FilterChip key={key} label={METRIC_LABEL[key]} selected={metric === key} onPress={() => setMetric(key)} />
              ))}
            </View>
            {districtRows.length ? (
              <HorizontalBarChart values={districtRows} unit="" maxItems={12} />
            ) : (
              <EmptyState title={t.errorNoDistrictData} message={t.noDataAvailable} />
            )}
          </Card>
        )
      ) : null}

      {tab === "postharvest" ? (
        postHarvest.isLoading ? (
          <LoadingSkeleton height={200} />
        ) : share ? (
          <Card>
            <SectionHeader title={t.useOfProduction} subtitle="National crop-level shares" />
            <DonutChart
              slices={[
                { label: t.sold, value: share.sold_pct, color: colors.primary },
                { label: t.stored, value: share.stored_pct, color: colors.blue },
                { label: t.homeConsumption, value: share.own_consumption_pct, color: colors.amber },
                { label: t.seed, value: share.seeds_pct, color: colors.forest },
                { label: t.losses, value: share.post_harvest_losses_pct, color: colors.danger },
              ]}
            />
            <Text style={typography.micro}>
              National crop-level table for 2025 Season B. It carries no district dimension.
            </Text>
          </Card>
        ) : (
          <EmptyState title={t.noDataAvailable} icon="pie-chart-outline" />
        )
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  heroIcon: {
    width: 58,
    height: 58,
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
