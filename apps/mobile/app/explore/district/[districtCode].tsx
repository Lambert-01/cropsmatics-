import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FactorAssociation } from "../../../src/components/analytics/FactorAssociation";
import { HorizontalBarChart, TimeSeriesChart } from "../../../src/components/charts";
import {
  ChangeIndicator,
  CoverageBadge,
  DataSection,
  DataWarning,
  MetricReadout,
  PeriodSelector,
  SourceMethodSheet,
} from "../../../src/components/data-view";
import { ScreenLayout } from "../../../src/components/ScreenLayout";
import { EmptyState, ErrorState, FilterChip, LoadingSkeleton } from "../../../src/components/ui";
import { PANEL_UNITS } from "../../../src/constants/metrics";
import { getSavedItem, removeSavedItem, saveItem } from "../../../src/database";
import { usePeriods } from "../../../src/hooks/queries";
import { strings } from "../../../src/i18n";
import { analyticsApi, districtsApi, mapsApi } from "../../../src/services/api";
import type { MetricValue } from "../../../src/services/api/districts";
import { useAppStore } from "../../../src/store/useAppStore";
import { chart, radius, spacing } from "../../../src/theme";
import type { Palette } from "../../../src/theme";
import { useThemedStyles, useTheme } from "../../../src/theme/theme-context";
import { changeFromApi, fromPeriodCoded, toSeriesPoints } from "../../../src/utils/analytics";
import { periodsCarryingLayer } from "../../../src/utils/coverage";

type Tab = "production" | "inputs" | "land";

export default function DistrictDetailScreen() {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ districtCode: string }>();
  const slug = params.districtCode;
  const t = strings(useAppStore((s) => s.language));

  const [tab, setTab] = useState<Tab>("production");
  const [crop, setCrop] = useState<string | null>(null);
  const [periodCode, setPeriodCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => {
    try {
      return Boolean(getSavedItem("district", slug));
    } catch {
      return false;
    }
  });

  const profile = useQuery({
    queryKey: ["district-profile", slug],
    queryFn: () => districtsApi.profile(slug),
  });
  const periods = usePeriods();

  const districtPeriods = periodsCarryingLayer(periods.data?.periods ?? [], "yield");
  const activePeriod =
    periodCode ?? periods.data?.latest_district ?? districtPeriods[districtPeriods.length - 1]?.period_code ?? null;

  // The canonical panel is the period-aware source: one request returns every
  // crop this district published for the selected period.
  const panel = useQuery({
    queryKey: ["district-panel", slug, activePeriod],
    queryFn: () => analyticsApi.productivity({ district: slug, periodCode: activePeriod ?? undefined }),
    enabled: Boolean(slug),
  });

  // Rows are typed from `PeriodProductivityResponse`; no cast is needed.
  const rows = useMemo(() => panel.data?.rows ?? [], [panel.data]);
  const districtCode = rows.find((row) => row.district_code)?.district_code ?? profile.data?.district_code ?? null;

  // Default to the crop that carries the most production in this period, which
  // is a published fact rather than a preference.
  useEffect(() => {
    if (crop) return;
    const best = [...rows]
      .filter((row) => row.production_mt !== null && row.production_mt !== undefined)
      .sort((a, b) => (b.production_mt as number) - (a.production_mt as number))[0];
    const fallback = rows.find((row) => row.canonical_crop_name)?.canonical_crop_name;
    if (best?.canonical_crop_name) setCrop(best.canonical_crop_name);
    else if (fallback) setCrop(fallback);
  }, [rows, crop]);

  const selectedRow = rows.find((row) => row.canonical_crop_name === crop) ?? null;

  const cropSeries = useQuery({
    queryKey: ["district-crop-series", crop, slug],
    queryFn: () => analyticsApi.periodTrend({ crop: crop as string, district: slug }),
    enabled: Boolean(crop),
  });

  const gapLayer = useQuery({
    queryKey: ["district-gap", districtCode ?? slug, crop, activePeriod],
    queryFn: () =>
      mapsApi.districtMetrics({ metric: "gap", crop: crop as string, periodCode: activePeriod ?? undefined }),
    enabled: Boolean(crop),
  });

  // Associations for the selected crop. The coefficient is estimated across all
  // districts (a single district has no cross-district variation), so the screen
  // labels the scope explicitly rather than implying a district-local effect.
  const factors = useQuery({
    queryKey: ["district-crop-factors", crop],
    queryFn: () => analyticsApi.factors({ crop: crop as string }),
    enabled: Boolean(crop),
  });

  const benchmark = useMemo(() => {
    const entry = gapLayer.data?.districts.find(
      (row) => row.district_code === districtCode || row.district === profile.data?.district,
    );
    return entry?.details ?? null;
  }, [gapLayer.data, districtCode, profile.data]);

  const cropSeriesRaw = useMemo(() => fromPeriodCoded(cropSeries.data?.points ?? []), [cropSeries.data]);
  const yieldSeries = useMemo(() => toSeriesPoints(cropSeriesRaw, "yield_kg_ha"), [cropSeriesRaw]);
  // The same-season delta is computed by the Python service (same eligibility
  // rules as Home and the Crop Terminal); the client never re-derives it.
  const yieldChange = changeFromApi(cropSeries.data?.change);

  if (profile.isError) {
    return (
      <ScreenLayout back active="explore">
        <ErrorState message={t.errorGeneric} onRetry={() => void profile.refetch()} />
      </ScreenLayout>
    );
  }

  if (profile.isLoading || !profile.data) {
    return (
      <ScreenLayout back active="explore">
        <LoadingSkeleton height={120} />
        <LoadingSkeleton height={200} />
      </ScreenLayout>
    );
  }

  const data = profile.data;

  return (
    <ScreenLayout back active="explore">
      {/* Identity */}
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={typography.display}>{data.district}</Text>
            <Text style={typography.caption}>
              {[data.province, data.agro_ecological_zone].filter(Boolean).join(" · ") || "—"}
            </Text>
          </View>
          <Text style={typography.micro}>{data.district_code}</Text>
        </View>

        <CoverageBadge
          level="district"
          period={panel.data?.label ?? activePeriod}
          source={panel.data?.provenance?.source_id ?? null}
        />

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Action
            icon={saved ? "bookmark" : "bookmark-outline"}
            label={saved ? t.unsaveItem : t.saveItem}
            onPress={() => {
              try {
                if (saved) removeSavedItem("district", slug);
                else saveItem({ type: "district", entityKey: slug, title: data.district, subtitle: data.province });
                setSaved(!saved);
              } catch {
                // device storage unavailable
              }
            }}
          />
          <Action
            icon="map-outline"
            label={t.maps}
            onPress={() => router.push({ pathname: "/maps", params: { district: data.district } })}
          />
          <Action
            icon="git-compare-outline"
            label={t.compare}
            onPress={() => router.push({ pathname: "/explore/compare", params: { crop: crop ?? undefined } })}
          />
          <Action
            icon="chatbubble-ellipses-outline"
            label={t.ask}
            onPress={() =>
              router.push({
                pathname: "/ask",
                params: { q: `What does the published data show for ${data.district} district?` },
              })
            }
          />
        </View>
      </View>

      <View style={styles.tabs}>
        <FilterChip label={t.production} selected={tab === "production"} onPress={() => setTab("production")} />
        <FilterChip label={t.inputs} selected={tab === "inputs"} onPress={() => setTab("inputs")} />
        <FilterChip label={t.soilErosion} selected={tab === "land"} onPress={() => setTab("land")} />
      </View>

      {tab === "production" ? (
        <>
          <DataSection title={t.topCrops} subtitle={t.selectCrop} first>
            <PeriodSelector
              label={t.selectPeriod}
              value={activePeriod}
              onChange={setPeriodCode}
              options={districtPeriods.map((period) => ({
                id: period.period_code,
                label: period.label,
                hint: `${period.n_crops} crops`,
              }))}
            />

            {periods.isError ? (
              <ErrorState
                message={t.errorGeneric}
                onRetry={() => void periods.refetch()}
              />
            ) : panel.isError ? (
              <ErrorState message={t.errorGeneric} onRetry={() => void panel.refetch()} />
            ) : panel.isLoading ? (
              <LoadingSkeleton height={160} />
            ) : rows.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm, alignItems: "center" }}
              >
                {rows
                  .filter((row) => row.canonical_crop_name)
                  .map((row) => (
                    <FilterChip
                      key={row.crop_code ?? row.canonical_crop_name ?? ""}
                      label={row.canonical_crop_name as string}
                      selected={crop === row.canonical_crop_name}
                      onPress={() => setCrop(row.canonical_crop_name as string)}
                    />
                  ))}
              </ScrollView>
            ) : (
              <EmptyState title={t.errorNoDistrictData} message={t.noDataAvailable} />
            )}
          </DataSection>

          {selectedRow ? (
            <DataSection title={crop ?? ""} subtitle={panel.data?.label ?? undefined}>
              <View style={styles.readouts}>
                <MetricReadout
                  label={t.metricYield}
                  value={selectedRow.yield_kg_ha ?? null}
                  unit={PANEL_UNITS.yield_kg_ha}
                  size="medium"
                />
                <MetricReadout
                  label={t.metricProduction}
                  value={selectedRow.production_mt ?? null}
                  unit={PANEL_UNITS.production_mt}
                  size="medium"
                />
                <MetricReadout
                  label={t.metricArea}
                  value={selectedRow.harvested_area_ha ?? null}
                  unit={PANEL_UNITS.harvested_area_ha}
                  size="medium"
                />
              </View>

              {benchmark?.benchmark_yield_kg_ha != null ? (
                <View style={styles.readouts}>
                  <MetricReadout
                    label={t.metricGap}
                    value={benchmark.gap_index ?? null}
                    unit="%"
                    size="medium"
                    note={
                      benchmark.benchmark_yield_kg_ha != null
                        ? `benchmark ${Math.round(benchmark.benchmark_yield_kg_ha).toLocaleString()} kg/ha for this crop`
                        : null
                    }
                  />
                </View>
              ) : (
                <Text style={typography.micro}>{t.districtNoBenchmark}</Text>
              )}

              {cropSeries.isError ? (
                <ErrorState message={t.errorGeneric} onRetry={() => void cropSeries.refetch()} />
              ) : cropSeries.isLoading ? (
                <LoadingSkeleton height={chart.height} />
              ) : yieldSeries.some((point) => point.value !== null) ? (
                <>
                  <TimeSeriesChart
                    series={[{ key: "yield", label: `${crop} · ${data.district}`, points: yieldSeries }]}
                    unit={PANEL_UNITS.yield_kg_ha}
                    height={chart.height}
                    accessibilityLabel={`${data.district} ${crop} yield series`}
                  />
                  <ChangeIndicator change={yieldChange} unavailableNote={t.noComparableChange} />
                </>
              ) : (
                <EmptyState title={t.noDataAvailable} />
              )}

              <DataWarning text={t.districtNoCrossCropAverage} />
              <SourceMethodSheet
                title={t.sourceAndMethod}
                source={panel.data?.provenance?.source_id}
                period={panel.data?.label ?? activePeriod}
                coverage={t.districtCoverageCrops.replace(
                  "{count}",
                  String(panel.data?.n_crops ?? 0),
                )}
                unit={PANEL_UNITS.yield_kg_ha}
                method={panel.data?.provenance?.method}
                limitations={[
                  ...(panel.data?.provenance?.limitations ?? []),
                  ...(gapLayer.data?.provenance?.limitations ?? []),
                ]}
              />
            </DataSection>
          ) : null}

          <DataSection title={t.factorsTitle} subtitle={t.factorsSubtitle}>
            <DataWarning text={t.factorsDistrictScope} />
            {factors.isError ? (
              <ErrorState message={t.errorGeneric} onRetry={() => void factors.refetch()} />
            ) : factors.isLoading ? (
              <LoadingSkeleton height={160} />
            ) : (
              <FactorAssociation
                factors={factors.data?.factors ?? []}
                note={factors.data?.note ?? null}
                source={factors.data?.provenance?.source_id}
                method={factors.data?.provenance?.method}
                limitations={factors.data?.provenance?.limitations}
              />
            )}
          </DataSection>
        </>
      ) : null}

      {tab === "inputs" ? (
        <DataSection title={t.inputs} subtitle={t.districtInputsSubtitle} first>
          {panel.isError ? <ErrorState message={t.errorGeneric} onRetry={() => void panel.refetch()} /> : null}
          <DataWarning text={t.districtSingleReleaseNote} />
          {percentRows(data.factors).length ? (
            <HorizontalBarChart values={percentRows(data.factors)} unit="%" maxItems={10} />
          ) : (
            <EmptyState title={t.noDataAvailable} />
          )}
          <Text style={typography.micro}>{t.districtInputsNote}</Text>
          <SourceMethodSheet
            title={t.sourceAndMethod}
            source={data.provenance.source_id}
            period={data.period_label}
            coverage={t.districtCoverageSingleRelease}
            unit="%"
            limitations={data.provenance.limitations}
          />
        </DataSection>
      ) : null}

      {tab === "land" ? (
        <>
          <DataSection title={t.irrigation} subtitle={t.districtIrrigationSubtitle} first>
            <DataWarning text={t.districtSingleReleaseNote} />
            {percentRows(data.irrigation.methods).length ? (
              <HorizontalBarChart values={percentRows(data.irrigation.methods)} unit="%" />
            ) : (
              <EmptyState title={t.noDataAvailable} />
            )}
            {percentRows(data.irrigation.sources).length ? (
              <HorizontalBarChart values={percentRows(data.irrigation.sources)} unit="%" />
            ) : null}
          </DataSection>
          <DataSection title={t.soilErosion} subtitle={t.districtSoilErosionSubtitle}>
            {data.land.filter((item) => item.value != null).length ? (
              <HorizontalBarChart
                values={data.land
                  .filter((item) => item.value != null)
                  .map((item) => ({ label: item.label, value: item.value as number }))}
                unit=""
              />
            ) : null}
            {percentRows(data.erosion).length ? (
              <HorizontalBarChart values={percentRows(data.erosion)} unit="%" />
            ) : (
              <EmptyState title={t.noDataAvailable} />
            )}
            <SourceMethodSheet
              title={t.sourceAndMethod}
              source={data.provenance.source_id}
              period={data.period_label}
              coverage={t.districtCoverageSingleRelease}
              limitations={data.provenance.limitations}
            />
          </DataSection>
        </>
      ) : null}
    </ScreenLayout>
  );
}

function percentRows(items: MetricValue[]) {
  return items
    .filter((item) => item.value != null)
    .map((item) => ({ label: item.label, value: item.value as number }));
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={16} color={colors.primaryStrong} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  readouts: { flexDirection: "row", gap: spacing.md },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { color: colors.primaryStrong, fontWeight: "600", fontSize: 13 },
});
