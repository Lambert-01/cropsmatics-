import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TimeSeriesChart } from "../../src/components/charts";
import { ChangeIndicator, DataSection, MetricSelector } from "../../src/components/data-view";
import { ForecastWorkspace } from "../../src/components/analytics/ForecastWorkspace";
import { ManualPlanningSection } from "../../src/components/analytics/ManualPlanningSection";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  Card,
  EmptyState,
  ErrorState,
  FilterButton,
  FilterChip,
  ListRow,
  LoadingSkeleton,
  SectionHeader,
  SourceCard,
} from "../../src/components/ui";
import { SingleSelectSheet } from "../../src/components/terminal/SingleSelectSheet";
import { useAllCrops, useNationalBoard, usePeriods } from "../../src/hooks/queries";
import { strings, type Strings } from "../../src/i18n";
import type { NationalBoardCrop } from "../../src/types";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";
import type { SeriesPoint } from "../../src/utils/analytics";
import { changeFromApi, formatValue } from "../../src/utils/analytics";
import { rankCropsByLatest } from "../../src/utils/ranking";

/**
 * The Analyze workspace: what the tab opens.
 *
 * The tab previously led with four navigation cards, which made a five-slot
 * destination mean "pick a screen". It now opens on published data: the context
 * the numbers belong to, a metric switch, the national published trend and the
 * crops leading on the selected metric. The four routes are still here, at the
 * bottom, because they are still the ways to go deeper - nothing became
 * unreachable, and no route changed.
 *
 * Everything is derived from one request (`/analytics/national-board`), which
 * the Crops board and the crop terminal already share, so opening this tab adds
 * no round trip. Nothing is fabricated: when the board has no published periods
 * the screen says so instead of drawing an empty axis, and a crop whose latest
 * period published nothing for the metric is omitted from the ranking rather
 * than ranked as zero.
 */

/** Board metric keys, as published by the API's ``metric_units``. */
type BoardMetric = "production_mt" | "harvested_area_ha" | "yield_mt_ha";

/** How many crops the ranking shows. Beyond this it stops being a glance. */
const RANKING_SIZE = 6;

const ACTIONS: {
  id: keyof Strings;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: "compareCrops",
    href: "/explore/compare?mode=crops",
    icon: "git-compare-outline",
  },
  {
    id: "compareDistricts",
    href: "/explore/compare?mode=districts",
    icon: "git-compare-outline",
  },
  {
    id: "districts",
    href: "/explore/districts",
    icon: "location-outline",
  },
  {
    id: "indicators",
    href: "/explore/indicators",
    icon: "analytics-outline",
  },
];

export default function AnalyzeScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const language = useAppStore((s) => s.language);
  const t = strings(language);
  const [metric, setMetric] = useState<BoardMetric>("production_mt");
  const [periodCode, setPeriodCode] = useState<string | null>(null);
  const [cropFilter, setCropFilter] = useState<string | null>(null);
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false);
  const [cropSheetOpen, setCropSheetOpen] = useState(false);

  const crops = useAllCrops();
  const periodsQuery = usePeriods();
  const board = useNationalBoard(cropFilter ? [cropFilter] : undefined, { periodCode });

  // Memoised because they are dependencies of the memos below: reading them off
  // `board.data` inline would mint a new array every render and recompute the
  // trend and the ranking for nothing.
  const periods = useMemo(() => board.data?.periods ?? [], [board.data]);
  const periodLabels = useMemo(() => board.data?.period_labels ?? {}, [board.data]);
  const catalogPeriods = useMemo(() => periodsQuery.data?.periods ?? [], [periodsQuery.data]);
  const periodOptions = useMemo(
    () => [
      { id: "__all__", label: t.allPublishedPeriods, hint: `${catalogPeriods.length || periods.length} ${t.period}` },
      ...catalogPeriods.map((period) => ({
        id: period.period_code,
        label: period.label,
        hint: `${period.n_districts} ${t.districts}`,
      })),
    ],
    [catalogPeriods, periods.length, t],
  );
  const cropOptions = useMemo(
    () => [
      { id: "__all__", label: t.filterAllCrops, hint: t.nationalSeries },
      ...(crops.data ?? []).map((crop) => ({ id: crop.crop_name, label: crop.crop_name })),
    ],
    [crops.data, t],
  );
  const selectedPeriodLabel = periodCode
    ? catalogPeriods.find((period) => period.period_code === periodCode)?.label ??
      periodLabels[periodCode] ??
      periodCode
    : t.allPublishedPeriods;
  const unit = board.data?.metric_units?.[metric] ?? null;
  const national = board.data?.national ?? null;

  const metricLabel =
    metric === "production_mt"
      ? t.metricProduction
      : metric === "harvested_area_ha"
        ? t.metricArea
        : t.metricYield;

  // The national axis, index-aligned with `periods`. A period with no published
  // value is a null point, which the chart renders as a gap - never a zero.
  const nationalPoints = useMemo<SeriesPoint[]>(() => {
    const series = national?.series?.[metric];
    return periods.map((code, index) => ({
      label: periodLabels[code] ?? code,
      value: typeof series?.[index] === "number" ? (series[index] as number) : null,
    }));
  }, [national, metric, periods, periodLabels]);

  const publishedPoints = useMemo(
    () => nationalPoints.filter((point) => point.value !== null).length,
    [nationalPoints],
  );

  /**
   * Crops ranked by their latest *published* value for the metric.
   *
   * The exclusion rule lives in the pure helper so it is unit tested: a crop
   * with nothing published for this metric is omitted, never ranked as zero.
   */
  const ranking = useMemo(
    () => rankCropsByLatest(board.data?.crops, metric, periods, RANKING_SIZE),
    [board.data, metric, periods],
  );

  const changeByCrop = useMemo(() => {
    const map = new Map<string, NationalBoardCrop["changes"]>();
    for (const crop of board.data?.crops ?? []) map.set(crop.crop, crop.changes);
    return map;
  }, [board.data]);

  const loading = board.isLoading;
  const noPublishedPeriods = !loading && periods.length === 0;

  const trendA11y = t.trendChartA11y
    .replace("{metric}", metricLabel)
    .replace("{selection}", t.nationalSeries);

  return (
    <ScreenLayout active="analyze">
      <SectionHeader title={t.insightsTitle} subtitle={t.cropBoardSubtitle} />

      <View style={styles.filterGrid}>
        <FilterButton
          label={t.selectPeriod}
          value={selectedPeriodLabel}
          active={periodCode !== null}
          icon="calendar-outline"
          onPress={() => setPeriodSheetOpen(true)}
        />
        <FilterButton
          label={t.selectCrop}
          value={cropFilter ?? t.filterAllCrops}
          active={cropFilter !== null}
          icon="leaf-outline"
          onPress={() => setCropSheetOpen(true)}
        />
      </View>
      {periodCode || cropFilter ? (
        <View style={styles.filterSummary}>
          <FilterChip
            label={`${selectedPeriodLabel}${cropFilter ? ` · ${cropFilter}` : ""}`}
            selected
            onPress={() => {
              setPeriodCode(null);
              setCropFilter(null);
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.resetFilters}
            onPress={() => {
              setPeriodCode(null);
              setCropFilter(null);
            }}
            hitSlop={8}
            style={styles.reset}
          >
            <Ionicons name="refresh-outline" size={14} color={colors.primaryStrong} />
            <Text style={styles.resetText}>{t.resetFilters}</Text>
          </Pressable>
        </View>
      ) : null}
      <SingleSelectSheet
        visible={periodSheetOpen}
        title={t.selectPeriod}
        subtitle={t.allPublishedPeriods}
        searchPlaceholder={t.selectPeriod}
        options={periodOptions}
        selected={periodCode ?? "__all__"}
        onApply={(next) => {
          setPeriodCode(next && next !== "__all__" ? next : null);
          setPeriodSheetOpen(false);
        }}
        onCancel={() => setPeriodSheetOpen(false)}
      />
      <SingleSelectSheet
        visible={cropSheetOpen}
        title={t.selectCrop}
        subtitle={t.nationalSeries}
        searchPlaceholder={t.searchCrops}
        options={cropOptions}
        selected={cropFilter ?? "__all__"}
        onApply={(next) => {
          setCropFilter(next && next !== "__all__" ? next : null);
          setCropSheetOpen(false);
        }}
        onCancel={() => setCropSheetOpen(false)}
      />

      {board.isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void board.refetch()} />
      ) : loading ? (
        <>
          <LoadingSkeleton height={92} />
          <LoadingSkeleton height={220} />
        </>
      ) : noPublishedPeriods ? (
        <EmptyState
          title={t.noPublishedPeriods}
          message={t.noDataAvailable}
          icon="analytics-outline"
        />
      ) : (
        <>
          {/* Context first: which calendar the numbers below belong to. */}
          <Card>
            <View style={styles.contextRow}>
              <View style={{ flex: 1 }}>
                <Text style={typography.micro}>{periodCode ? t.selectPeriod : t.publishedCoverage}</Text>
                <Text style={typography.h2}>
                  {periodCode
                    ? selectedPeriodLabel
                    : t.allPublishedPeriods}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.micro}>{t.periodRangeLabel}</Text>
                <Text style={typography.h2}>
                  {periodCode
                    ? `${periods[0] ?? periodCode}`
                    : `${periods[0]}–${periods[periods.length - 1]}`}
                </Text>
              </View>
            </View>
            <Text style={typography.caption}>
              {`${cropFilter ?? t.nationalSeries} · ${periods.length} ${t.allPublishedPeriods.toLowerCase()}`}
            </Text>
          </Card>

          <InsightDigest
            title={t.insightDigestTitle}
            body={t.insightDigestBody}
            latest={nationalPoints[nationalPoints.length - 1] ?? null}
            unit={unit}
            period={periodLabels[periods[periods.length - 1] ?? ""] ?? periods[periods.length - 1] ?? null}
            metricLabel={metricLabel}
          />

          <MetricSelector
            label={t.selectIndicator}
            value={metric}
            onChange={(id) => setMetric(id as BoardMetric)}
            options={[
              { id: "production_mt", label: t.metricProduction },
              { id: "harvested_area_ha", label: t.metricArea },
              { id: "yield_mt_ha", label: t.metricYield },
            ]}
          />

          <DataSection title={t.pulseTitle} subtitle={`${metricLabel} · ${t.nationalSeries}`}>
            {publishedPoints ? (
              <>
                <TimeSeriesChart
                  series={[{ key: metric, label: t.nationalSeries, points: nationalPoints }]}
                  unit={unit}
                  accessibilityLabel={trendA11y}
                />
                <ChangeIndicator
                  change={changeFromApi(national?.changes?.[metric])}
                  unavailableNote={t.noComparableChange}
                />
              </>
            ) : (
              <EmptyState
                title={t.noPublishedPeriods}
                message={t.noPublishedSelection
                  .replace("{metric}", metricLabel)
                  .replace("{selection}", t.nationalSeries)}
                icon="analytics-outline"
              />
            )}
          </DataSection>

          {ranking.length ? (
            <DataSection
              title={t.topCrops}
              subtitle={`${metricLabel} · ${selectedPeriodLabel}`}
            >
              {ranking.map((row) => (
                <ListRow
                  key={row.crop}
                  title={row.crop}
                  subtitle={periodLabels[row.period] ?? row.period}
                  onPress={() =>
                    router.push((`/explore/crop/${encodeURIComponent(row.crop)}`) as never)
                  }
                  right={
                    <View style={styles.valueCell}>
                      <Text style={typography.h2}>
                        {formatValue(row.value)}
                        {unit ? <Text style={typography.micro}>{` ${unit}`}</Text> : null}
                      </Text>
                      <ChangeIndicator
                        change={changeFromApi(changeByCrop.get(row.crop)?.[metric])}
                        unavailableNote={t.noComparableChange}
                      />
                    </View>
                  }
                />
              ))}
            </DataSection>
          ) : null}

          <SourceCard
            sourceLabel={board.data?.provenance?.source_id ?? null}
            period={board.data?.provenance?.source_period ?? null}
            coverage={`${periods[0]}–${periods[periods.length - 1]}`}
            limitations={board.data?.provenance?.limitations}
          />
        </>
      )}

      {/* Predictions. Mounted regardless of the board state: the publication
          gate is a separate report and must still be answerable when the panel
          is empty — "no forecast, here is why" is a complete result. */}
      <ForecastWorkspace />

      {/* A user-controlled planning scenario is separate from the gated forecast. */}
      <ManualPlanningSection />

      {/* The ways to go deeper. Same routes as before, nothing removed. */}
      {ACTIONS.map((action) => (
        <Card
          key={action.id}
          onPress={() => router.push(action.href as never)}
          accessibilityLabel={t[action.id]}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
        >
          <View style={styles.icon}>
            <Ionicons name={action.icon} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.h2}>{t[action.id]}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
        </Card>
      ))}
    </ScreenLayout>
  );
}

function InsightDigest({
  title,
  body,
  latest,
  unit,
  period,
  metricLabel,
}: {
  title: string;
  body: string;
  latest: SeriesPoint | null;
  unit: string | null;
  period: string | null;
  metricLabel: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <Card style={{ gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Ionicons name="bulb-outline" size={19} color={colors.primary} />
        <Text style={typography.h3}>{title}</Text>
      </View>
      <Text style={typography.caption}>{body}</Text>
      {latest?.value !== null && latest?.value !== undefined ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
          <Text style={typography.numericCard}>{formatValue(latest.value)}</Text>
          {unit ? <Text style={typography.unit}>{unit}</Text> : null}
          <Text style={typography.micro}>{`${metricLabel} · ${period ?? "published period"}`}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    icon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.mintSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    contextRow: {
      flexDirection: "row",
      gap: spacing.md,
      paddingBottom: spacing.xs,
    },
    valueCell: {
      alignItems: "flex-end",
      gap: 2,
      minWidth: 96,
    },
    filterGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    filterSummary: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    reset: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: spacing.sm,
      borderRadius: 10,
      backgroundColor: colors.mintSoft,
    },
    resetText: { color: colors.primaryStrong, fontSize: 12, fontWeight: "700" },
  });
