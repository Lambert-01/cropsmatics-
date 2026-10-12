import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TimeSeriesChart } from "../../src/components/charts";
import { ChangeIndicator, DataSection, MetricSelector } from "../../src/components/data-view";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingSkeleton,
  SectionHeader,
  SourceCard,
} from "../../src/components/ui";
import { useNationalBoard } from "../../src/hooks/queries";
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
  desc: string;
}[] = [
  {
    id: "compareCrops",
    href: "/explore/compare?mode=crops",
    icon: "git-compare-outline",
    desc: "Several crops on one shared axis, absolute or indexed.",
  },
  {
    id: "compareDistricts",
    href: "/explore/compare?mode=districts",
    icon: "git-compare-outline",
    desc: "One crop, one period, the same indicator per district.",
  },
  {
    id: "districts",
    href: "/explore/districts",
    icon: "location-outline",
    desc: "Open a district and read its record.",
  },
  {
    id: "indicators",
    href: "/explore/indicators",
    icon: "analytics-outline",
    desc: "Productivity, inputs, irrigation and erosion indicators.",
  },
];

export default function AnalyzeScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const language = useAppStore((s) => s.language);
  const t = strings(language);
  const [metric, setMetric] = useState<BoardMetric>("production_mt");

  const board = useNationalBoard();

  // Memoised because they are dependencies of the memos below: reading them off
  // `board.data` inline would mint a new array every render and recompute the
  // trend and the ranking for nothing.
  const periods = useMemo(() => board.data?.periods ?? [], [board.data]);
  const periodLabels = useMemo(() => board.data?.period_labels ?? {}, [board.data]);
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

  if (board.isError) {
    return (
      <ScreenLayout active="analyze">
        <ErrorState message={t.errorGeneric} onRetry={() => void board.refetch()} />
      </ScreenLayout>
    );
  }

  const loading = board.isLoading;
  const noPublishedPeriods = !loading && periods.length === 0;

  const trendA11y = t.trendChartA11y
    .replace("{metric}", metricLabel)
    .replace("{selection}", t.nationalSeries);

  return (
    <ScreenLayout active="analyze">
      <SectionHeader title={t.analyze} subtitle={t.cropBoardSubtitle} />

      {loading ? (
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
                <Text style={typography.micro}>{t.latestPublished}</Text>
                <Text style={typography.h2}>
                  {periodLabels[periods[periods.length - 1]] ?? periods[periods.length - 1]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.micro}>{t.publishedCoverage}</Text>
                <Text style={typography.h2}>
                  {`${periods[0]}–${periods[periods.length - 1]}`}
                </Text>
              </View>
            </View>
            <Text style={typography.caption}>
              {`${t.nationalSeries} · ${periods.length} ${t.allPublishedPeriods.toLowerCase()}`}
            </Text>
          </Card>

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
              subtitle={`${metricLabel} · ${t.latestPublished}`}
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
            <Text style={typography.caption}>{action.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
        </Card>
      ))}
    </ScreenLayout>
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
  });
