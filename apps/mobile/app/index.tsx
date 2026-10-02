import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Sparkline } from "../src/components/charts";
import { CropBoardRow } from "../src/components/CropBoardRow";
import {
  ChangeIndicator,
  DataSection,
  SourceMethodSheet,
} from "../src/components/data-view";
import { AppHeader } from "../src/components/AppHeader";
import { BottomNav } from "../src/components/BottomNav";
import { EmptyState, ErrorState, ListRow, LoadingSkeleton, OfflineBanner, SearchBar } from "../src/components/ui";
import { features } from "../src/config/features";
import { useAllCrops, useNationalBoard } from "../src/hooks/queries";
import { useNationalInsights } from "../src/hooks/useNationalInsights";
import { strings } from "../src/i18n";
import { homeApi } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import type { NationalBoardCrop } from "../src/types";
import { boardPoints, changeFromApi, formatValue, toSeriesPoints } from "../src/utils/analytics";

/**
 * Home leads with the *national crop series* and its own published period.
 *
 * The latest national trend period and the latest district release are different
 * concepts: the district release describes a different dataset and a different
 * date. They are shown as two separate lines, so a national figure can never
 * read as if it belonged to the district release.
 */
const PREVIEW_CROPS = 4;

const PRIMARY_ACTIONS = [
  { id: "crops", href: "/explore/crops", icon: "leaf-outline" },
  { id: "districts", href: "/explore/districts", icon: "location-outline" },
  { id: "maps", href: "/maps", icon: "map-outline" },
  { id: "indicators", href: "/explore/indicators", icon: "analytics-outline" },
] as const;

const OTHER_DESTINATIONS = [
  { id: "postHarvest", href: "/explore/post-harvest", icon: "cube-outline" },
  { id: "compare", href: "/explore/compare", icon: "git-compare-outline" },
  { id: "dataSources", href: "/more/data-sources", icon: "shield-checkmark-outline" },
] as const;

const PULSE_METRIC = "production_mt";

export default function HomeScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const insets = useSafeAreaInsets();

  const home = useQuery({ queryKey: ["mobile-home"], queryFn: homeApi.get });
  const board = useNationalBoard();
  const crops = useAllCrops();
  // The same deterministic feed the Insights screen shows, so Home's "latest
  // insight" and the feed can never disagree.
  const { insights } = useNationalInsights();
  const latestInsight = insights[0] ?? null;

  const refreshing = home.isFetching || board.isFetching;
  const onRefresh = useCallback(() => {
    void home.refetch();
    void board.refetch();
  }, [home, board]);

  const periods = useMemo(() => board.data?.periods ?? [], [board.data]);
  const periodLabels = useMemo(() => board.data?.period_labels ?? {}, [board.data]);

  const pulsePoints = useMemo(
    () =>
      board.data?.national
        ? boardPoints(
            { periods, period_labels: periodLabels, series: board.data.national.series },
            [PULSE_METRIC],
          )
        : [],
    [board.data, periods, periodLabels],
  );
  const pulseSeries = useMemo(() => toSeriesPoints(pulsePoints, PULSE_METRIC), [pulsePoints]);
  const pulseChange = changeFromApi(board.data?.national?.changes?.[PULSE_METRIC]);

  // The pulse's own period: the newest position on the national axis that
  // actually carries a value.
  const pulseLatestIndex = useMemo(() => {
    for (let index = pulseSeries.length - 1; index >= 0; index -= 1) {
      if (pulseSeries[index].value !== null) return index;
    }
    return -1;
  }, [pulseSeries]);
  const pulseValue = pulseLatestIndex >= 0 ? pulseSeries[pulseLatestIndex].value : null;
  const pulsePeriodLabel = pulseLatestIndex >= 0 ? pulseSeries[pulseLatestIndex].label : null;
  const pulseUnit = board.data?.metric_units?.[PULSE_METRIC] ?? null;

  const previewNames = useMemo(
    () => (crops.data ?? []).slice(0, PREVIEW_CROPS).map((crop) => crop.crop_name),
    [crops.data],
  );
  const previewByCrop = useMemo(() => {
    const map = new Map<string, NationalBoardCrop>();
    for (const item of board.data?.crops ?? []) map.set(item.crop.toLowerCase(), item);
    return map;
  }, [board.data]);

  const districtCoverage = home.data?.latest_period_coverage ?? null;
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
          /* An intentional error variant: what failed, what still works, and one
             clear retry. No invented figures fill the gap. */
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
            {/* ---- Agricultural pulse ------------------------------------- */}
            <View style={styles.pulse}>
              <View style={styles.pulseHead}>
                <Ionicons name="pulse-outline" size={15} color={colors.primary} />
                <Text style={styles.pulseTitle}>{t.pulseTitle}</Text>
                {pulsePeriodLabel ? (
                  <Text style={styles.pulsePeriod}>{pulsePeriodLabel}</Text>
                ) : null}
              </View>

              {board.isLoading ? (
                <LoadingSkeleton height={72} />
              ) : pulseValue === null ? (
                <Text style={typography.caption}>
                  No national production total is published for this selection.
                </Text>
              ) : (
                <>
                  <View style={styles.pulseFigure}>
                    <Text style={styles.pulseValue}>{formatValue(pulseValue)}</Text>
                    {pulseUnit ? <Text style={typography.unit}>{pulseUnit}</Text> : null}
                  </View>
                  <Text style={typography.micro}>{t.pulseSubtitle}</Text>
                  <ChangeIndicator change={pulseChange} unavailableNote={t.noComparableChange} />
                  <Sparkline points={pulseSeries} accessibilityLabel={t.pulseTitle} />
                </>
              )}

              {/* Coverage context, kept strictly separate from the value above. */}
              <View style={styles.coverageRow}>
                <Text style={styles.coverageLabel}>{t.latestData}</Text>
                <Text style={styles.coverageValue}>
                  {home.data?.latest_period_label ?? t.noDataAvailable}
                  {districtCoverage ? ` · ${districtCoverage}` : ""}
                </Text>
              </View>
            </View>

            {/* ---- Crop board preview ------------------------------------- */}
            <DataSection title={t.cropBoard} subtitle={t.cropBoardSubtitle} first>
              {board.isLoading || crops.isLoading ? (
                <LoadingSkeleton height={96} />
              ) : previewNames.length ? (
                <>
                  {previewNames.map((name, index) => (
                    <CropBoardRow
                      key={name}
                      crop={previewByCrop.get(name.toLowerCase()) ?? null}
                      metric={PULSE_METRIC}
                      metricLabel={t.metricProduction}
                      periods={periods}
                      periodLabels={periodLabels}
                      unit={board.data?.metric_units?.[PULSE_METRIC] ?? null}
                      changeNote={t.noComparableChange}
                      onPress={() =>
                        router.push((`/explore/crop/${crops.data?.[index]?.crop_code}`) as never)
                      }
                    />
                  ))}
                  <ListRow title={t.crops} icon="leaf-outline" onPress={() => router.push("/explore/crops")} />
                </>
              ) : (
                <EmptyState title={t.noDataAvailable} />
              )}
            </DataSection>

            {/* ---- Four primary destinations ------------------------------ */}
            <View style={styles.actions}>
              {PRIMARY_ACTIONS.map((action) => (
                <Pressable
                  key={action.id}
                  accessibilityRole="button"
                  accessibilityLabel={t[action.id]}
                  onPress={() => router.push(action.href as never)}
                  style={({ pressed }) => [styles.action, pressed ? { opacity: 0.8 } : null]}
                >
                  <Ionicons name={action.icon} size={19} color={colors.primary} />
                  <Text numberOfLines={1} style={styles.actionLabel}>
                    {t[action.id]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ---- Latest insight ----------------------------------------- */}
            {latestInsight ? (
              <DataSection
                title={t.latestInsightTitle}
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.seeAllInsights}
                    onPress={() => router.push("/field-operations/insights")}
                    hitSlop={8}
                  >
                    <Text style={{ ...typography.micro, color: colors.primaryStrong, fontWeight: "700" }}>
                      {t.seeAllInsights}
                    </Text>
                  </Pressable>
                }
              >
                <ListRow
                  title={latestInsight.title}
                  subtitle={latestInsight.detail}
                  icon={latestInsight.icon}
                  onPress={() => router.push("/field-operations/insights")}
                />
              </DataSection>
            ) : null}

            {/* ---- Below the fold ----------------------------------------- */}
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

            {home.data?.featured_topics?.length ? (
              <DataSection title={t.featuredInsightsTitle} subtitle={t.featuredInsightsSubtitle}>
                {home.data.featured_topics.slice(0, 2).map((topic) => (
                  <ListRow
                    key={topic.id}
                    title={topic.title}
                    subtitle={topic.summary}
                    meta={[topic.source_id, topic.period].filter(Boolean).join(" · ")}
                    onPress={() => router.push(topic.route as never)}
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
              period={pulsePeriodLabel}
              coverage={districtCoverage}
              unit={pulseUnit}
              method={board.data?.provenance?.method ?? home.data?.provenance?.method}
              limitations={board.data?.provenance?.limitations}
              notes={home.data?.coverage_notes}
            />
          </>
        )}
      </ScrollView>
      <BottomNav active="home" />

      {/* Field operation stays one tap away from the intelligence home, without
          taking over the analytics layout. Gated by the same feature flag as
          the Field Operations hub. */}
      {features.fieldOperations ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.registerHarvest}
          onPress={() => router.push("/field-operations/register-harvest")}
          style={({ pressed }) => [
            styles.fab,
            { bottom: 74 + insets.bottom },
            pressed ? { opacity: 0.9 } : null,
          ]}
        >
          <Ionicons name="add" size={20} color={colors.white} />
          <Text style={styles.fabLabel}>{t.registerHarvest}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  pulse: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pulseHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pulseTitle: { ...typography.h3, flex: 1 },
  pulsePeriod: { ...typography.micro },
  pulseFigure: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  pulseValue: {
    ...typography.numericLarge,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
  coverageRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  coverageLabel: { ...typography.microCaps },
  coverageValue: { ...typography.micro, flex: 1, textAlign: "right" },
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
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  actionLabel: { ...typography.label, flex: 1 },
});
