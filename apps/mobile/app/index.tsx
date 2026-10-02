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
  type ApiChange,
  type ChangeResult,
  type RawPoint,
  boardPoints,
  changeFromApi,
  filterSeason,
  formatValue,
  latestObservation,
  latestSeason,
  publishedCount,
  sameSeasonChange,
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
/** The default filter state — what "Reset filters" restores. */
const DEFAULT_METRIC: TrendMetric = "production_mt";
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
  const [metric, setMetric] = useState<TrendMetric>(DEFAULT_METRIC);
  const [periodView, setPeriodView] = useState<PeriodView>("all");
  const [season, setSeason] = useState<SeasonFilter>("all");
  const [cropFilter, setCropFilter] = useState<string | null>(null);
  // Measured so the Rwanda map never overflows a 320px-wide screen.
  const [mapWidth, setMapWidth] = useState(0);

  /**
   * Selecting a season also clears the "same season" period view.
   *
   * The two describe one axis, not two. "Same season" means "one point per
   * year for the latest published season"; once the user has named a season
   * that view is already implied, and intersecting the two asks for
   * "Season A, and also whichever season is newest" — empty whenever the
   * chosen season is not the newest release. Arming them together is the
   * impossible combination the filter model must not allow.
   */
  const selectSeason = useCallback((next: SeasonFilter) => {
    setSeason(next);
    setPeriodView("all");
  }, []);

  const canReset =
    season !== "all" || periodView !== "all" || cropFilter !== null || metric !== DEFAULT_METRIC;

  /** Back to the canonical default: newest published data, all crops, all seasons. */
  const resetFilters = useCallback(() => {
    setSeason("all");
    setPeriodView("all");
    setCropFilter(null);
    setMetric(DEFAULT_METRIC);
  }, []);

  const periods = useMemo(() => board.data?.periods ?? [], [board.data]);
  const periodLabels = useMemo(() => board.data?.period_labels ?? {}, [board.data]);
  const metricUnits = board.data?.metric_units ?? {};

  const refreshing = home.isFetching || board.isFetching;
  const onRefresh = useCallback(() => {
    void home.refetch();
    void board.refetch();
  }, [home, board]);

  const totals = board.data?.national ?? null;

  // ---- which crop the analytical surfaces describe --------------------------
  // A selected crop narrows the KPI grid and the trend to that crop's own
  // national series. With nothing selected they describe the national total.
  const entry = useMemo<NationalBoardCrop | null>(
    () => board.data?.crops?.find((item) => item.crop === cropFilter) ?? null,
    [board.data, cropFilter],
  );

  /**
   * Apply the active period scope to a raw board series.
   *
   * One helper, used by the KPI grid and the trend, so a figure in a card can
   * never disagree with the line drawn beneath it.
   */
  const applyScope = useCallback(
    (raw: RawPoint[]): RawPoint[] => {
      if (season !== "all") return filterSeason(raw, season);
      if (periodView === "same-season") return filterSeason(raw, latestSeason(raw));
      return raw;
    },
    [season, periodView],
  );

  /**
   * The change badge must describe the series actually on screen.
   *
   * With no season filter the API's own same-season change is authoritative —
   * eligibility is decided there, and its reason string is shown verbatim when
   * it declines. Once the user narrows to a single season that API figure no
   * longer describes what is drawn, so the change is recomputed from the
   * displayed points. Either way a comparison that cannot be made renders as
   * words, never as 0%.
   */
  const changeFor = useCallback(
    (raw: RawPoint[], key: TrendMetric, apiChange: ApiChange | null | undefined) =>
      season === "all" ? changeFromApi(apiChange) : sameSeasonChange(raw, key),
    [season],
  );

  /** Raw points for one metric of the active crop (or national) series, scoped. */
  const seriesFor = useCallback(
    (key: TrendMetric): RawPoint[] => {
      const series = cropFilter ? entry?.series : totals?.series;
      if (!series) return [];
      return applyScope(boardPoints({ periods, period_labels: periodLabels, series }, [key]));
    },
    [cropFilter, entry, totals, periods, periodLabels, applyScope],
  );

  // ---- KPI grid -------------------------------------------------------------
  const kpi = useMemo(() => {
    const build = (key: TrendMetric) => {
      const raw = seriesFor(key);
      const observation = latestObservation(raw, key);
      return {
        value: observation?.value ?? null,
        period: observation?.label ?? null,
        points: toSeriesPoints(raw, key),
        change: changeFor(
          raw,
          key,
          cropFilter ? entry?.changes?.[key] : totals?.changes?.[key],
        ),
      };
    };
    return {
      production: build("production_mt"),
      area: build("harvested_area_ha"),
    };
  }, [seriesFor, changeFor, cropFilter, entry, totals]);

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
  const trendRaw = useMemo(() => seriesFor(metric), [seriesFor, metric]);
  const trendPoints = useMemo(() => toSeriesPoints(trendRaw, metric), [trendRaw, metric]);
  const trendChange = useMemo(
    () =>
      changeFor(
        trendRaw,
        metric,
        cropFilter ? entry?.changes?.[metric] : totals?.changes?.[metric],
      ),
    [trendRaw, metric, changeFor, cropFilter, entry, totals],
  );

  const trendPublished = publishedCount(trendPoints);
  const trendUnit = metricUnits[metric] ?? null;

  /**
   * The filter state in words, e.g. "Maize · Season B · Same season".
   *
   * Used by every section subtitle, the KPI caption and the empty states, so a
   * component always states which filters produced what it is showing. A card
   * that is deliberately dataset-wide gets `coverageScopeNote` instead of this.
   */
  const scopeLabel = useMemo(
    () =>
      [
        cropFilter ?? t.nationalSeries,
        season !== "all" ? `${t.seasonWord} ${season}` : null,
        periodView === "same-season" ? t.sameSeasonView : null,
      ]
        .filter(Boolean)
        .join(" \u00b7 "),
    [cropFilter, season, periodView, t],
  );

  /**
   * The caption over the KPI grid.
   *
   * The two headline figures follow the crop and the season, so when the grid
   * is not national-and-unfiltered it says what it is. Showing the national
   * total under an active crop filter without saying so is the failure this
   * caption exists to prevent.
   */
  const pulseScope = useMemo(
    () =>
      [
        cropFilter ?? t.scopeNational,
        season !== "all" ? `${t.seasonWord} ${season}` : null,
      ]
        .filter(Boolean)
        .join(" \u00b7 "),
    [cropFilter, season, t],
  );

  /** The metric's own label, for the empty state's sentence. */
  const metricLabel = useMemo(
    () => t[TREND_METRICS.find((item) => item.id === metric)?.labelKey ?? "metricProduction"],
    [metric, t],
  );

  /** "No published <metric> data for <selection>." — never a silent zero. */
  const noDataMessage = useMemo(
    () =>
      t.noPublishedSelection
        .replace("{metric}", metricLabel)
        .replace("{selection}", scopeLabel),
    [t, metricLabel, scopeLabel],
  );

  /** The trend chart's screen-reader description, in the active language. */
  const trendA11yLabel = useMemo(
    () => t.trendChartA11y.replace("{metric}", metricLabel).replace("{selection}", scopeLabel),
    [t, metricLabel, scopeLabel],
  );

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
                onPress={() => selectSeason("all")}
              />
              {availableSeasons.map((letter) => (
                <FilterChip
                  key={letter}
                  label={`${t.seasonWord} ${letter}`}
                  selected={season === letter}
                  onPress={() => selectSeason(letter)}
                />
              ))}

              {/*
                The period view is offered only while no season is selected.
                Season and period view describe the same axis, so offering both
                at once lets the user ask for a combination that cannot have
                data (Season A *and* the newest season) and then renders as an
                empty chart the user cannot explain.
              */}
              {season === "all" ? (
                <>
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
                </>
              ) : null}

              <FilterChip
                label={t.filterAllCrops}
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

              {/* Always reachable once anything is off its default, so the
                  user is never stranded in an empty selection. */}
              {canReset ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.resetFilters}
                  onPress={resetFilters}
                  hitSlop={8}
                  style={styles.resetChip}
                >
                  <Ionicons name="refresh-outline" size={13} color={colors.primaryStrong} />
                  <Text style={styles.resetChipText}>{t.resetFilters}</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            {/* The pulse follows the crop and season filters, so its caption
                names them. These are national figures, never district ones. */}
            <View style={styles.scopeRow}>
              <Text style={typography.microCaps}>{t.pulseTitle.toUpperCase()}</Text>
              <Text numberOfLines={1} style={styles.scopeValue}>
                {pulseScope}
              </Text>
            </View>

            <View style={styles.kpiGrid}>
              {boardLoading ? (
                <>
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
                </>
              )}
            </View>

            {/* Dataset coverage is a property of the release, not of the
                selection, so it is captioned as such rather than left to look
                filter-scoped. */}
            <View style={styles.scopeRow}>
              <Text style={typography.microCaps}>{t.publishedCoverage.toUpperCase()}</Text>
              <Text numberOfLines={1} style={styles.scopeValue}>
                {t.coverageScopeNote}
              </Text>
            </View>

            <View style={styles.kpiGrid}>
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
            </View>

            {/* ---- National crop trends ----------------------------------- */}
            <DataSection title={t.nationalTrendTitle} subtitle={scopeLabel}>
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
                /* Names the selection that returned nothing. The previous copy
                   said only "no data", which leaves the user guessing which of
                   several active filters produced the gap. */
                <EmptyState title={t.noDataAvailable} message={noDataMessage} />
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
                    accessibilityLabel={trendA11yLabel}
                  />
                  <ChangeIndicator change={trendChange} unavailableNote={t.noComparableChange} />
                  {trendPublished === 1 ? <DataWarning tone="slate" text={t.singlePointNote} /> : null}
                  {periodView === "same-season" ? (
                    <DataWarning tone="slate" text={t.sameSeasonNotSeries} />
                  ) : null}
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

const makeStyles = (colors: Palette, typography: Typography) => {
  /**
   * Scale a size that is genuinely specific to this screen.
   *
   * Only for values with no token — everything else reads `typography`, which is
   * already scaled by the active preference. A bare literal here would silently
   * ignore "Larger text".
   */
  const s = (value: number) => Math.round(value * typography.scale);

  return StyleSheet.create({
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
    fontSize: s(10),
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroHeadline: { color: colors.white, fontSize: s(22), fontWeight: "700", lineHeight: s(27) },
  heroSupport: { color: "rgba(255,255,255,0.85)", fontSize: s(13), lineHeight: s(18) },
  heroValues: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  heroValue: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroValueText: { color: colors.white, fontSize: s(11), fontWeight: "600" },

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
  contextChipText: { fontSize: s(12), fontWeight: "700", color: colors.primaryStrong },
  resetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  resetChipText: { fontSize: s(12), fontWeight: "700", color: colors.primaryStrong },

  // Section caption that names the scope a block of figures was computed for.
  scopeRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  scopeValue: { ...typography.micro, flex: 1, color: colors.slate700 },

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
  kpiValue: { ...typography.numericCard },

  // Sections
  sectionAction: { ...typography.micro, color: colors.primaryStrong, fontWeight: "700" },

  // District map
  mapWrap: { alignItems: "center", paddingVertical: spacing.xs },
  legendBands: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  legendText: { fontSize: s(10), color: colors.slate700, fontVariant: ["tabular-nums"] },

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
  fabLabel: { color: colors.white, fontSize: s(14), fontWeight: "700" },
  });
};
