import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "../src/components/AppHeader";
import { BottomNav } from "../src/components/BottomNav";
import { HorizontalBarChart, Sparkline, TimeSeriesChart } from "../src/components/charts";
import { CropBoardRow } from "../src/components/CropBoardRow";
import {
  ChangeIndicator,
  DataSection,
  DataWarning,
  MetricSelector,
  SourceMethodSheet,
} from "../src/components/data-view";
import { RwandaMap } from "../src/components/RwandaMap";
import {
  EmptyState,
  ErrorState,
  FilterChip,
  ListRow,
  LoadingSkeleton,
  OfflineBanner,
  SearchBar,
} from "../src/components/ui";
import { features } from "../src/config/features";
import { useAllCrops, useNationalBoard } from "../src/hooks/queries";
import { useNationalInsights } from "../src/hooks/useNationalInsights";
import { strings } from "../src/i18n";
import { homeApi, mapsApi } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { chart, heroScrim, radius, shadow, spacing } from "../src/theme";
import type { Palette, Typography } from "../src/theme";
import { useThemedStyles, useTheme } from "../src/theme/theme-context";
import type { NationalBoardCrop } from "../src/types";
import {
  type ChangeResult,
  boardPoints,
  changeFromApi,
  filterSeason,
  formatValue,
  latestSeason,
  publishedCount,
  toSeriesPoints,
} from "../src/utils/analytics";
import {
  bandPaletteIndex,
  bandsFor,
  formatBand,
  scaleForLayer,
} from "../src/utils/scale";

/**
 * Home — the compact agricultural-intelligence command center.
 *
 * Order of answers (see the spec's information hierarchy): what is happening
 * nationally, which crops matter, how performance is changing, where the
 * geographic gaps are, and what the data suggest. Every figure comes from the
 * national board or the mobile-home endpoint; a missing value renders as "not
 * published" rather than 0, and no cross-crop yield is ever averaged.
 */

/** National board metric keys (see the backend's national-board contract). */
type TrendMetric = "production_mt" | "yield_mt_ha" | "harvested_area_ha";
const TREND_METRICS: { id: TrendMetric; labelKey: "metricProduction" | "metricYield" | "metricArea" }[] = [
  { id: "production_mt", labelKey: "metricProduction" },
  { id: "yield_mt_ha", labelKey: "metricYield" },
  { id: "harvested_area_ha", labelKey: "metricArea" },
];

const SEASON_LETTERS = ["A", "B", "C"] as const;
type SeasonFilter = "all" | (typeof SEASON_LETTERS)[number];
type PeriodView = "all" | "same-season";

const PREVIEW_CROPS = 5;
const TOP_DISTRICTS = 5;
/** Choropleth classes the home map uses, matching the dedicated map screen. */
const CLASS_COUNT = 5;

const OTHER_DESTINATIONS = [
  { id: "postHarvest", href: "/explore/post-harvest", icon: "cube-outline" },
  { id: "compare", href: "/explore/compare", icon: "git-compare-outline" },
  { id: "dataSources", href: "/more/data-sources", icon: "shield-checkmark-outline" },
] as const;

/** The newest non-null value of a board series, or null when none is published. */
function latestValue(series: readonly (number | null)[] | undefined): number | null {
  if (!series) return null;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index] !== null && series[index] !== undefined) return series[index] as number;
  }
  return null;
}

/** The published period label of the newest non-null value of a series. */
function latestLabel(
  series: readonly (number | null)[] | undefined,
  periods: readonly string[],
  labels: Record<string, string>,
): string | null {
  if (!series) return null;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index] !== null && series[index] !== undefined) {
      const code = periods[index];
      return code ? labels[code] ?? code : null;
    }
  }
  return null;
}

/** Season letter carried by a period code such as 2025B. */
function seasonOf(code: string): SeasonFilter {
  const letter = code.slice(-1).toUpperCase();
  return (SEASON_LETTERS as readonly string[]).includes(letter) ? (letter as SeasonFilter) : "all";
}

/** One 2x2 KPI card: label, value, unit, period, change and a real sparkline. */
function KpiCard({
  icon,
  label,
  value,
  unit,
  period,
  change,
  points,
  tone = "neutral",
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | string | null;
  unit?: string | null;
  period?: string | null;
  change?: ChangeResult | null;
  points?: { label: string; value: number | null }[];
  tone?: "neutral" | "positive";
  onPress?: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const published = value !== null && value !== undefined && value !== "—";
  const display = typeof value === "number" ? formatValue(value) : value ?? "—";
  const hasTrend = points ? publishedCount(points) > 1 : false;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${label}: ${display}${unit ? ` ${unit}` : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.kpi, pressed && onPress ? { opacity: 0.85 } : null]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={styles.kpiIcon}>
          <Ionicons name={icon} size={14} color={colors.primary} />
        </View>
        <Text numberOfLines={1} style={styles.kpiLabel}>
          {label.toUpperCase()}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.kpiValue}>
          {published ? display : "—"}
        </Text>
        {published && unit ? <Text style={typography.unit}>{unit}</Text> : null}
      </View>

      {published && change ? (
        <ChangeIndicator change={change} tone={tone} />
      ) : period ? (
        <Text numberOfLines={1} style={typography.micro}>
          {period}
        </Text>
      ) : null}

      {/* A single published observation has no trend to show, so none is drawn. */}
      {hasTrend ? (
        <Sparkline points={points as { label: string; value: number | null }[]} height={26} />
      ) : null}
    </Pressable>
  );
}

export default function HomeScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const insets = useSafeAreaInsets();

  const home = useQuery({ queryKey: ["mobile-home"], queryFn: homeApi.get });
  const board = useNationalBoard();
  const crops = useAllCrops();
  const { insights } = useNationalInsights();

  // ---- filters (all functional; each changes what the page shows) -----------
  const [metric, setMetric] = useState<TrendMetric>("production_mt");
  const [periodView, setPeriodView] = useState<PeriodView>("all");
  const [season, setSeason] = useState<SeasonFilter>("all");
  const [cropFilter, setCropFilter] = useState<string | null>(null);
  // Measured so the Rwanda map never overflows a 320px-wide screen.
  const [mapWidth, setMapWidth] = useState(0);

  const periods = useMemo(() => board.data?.periods ?? [], [board.data]);
  const periodLabels = useMemo(() => board.data?.period_labels ?? {}, [board.data]);
  const metricUnits = board.data?.metric_units ?? {};

  const refreshing = home.isFetching || board.isFetching;
  const onRefresh = useCallback(() => {
    void home.refetch();
    void board.refetch();
  }, [home, board]);

  const totals = board.data?.national ?? null;

  // ---- KPI grid -------------------------------------------------------------
  const kpi = useMemo(() => {
    const build = (key: TrendMetric) => {
      if (!totals) return { value: null as number | null, points: [], period: null as string | null, change: null as ChangeResult | null };
      const raw = boardPoints({ periods, period_labels: periodLabels, series: totals.series }, [key]);
      return {
        value: latestValue(totals.series[key]),
        points: toSeriesPoints(raw, key),
        period: latestLabel(totals.series[key], periods, periodLabels),
        change: changeFromApi(totals.changes?.[key]),
      };
    };
    return {
      production: build("production_mt"),
      area: build("harvested_area_ha"),
    };
  }, [totals, periods, periodLabels]);

  const cropsAnalysed = home.data?.crop_count ?? crops.data?.length ?? null;
  const districtsCovered = home.data?.district_count ?? null;

  // ---- seasons genuinely present in the published axis ----------------------
  const availableSeasons = useMemo(() => {
    const set = new Set<string>();
    for (const code of periods) {
      const letter = seasonOf(code);
      if (letter !== "all") set.add(letter);
    }
    return SEASON_LETTERS.filter((letter) => set.has(letter));
  }, [periods]);

  // ---- national trend -------------------------------------------------------
  const entry = useMemo<NationalBoardCrop | null>(
    () => board.data?.crops?.find((item) => item.crop === cropFilter) ?? null,
    [board.data, cropFilter],
  );
  const trendSource = cropFilter ? entry?.series : totals?.series;
  const trendChange = cropFilter
    ? changeFromApi(entry?.changes?.[metric])
    : changeFromApi(totals?.changes?.[metric]);

  const trendPoints = useMemo(() => {
    if (!trendSource) return [];
    const raw = boardPoints({ periods, period_labels: periodLabels, series: trendSource }, [metric]);
    let filtered = raw;
    if (periodView === "same-season") filtered = filterSeason(filtered, latestSeason(filtered));
    if (season !== "all") filtered = filterSeason(filtered, season);
    return toSeriesPoints(filtered, metric);
  }, [trendSource, periods, periodLabels, metric, periodView, season]);

  const trendPublished = publishedCount(trendPoints);
  const trendUnit = metricUnits[metric] ?? null;

  // ---- crop watchlist -------------------------------------------------------
  const previewNames = useMemo(
    () => (crops.data ?? []).slice(0, PREVIEW_CROPS).map((crop) => crop.crop_name),
    [crops.data],
  );
  const previewByCrop = useMemo(() => {
    const map = new Map<string, NationalBoardCrop>();
    for (const item of board.data?.crops ?? []) map.set(item.crop.toLowerCase(), item);
    return map;
  }, [board.data]);

  // ---- district opportunities (largest productivity gaps, top crop) ---------
  const topCrop = useMemo(() => {
    if (cropFilter) return cropFilter;
    let best: { crop: string; value: number } | null = null;
    for (const item of board.data?.crops ?? []) {
      const value = latestValue(item.series["production_mt"]);
      if (value !== null && (!best || value > best.value)) best = { crop: item.crop, value };
    }
    return best?.crop ?? null;
  }, [board.data, cropFilter]);

  const gapLayer = useQuery({
    queryKey: ["home-gap", topCrop],
    queryFn: () => mapsApi.districtMetrics({ metric: "gap", crop: topCrop as string }),
    enabled: Boolean(topCrop),
  });

  const districtView = useMemo(() => {
    const scale = scaleForLayer("gap");
    const published = (gapLayer.data?.districts ?? [])
      .map((row) => row.value)
      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    const { cuts, bands } = bandsFor(published, CLASS_COUNT);
    const values: Record<string, { value: number | null; color: string }> = {};
    for (const row of gapLayer.data?.districts ?? []) {
      if (!row.district_code) continue;
      if (row.value === null || row.value === undefined || !Number.isFinite(row.value)) {
        values[row.district_code] = { value: null, color: colors.missing };
        continue;
      }
      values[row.district_code] = {
        value: row.value,
        color: scale.colors[bandPaletteIndex(row.value, cuts, scale.colors.length)],
      };
    }
    const ranked = (gapLayer.data?.districts ?? [])
      .filter((row) => row.value !== null && Number.isFinite(row.value))
      .map((row) => ({ label: row.district, value: row.value as number }))
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_DISTRICTS);
    return { scale, bands, values, ranked };
  }, [gapLayer.data, colors.missing]);

  const boardLoading = board.isLoading;
  const failable = home.isError || board.isError;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader
        context={
          home.data?.latest_period_label
            ? `${home.data.latest_period_label} \u00b7 ${t.nationalSeries}`
            : null
        }
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <SearchBar placeholder={t.searchPlaceholder} onFocus={() => router.push("/explore/search")} />

        {failable ? (
          <View style={{ gap: spacing.sm }}>
            <ErrorState
              message={t.errorGeneric}
              onRetry={() => {
                void home.refetch();
                void board.refetch();
              }}
            />
            <OfflineBanner text={t.offlineBanner} />
            <DataSection title={t.moreTitle} first>
              {OTHER_DESTINATIONS.map((item) => (
                <ListRow
                  key={item.id}
                  title={t[item.id]}
                  icon={item.icon}
                  onPress={() => router.push(item.href as never)}
                />
              ))}
            </DataSection>
          </View>
        ) : (
          <>
            {/* ---- Hero: the same Rwanda landscape the web uses ------------ */}
            <ImageBackground
              source={require("../assets/images/rwanda-farm-hero-mobile.jpg")}
              resizeMode="cover"
              style={styles.hero}
              imageStyle={{ borderRadius: radius.lg }}
            >
              {/* Two-stop forest-green scrim, so white copy stays legible. */}
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: heroScrim.top, borderRadius: radius.lg }]} />
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: heroScrim.middle, borderRadius: radius.lg }]} />
              <View style={[styles.heroBottom, { backgroundColor: heroScrim.bottom }]} />

              <View style={styles.heroBody}>
                <Text style={styles.heroEyebrow}>{t.homeEyebrow.toUpperCase()}</Text>
                <Text style={styles.heroHeadline}>{t.homeHeadline}</Text>
                <Text style={styles.heroSupport}>{t.homeHeroBody}</Text>
                <View style={styles.heroValues}>
                  {[t.homeValueDecisions, t.homeValueProductivity, t.homeValueFoodSystems].map((value) => (
                    <View key={value} style={styles.heroValue}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.mint} />
                      <Text style={styles.heroValueText}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ImageBackground>

            {/* ---- Compact, functional filter strip ------------------------ */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterStrip}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.contextChip}>
                <Ionicons name="calendar-outline" size={12} color={colors.primaryStrong} />
                <Text numberOfLines={1} style={styles.contextChipText}>
                  {home.data?.latest_period_label ?? t.latestData}
                </Text>
              </View>

              <FilterChip
                label={t.seasonAll}
                selected={season === "all"}
                onPress={() => setSeason("all")}
              />
              {availableSeasons.map((letter) => (
                <FilterChip
                  key={letter}
                  label={`${t.seasonWord} ${letter}`}
                  selected={season === letter}
                  onPress={() => setSeason(letter)}
                />
              ))}

              <FilterChip
                label={t.allPublishedPeriods}
                selected={periodView === "all"}
                onPress={() => setPeriodView("all")}
              />
              <FilterChip
                label={t.sameSeasonView}
                selected={periodView === "same-season"}
                onPress={() => setPeriodView("same-season")}
              />

              <FilterChip
                label={t.crops}
                selected={cropFilter === null}
                onPress={() => setCropFilter(null)}
              />
              {(board.data?.crops ?? []).map((item) => (
                <FilterChip
                  key={item.crop}
                  label={item.crop}
                  selected={cropFilter === item.crop}
                  onPress={() => setCropFilter(item.crop)}
                />
              ))}
            </ScrollView>

            {/* ---- 2x2 KPI grid ------------------------------------------- */}
            <View style={styles.kpiGrid}>
              {boardLoading ? (
                <>
                  <LoadingSkeleton height={112} />
                  <LoadingSkeleton height={112} />
                  <LoadingSkeleton height={112} />
                  <LoadingSkeleton height={112} />
                </>
              ) : (
                <>
                  <KpiCard
                    icon="basket-outline"
                    label={t.metricProduction}
                    value={kpi.production.value}
                    unit={metricUnits["production_mt"] ?? null}
                    period={kpi.production.period}
                    change={kpi.production.change}
                    points={kpi.production.points}
                    tone="positive"
                    onPress={() => {
                      setMetric("production_mt");
                      setCropFilter(null);
                    }}
                  />
                  <KpiCard
                    icon="map-outline"
                    label={t.metricArea}
                    value={kpi.area.value}
                    unit={metricUnits["harvested_area_ha"] ?? null}
                    period={kpi.area.period}
                    change={kpi.area.change}
                    points={kpi.area.points}
                    onPress={() => {
                      setMetric("harvested_area_ha");
                      setCropFilter(null);
                    }}
                  />
                  <KpiCard
                    icon="leaf-outline"
                    label={t.kpiCropsAnalysed}
                    value={cropsAnalysed}
                    onPress={() => router.push("/explore/crops")}
                  />
                  <KpiCard
                    icon="location-outline"
                    label={t.kpiDistrictsCovered}
                    value={districtsCovered}
                    onPress={() => router.push("/explore/districts")}
                  />
                </>
              )}
            </View>

            {/* ---- National crop trends ----------------------------------- */}
            <DataSection
              title={t.nationalTrendTitle}
              subtitle={cropFilter ? `${cropFilter} \u00b7 ${t.nationalSeries}` : t.nationalSeries}
            >
              <MetricSelector
                value={metric}
                onChange={(id) => setMetric(id as TrendMetric)}
                options={TREND_METRICS.map((item) => ({
                  id: item.id,
                  label: t[item.labelKey],
                  hint: metricUnits[item.id] ?? null,
                }))}
              />

              {boardLoading ? (
                <LoadingSkeleton height={chart.height} />
              ) : trendPublished === 0 ? (
                <EmptyState
                  title={t.noDataAvailable}
                  message={`${cropFilter ?? t.nationalSeries} — ${t.notPublished.toLowerCase()}.`}
                />
              ) : (
                <>
                  <TimeSeriesChart
                    series={[
                      {
                        key: metric,
                        label: cropFilter ?? t.nationalSeries,
                        points: trendPoints,
                      },
                    ]}
                    unit={trendUnit}
                    height={chart.height}
                    accessibilityLabel={`${cropFilter ?? t.nationalSeries} ${metric} trend`}
                  />
                  <ChangeIndicator change={trendChange} unavailableNote={t.noComparableChange} />
                  {trendPublished === 1 ? <DataWarning tone="slate" text={t.singlePointNote} /> : null}
                </>
              )}
            </DataSection>

            {/* ---- Crop intelligence -------------------------------------- */}
            <DataSection
              title={t.cropBoard}
              subtitle={t.cropBoardSubtitle}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.viewAllCrops}
                  onPress={() => router.push("/explore/crops")}
                  hitSlop={8}
                >
                  <Text style={styles.sectionAction}>{t.viewAllCrops}</Text>
                </Pressable>
              }
            >
              {boardLoading || crops.isLoading ? (
                <LoadingSkeleton height={96} />
              ) : previewNames.length ? (
                previewNames.map((name, index) => (
                  <CropBoardRow
                    key={name}
                    crop={previewByCrop.get(name.toLowerCase()) ?? null}
                    metric="production_mt"
                    metricLabel={t.metricProduction}
                    periods={periods}
                    periodLabels={periodLabels}
                    unit={metricUnits["production_mt"] ?? null}
                    changeNote={t.noComparableChange}
                    onPress={() =>
                      router.push((`/explore/crop/${crops.data?.[index]?.crop_code}`) as never)
                    }
                  />
                ))
              ) : (
                <EmptyState title={t.noDataAvailable} />
              )}
            </DataSection>

            {/* ---- District opportunities --------------------------------- */}
            <DataSection
              title={t.districtOpportunities}
              subtitle={topCrop ? `${t.metricGap} \u00b7 ${topCrop}` : t.metricGap}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.openMap}
                  onPress={() => router.push("/maps")}
                  hitSlop={8}
                >
                  <Text style={styles.sectionAction}>{t.openMap}</Text>
                </Pressable>
              }
            >
              {gapLayer.isLoading ? (
                <LoadingSkeleton height={200} />
              ) : districtView.ranked.length ? (
                <>
                  <View
                    style={styles.mapWrap}
                    onLayout={(event) => {
                      const next = Math.round(event.nativeEvent.layout.width);
                      if (next > 0 && next !== mapWidth) setMapWidth(next);
                    }}
                  >
                    <RwandaMap
                      width={mapWidth || 280}
                      height={190}
                      values={districtView.values}
                      selected={null}
                      onSelect={(code) => router.push((`/explore/district/${code}`) as never)}
                    />
                  </View>
                  <Text style={typography.micro}>
                    {districtView.scale.direction === "higherIsWorse"
                      ? t.legendHigherIsWorse
                      : t.legendHigherIsBetter}
                  </Text>
                  <HorizontalBarChart values={districtView.ranked} unit="%" maxItems={TOP_DISTRICTS} />
                  <View style={styles.legendBands}>
                    {districtView.bands.map((band) => (
                      <View key={band.index} style={styles.legendItem}>
                        <View
                          style={[
                            styles.swatch,
                            { backgroundColor: districtView.scale.colors[band.index] },
                          ]}
                        />
                        <Text style={styles.legendText}>
                          {formatBand(band, (value) => formatValue(value))}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <DataWarning text={t.factorsDistrictScope} tone="slate" />
                </>
              ) : (
                <EmptyState title={t.noDataAvailable} message={gapLayer.data?.message ?? undefined} />
              )}
            </DataSection>

            {/* ---- What the data say -------------------------------------- */}
            {insights.length ? (
              <DataSection
                title={t.whatDataSay}
                subtitle={t.insightsFeedSubtitle}
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.seeAllInsights}
                    onPress={() => router.push("/field-operations/insights")}
                    hitSlop={8}
                  >
                    <Text style={styles.sectionAction}>{t.seeAllInsights}</Text>
                  </Pressable>
                }
              >
                {insights.map((insight) => (
                  <ListRow
                    key={insight.id}
                    title={insight.title}
                    subtitle={insight.detail}
                    icon={insight.icon}
                    onPress={() => router.push("/field-operations/insights")}
                  />
                ))}
              </DataSection>
            ) : null}

            {/* ---- Below the fold ---------------------------------------- */}
            {home.data?.suggested_questions?.length ? (
              <DataSection title={t.popularQuestions}>
                {home.data.suggested_questions.slice(0, 3).map((question) => (
                  <ListRow
                    key={question}
                    title={question}
                    icon="chatbubble-outline"
                    onPress={() => router.push({ pathname: "/ask", params: { q: question } })}
                  />
                ))}
              </DataSection>
            ) : null}

            <DataSection title={t.moreTitle}>
              {OTHER_DESTINATIONS.map((item) => (
                <ListRow
                  key={item.id}
                  title={t[item.id]}
                  icon={item.icon}
                  onPress={() => router.push(item.href as never)}
                />
              ))}
            </DataSection>

            <SourceMethodSheet
              title={t.sourceAndMethod}
              source={board.data?.provenance?.source_id ?? home.data?.provenance?.source_id}
              period={home.data?.latest_period_label ?? null}
              coverage={home.data?.latest_period_coverage ?? null}
              unit={metricUnits[metric] ?? null}
              method={board.data?.provenance?.method ?? home.data?.provenance?.method}
              limitations={board.data?.provenance?.limitations}
              notes={home.data?.coverage_notes}
            />
          </>
        )}
      </ScrollView>
      <BottomNav active="home" />

      {features.fieldOperations ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.registerHarvest}
          onPress={() => router.push("/field-operations/register-harvest")}
          style={({ pressed }) => [styles.fab, { bottom: 74 + insets.bottom }, pressed ? { opacity: 0.9 } : null]}
        >
          <Ionicons name="add" size={20} color={colors.white} />
          <Text style={styles.fabLabel}>{t.registerHarvest}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette, typography: Typography) =>
  StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  // Hero
  hero: {
    minHeight: 210,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  heroBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 130,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  heroBody: { padding: spacing.md, gap: 5 },
  heroEyebrow: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroHeadline: { color: colors.white, fontSize: 22, fontWeight: "700", lineHeight: 27 },
  heroSupport: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 18 },
  heroValues: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  heroValue: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroValueText: { color: colors.white, fontSize: 11, fontWeight: "600" },

  // Filter strip
  filterStrip: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  contextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    maxWidth: 190,
  },
  contextChipText: { fontSize: 12, fontWeight: "700", color: colors.primaryStrong },

  // KPI grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
    ...shadow.card,
  },
  kpiIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: { ...typography.microCaps, flex: 1 },
  kpiValue: {
    ...typography.numericLarge,
    fontSize: 24,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },

  // Sections
  sectionAction: { ...typography.micro, color: colors.primaryStrong, fontWeight: "700" },

  // District map
  mapWrap: { alignItems: "center", paddingVertical: spacing.xs },
  legendBands: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  legendText: { fontSize: 10, color: colors.slate700, fontVariant: ["tabular-nums"] },

  // FAB
  fab: {
    position: "absolute",
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: 999,
    backgroundColor: colors.primary,
    ...shadow.strong,
  },
  fabLabel: { color: colors.white, fontSize: 14, fontWeight: "700" },
});
