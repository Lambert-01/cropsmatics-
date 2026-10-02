import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FactorAssociation } from "../../../src/components/analytics/FactorAssociation";
import { HorizontalBarChart, StackedShareBar, TimeSeriesChart } from "../../../src/components/charts";
import {
  ChangeIndicator,
  CoverageBadge,
  DataSection,
  DataWarning,
  SourceMethodSheet,
} from "../../../src/components/data-view";
import { ScreenLayout } from "../../../src/components/ScreenLayout";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../../src/components/ui";
import { PANEL_UNITS } from "../../../src/constants/metrics";
import { getSavedItem, removeSavedItem, saveItem } from "../../../src/database";
import { useNationalBoard, usePeriods } from "../../../src/hooks/queries";
import { strings, type Strings } from "../../../src/i18n";
import { analyticsApi, cropsApi, mapsApi, postHarvestApi } from "../../../src/services/api";
import { useAppStore } from "../../../src/store/useAppStore";
import { chart, radius, spacing } from "../../../src/theme";
import type { Palette, Typography } from "../../../src/theme";
import { useThemedStyles, useTheme } from "../../../src/theme/theme-context";
import {
  boardPoints,
  changeFromApi,
  filterSeason,
  fromPeriodCoded,
  latestSeason,
  publishedCount,
  toSeriesPoints,
} from "../../../src/utils/analytics";
import { periodsCarryingLayer } from "../../../src/utils/coverage";

/** National metrics, in the board's own keys. */
const NATIONAL_METRICS = ["yield_mt_ha", "production_mt", "harvested_area_ha"] as const;
type NationalMetric = (typeof NATIONAL_METRICS)[number];

/** District cross-section metrics: the canonical panel, plus the Python gap. */
const DISTRICT_METRICS = ["yield_kg_ha", "production_mt", "harvested_area_ha", "gap"] as const;
type DistrictMetric = (typeof DISTRICT_METRICS)[number];

/**
 * The display name of a board/panel metric key.
 *
 * One lookup for the national selector, the district selector and every
 * "no published …" sentence. The two selectors previously each carried their
 * own nested ternary, so a new metric had to be added in three places or the
 * screens disagreed about what a column was called.
 *
 * Note the two yield keys are deliberately not the same label: `yield_mt_ha`
 * (t/ha, national board) and `yield_kg_ha` (kg/ha, district panel) are separate
 * published columns, and the unit beside the label is what distinguishes them.
 */
function metricLabelFor(t: Strings, metric: NationalMetric | DistrictMetric): string {
  switch (metric) {
    case "yield_mt_ha":
    case "yield_kg_ha":
      return t.metricYield;
    case "production_mt":
      return t.metricProduction;
    case "harvested_area_ha":
      return t.metricArea;
    case "gap":
      return t.metricGap;
  }
}

type PeriodView = "all" | "same-season";

export default function CropTerminalScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ cropCode: string }>();
  const slug = params.cropCode;

  const [nationalMetric, setNationalMetric] = useState<NationalMetric>("yield_mt_ha");
  const [periodView, setPeriodView] = useState<PeriodView>("all");
  const [districtMetric, setDistrictMetric] = useState<DistrictMetric>("yield_kg_ha");
  const [districtKey, setDistrictKey] = useState<string | null>(null);
  const [periodCode, setPeriodCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => {
    try {
      return Boolean(getSavedItem("crop", slug));
    } catch {
      return false;
    }
  });

  const crop = useQuery({ queryKey: ["crop", slug], queryFn: () => cropsApi.get(slug) });
  const name = crop.data?.crop_name;
  const periods = usePeriods();

  // --- national series: one cached board read, axis-aligned, delta from Python -
  const board = useNationalBoard(name ? [name] : []);
  const entry = board.data?.crops?.[0] ?? null;
  const axis = useMemo(() => board.data?.periods ?? [], [board.data]);
  const axisLabels = useMemo(() => board.data?.period_labels ?? {}, [board.data]);
  const nationalUnit = board.data?.metric_units?.[nationalMetric] ?? null;

  const allPoints = useMemo(
    () =>
      entry
        ? boardPoints({ periods: axis, period_labels: axisLabels, series: entry.series }, [
            nationalMetric,
          ])
        : [],
    [entry, axis, axisLabels, nationalMetric],
  );

  const seasonLetter = latestSeason(allPoints);
  const sameSeasonPoint = useMemo(
    () => (periodView === "same-season" ? filterSeason(allPoints, seasonLetter) : allPoints),
    [periodView, allPoints, seasonLetter],
  );
  // The Python-computed same-season delta is the same comparison in both views,
  // so the readout never has to derive one.
  const nationalChange = changeFromApi(entry?.changes?.[nationalMetric]);
  const nationalPoints = useMemo(
    () => toSeriesPoints(sameSeasonPoint, nationalMetric),
    [sameSeasonPoint, nationalMetric],
  );
  const nationalPublished = publishedCount(nationalPoints);
  const latestIndex = useMemo(() => {
    for (let index = nationalPoints.length - 1; index >= 0; index -= 1) {
      if (nationalPoints[index].value !== null) return index;
    }
    return -1;
  }, [nationalPoints]);

  // --- district cross-section -------------------------------------------------
  const districtPeriods = periodsCarryingLayer(periods.data?.periods ?? [], "gap");
  const activePeriod =
    periodCode ??
    periods.data?.latest_district ??
    districtPeriods[districtPeriods.length - 1]?.period_code ??
    null;

  const panel = useQuery({
    queryKey: ["crop-panel", name, activePeriod],
    queryFn: () => analyticsApi.productivity({ crop: name as string, periodCode: activePeriod ?? undefined }),
    enabled: Boolean(name) && districtMetric !== "gap",
  });

  const gapLayer = useQuery({
    queryKey: ["crop-gap-layer", name, activePeriod],
    queryFn: () =>
      mapsApi.districtMetrics({ metric: "gap", crop: name as string, periodCode: activePeriod ?? undefined }),
    enabled: Boolean(name) && districtMetric === "gap",
  });

  // Rows are typed from `PeriodProductivityResponse`; no cast is needed.
  const panelRows = useMemo(() => panel.data?.rows ?? [], [panel.data]);

  const crossSection = useMemo(() => {
    if (districtMetric === "gap") {
      return (gapLayer.data?.districts ?? [])
        .filter((row) => row.value !== null && row.district_code)
        .map((row) => ({ label: row.district, value: row.value as number }))
        .sort((a, b) => b.value - a.value);
    }
    const key = districtMetric as "yield_kg_ha" | "production_mt" | "harvested_area_ha";
    return panelRows
      .map((row) => ({ label: row.district ?? "—", value: row[key] ?? null }))
      .filter((row): row is { label: string; value: number } => row.value !== null)
      .sort((a, b) => b.value - a.value);
  }, [panelRows, districtMetric, gapLayer.data]);

  const districtOptions = useMemo(() => {
    const codes = new Map<string, string>();
    for (const row of panelRows) if (row.district_code && row.district) codes.set(row.district_code, row.district);
    for (const row of gapLayer.data?.districts ?? []) {
      if (row.district_code && row.district) codes.set(row.district_code, row.district);
    }
    return Array.from(codes, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [panelRows, gapLayer.data]);

  // --- one district's own published series ------------------------------------
  const districtMetricKey: "yield_kg_ha" | "production_mt" | "harvested_area_ha" =
    districtMetric === "gap" ? "yield_kg_ha" : districtMetric;

  const districtSeries = useQuery({
    queryKey: ["crop-district-series", name, districtKey],
    queryFn: () => analyticsApi.periodTrend({ crop: name as string, district: districtKey as string }),
    enabled: Boolean(name) && Boolean(districtKey) && districtMetric !== "gap",
  });

  const districtRaw = useMemo(
    () => fromPeriodCoded(districtSeries.data?.points ?? []),
    [districtSeries.data],
  );
  const districtPoints = useMemo(
    () => toSeriesPoints(districtRaw, districtMetricKey),
    [districtRaw, districtMetricKey],
  );
  const districtPublished = publishedCount(districtPoints);
  const districtUnit =
    districtSeries.data?.unit?.[districtMetricKey] ?? PANEL_UNITS[districtMetricKey];
  const districtChange = changeFromApi(districtSeries.data?.change);
  const selectedDistrictName =
    districtOptions.find((option) => option.id === districtKey)?.label ?? null;

  // --- post-harvest composition ----------------------------------------------
  const postHarvest = useQuery({
    queryKey: ["crop-postharvest", name],
    queryFn: () => postHarvestApi.summary({ crop: name as string }),
    enabled: Boolean(name),
  });
  const share = postHarvest.data?.crops?.[0];

  // --- factors associated with this crop's yield -----------------------------
  // No period is requested: the factor table is a single release, and asking for
  // a period it does not carry would return nulls. The API says so in `note`.
  const cropFactors = useQuery({
    queryKey: ["crop-factors", name],
    queryFn: () => analyticsApi.factors({ crop: name as string }),
    enabled: Boolean(name),
  });

  if (crop.isError) {
    return (
      <ScreenLayout back active="explore">
        <ErrorState message={t.errorGeneric} onRetry={() => void crop.refetch()} />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout back active="explore">
      {/* ---- Compact toolbar: identity, coverage, actions ------------------ */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.title}>
              {name ?? slug}
            </Text>
            <Text numberOfLines={1} style={typography.micro}>
              {[crop.data?.category, crop.data?.kinyarwanda_name].filter(Boolean).join(" · ") || "—"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? t.unsaveItem : t.saveItem}
            onPress={() => {
              try {
                if (saved) removeSavedItem("crop", slug);
                else
                  saveItem({
                    type: "crop",
                    entityKey: slug,
                    title: crop.data?.crop_name ?? slug,
                    subtitle: crop.data?.category,
                  });
                setSaved(!saved);
              } catch {
                // device storage unavailable — no crash
              }
            }}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={19}
              color={colors.primaryStrong}
            />
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <ToolbarAction
            icon="git-compare-outline"
            label={t.compare}
            onPress={() => router.push({ pathname: "/explore/compare", params: { crop: name ?? slug } })}
          />
          <ToolbarAction
            icon="map-outline"
            label={t.maps}
            onPress={() => router.push({ pathname: "/maps", params: { crop: name ?? slug } })}
          />
          <ToolbarAction
            icon="chatbubble-ellipses-outline"
            label={t.ask}
            onPress={() =>
              router.push({
                pathname: "/ask",
                params: { q: `What does the published data show for ${name ?? slug} in Rwanda?` },
              })
            }
          />
        </View>

        {/* Coverage is stated once, here, and not repeated under every section. */}
        <CoverageBadge
          level="national series"
          period={axis.length ? `${axis[0]}–${axis[axis.length - 1]}` : null}
          source={board.data?.provenance?.source_id ?? null}
        />
      </View>

      {/* ---- National series: the main analytical surface ------------------ */}
      <DataSection title={t.nationalSeries} subtitle={t.pulseSubtitle} first>
        <MetricSelectorRow
          options={NATIONAL_METRICS.map((metric) => ({
            id: metric,
            label: metricLabelFor(t, metric),
            unit: board.data?.metric_units?.[metric] ?? null,
          }))}
          value={nationalMetric}
          onChange={(id) => setNationalMetric(id as NationalMetric)}
        />

        <MetricSelectorRow
          options={[
            { id: "all", label: t.allPublishedPeriods, unit: null },
            { id: "same-season", label: t.sameSeasonView, unit: seasonLetter ? `Season ${seasonLetter}` : null },
          ]}
          value={periodView}
          onChange={(id) => setPeriodView(id as PeriodView)}
          compact
        />

        {board.isError ? (
          <ErrorState message={t.errorGeneric} onRetry={() => void board.refetch()} />
        ) : board.isLoading ? (
          <LoadingSkeleton height={chart.tallHeight} />            ) : !entry || nationalPublished === 0 ? (
          <EmptyState
            title={t.noDataAvailable}
            /* Names the selection. `.toLowerCase()` on a translated string is
               also wrong: it is a no-op in Kinyarwanda and mangles German-style
               nouns, so the sentence is composed from a template instead. */
            message={t.noPublishedSelection
              .replace("{metric}", metricLabelFor(t, nationalMetric))
              .replace("{selection}", name ?? slug)}
          />
        ) : (
          <>
            {/* The figure sits directly above the plot, so the metric, its unit
                and its period are readable before the chart is interpreted. */}
            <View style={styles.figureRow}>
              <Text style={styles.figureValue}>
                {nationalPublished === 0 || latestIndex < 0
                  ? t.notPublished
                  : (nationalPoints[latestIndex].value ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
              </Text>
              <View style={{ flex: 1 }}>
                {nationalUnit ? <Text style={typography.unit}>{nationalUnit}</Text> : null}
                <Text numberOfLines={1} style={typography.micro}>
                  {latestIndex >= 0
                    ? `${nationalPoints[latestIndex]?.label ?? ""}${
                        periodView === "same-season" && seasonLetter
                          ? ` · ${t.seasonWord} ${seasonLetter} ${t.onlySuffix}`
                          : ""
                      }`
                    : ""}
                </Text>
              </View>
            </View>

            <TimeSeriesChart
              series={[{ key: nationalMetric, label: name ?? slug, points: nationalPoints }]}
              unit={nationalUnit}
              height={chart.tallHeight}
              accessibilityLabel={t.trendChartA11y
                .replace("{metric}", metricLabelFor(t, nationalMetric))
                .replace("{selection}", name ?? slug)}
            />

            <View style={styles.changeRow}>
              <ChangeIndicator change={nationalChange} unavailableNote={t.noComparableChange} />
              {nationalChange ? <Text style={typography.micro}>same season</Text> : null}
            </View>

            {nationalPublished === 1 ? <DataWarning tone="slate" text={t.singlePointNote} /> : null}

            {periodView === "same-season" ? (
              <DataWarning tone="slate" text={t.sameSeasonNotSeries} />
            ) : null}

            <SourceMethodSheet
              title={t.sourceAndMethod}
              source={board.data?.provenance?.source_id}
              period={axis.length ? `${axis[0]}–${axis[axis.length - 1]}` : null}
              coverage="national crop series"
              unit={nationalUnit}
              method={board.data?.provenance?.method}
              limitations={board.data?.provenance?.limitations}
            />
          </>
        )}
      </DataSection>

      {/* ---- District cross-section and one district's own series ---------- */}
      <DataSection title={t.districts} subtitle={t.districtSeries}>
        <PeriodChips
          options={districtPeriods.map((period) => ({
            id: period.period_code,
            label: period.label,
            hint: `${period.n_districts}`,
          }))}
          value={activePeriod}
          onChange={setPeriodCode}
        />

        {districtPeriods.length === 0 ? <DataWarning text={t.errorNoDistrictPeriod} /> : null}

        <MetricSelectorRow
          options={DISTRICT_METRICS.map((metric) => ({
            id: metric,
            label: metricLabelFor(t, metric),
            unit: metric === "gap" ? "%" : PANEL_UNITS[metric],
          }))}
          value={districtMetric}
          onChange={(id) => {
            setDistrictMetric(id as DistrictMetric);
            setDistrictKey(null);
          }}
        />

        {districtMetric === "gap" ? (
          <>
            <DataWarning text={t.gapBenchmarkNote} />
            {gapLayer.isLoading ? (
              <LoadingSkeleton height={180} />
            ) : crossSection.length ? (
              <HorizontalBarChart values={crossSection} unit="%" maxItems={30} />
            ) : (
              <EmptyState
                title={gapLayer.data?.message ?? t.errorNoDistrictData}
                message={
                  gapLayer.data?.available_period
                    ? `Latest district release: ${gapLayer.data.available_period}`
                    : undefined
                }
              />
            )}
          </>
        ) : (
          <>
            <DistrictPicker
              label={t.pickDistrict}
              options={districtOptions}
              value={districtKey}
              onChange={setDistrictKey}
            />

            {districtKey ? (
              districtSeries.isLoading ? (
                <LoadingSkeleton height={chart.height} />
              ) : districtSeries.isError || districtPublished === 0 ? (
                <EmptyState
                  title={t.noDataAvailable}
                  message={t.noPublishedSelection
                    .replace("{metric}", metricLabelFor(t, districtMetric))
                    .replace("{selection}", selectedDistrictName ?? "")}
                />
              ) : districtPublished === 1 ? (
                /* One published point. Shown as a value, never as a trend and
                   never with a rank movement. */
                <View style={{ gap: 4 }}>
                  <Text style={typography.microCaps}>{`${selectedDistrictName ?? ""} · ${districtUnit ?? ""}`}</Text>
                  <Text style={styles.figureValue}>
                    {(districtPoints.find((point) => point.value !== null)?.value ?? 0).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 2 },
                    )}
                  </Text>
                  <DataWarning
                    tone="slate"
                    text={t.singlePointNote}
                  />
                </View>
              ) : (
                <>
                  <TimeSeriesChart
                    series={[
                      {
                        key: `${districtKey}-${districtMetricKey}`,
                        label: selectedDistrictName ?? "District",
                        points: districtPoints,
                      },
                    ]}
                    unit={districtUnit}
                    height={chart.height}
                    accessibilityLabel={t.trendChartA11y
                      .replace("{metric}", metricLabelFor(t, districtMetric))
                      .replace(
                        "{selection}",
                        selectedDistrictName ?? t.districtSeries,
                      )}
                  />
                  <ChangeIndicator change={districtChange} unavailableNote={t.noComparableChange} />
                </>
              )
            ) : panel.isLoading ? (
              <LoadingSkeleton height={180} />
            ) : crossSection.length ? (
              <HorizontalBarChart
                values={crossSection}
                unit={PANEL_UNITS[districtMetric as "yield_kg_ha" | "production_mt" | "harvested_area_ha"]}
                maxItems={30}
              />
            ) : (
              <EmptyState title={t.errorNoDistrictData} message={t.noDataAvailable} />
            )}
          </>
        )}

        <SourceMethodSheet
          title={t.sourceAndMethod}
          source={
            districtMetric === "gap"
              ? (gapLayer.data?.source_id ?? gapLayer.data?.provenance?.source_id)
              : (panel.data?.provenance?.source_id ?? districtSeries.data?.provenance?.source_id)
          }
          period={
            districtMetric === "gap"
              ? (gapLayer.data?.period_code ?? activePeriod)
              : (panel.data?.label ?? activePeriod)
          }
          coverage={
            districtMetric === "gap"
              ? "district · benchmark per crop"
              : `district · ${panel.data?.n_districts ?? crossSection.length} districts`
          }
          unit={districtMetric === "gap" ? "%" : PANEL_UNITS[districtMetric as "yield_kg_ha" | "production_mt" | "harvested_area_ha"]}
          method={districtMetric === "gap" ? gapLayer.data?.provenance?.method : panel.data?.provenance?.method}
          limitations={
            districtMetric === "gap"
              ? gapLayer.data?.provenance?.limitations
              : panel.data?.provenance?.limitations
          }
        />
      </DataSection>

      {/* ---- Factors associated with yield --------------------------------- */}
      <DataSection title={t.factorsTitle} subtitle={t.factorsSubtitle}>
        {cropFactors.isError ? (
          <Text style={typography.caption}>{t.errorGeneric}</Text>
        ) : cropFactors.isLoading ? (
          <LoadingSkeleton height={180} />
        ) : (
          <FactorAssociation
            factors={cropFactors.data?.factors ?? []}
            note={cropFactors.data?.note ?? null}
            source={cropFactors.data?.provenance?.source_id}
            method={cropFactors.data?.provenance?.method}
            limitations={cropFactors.data?.provenance?.limitations}
          />
        )}
      </DataSection>

      {/* ---- Post-harvest use ---------------------------------------------- */}
      <DataSection title={t.useOfProduction} subtitle={t.postHarvest}>
        {postHarvest.isLoading ? (
          <LoadingSkeleton height={180} />
        ) : share ? (
          <>
            <StackedShareBar
              sumOk={share.shares_sum_ok}
              segments={[
                { key: "sold", label: t.sold, value: share.sold_pct, color: colors.primary },
                { key: "stored", label: t.stored, value: share.stored_pct, color: colors.blue },
                { key: "own", label: t.homeConsumption, value: share.own_consumption_pct, color: colors.amber },
                { key: "seed", label: t.seed, value: share.seeds_pct, color: colors.forest },
                { key: "losses", label: t.losses, value: share.post_harvest_losses_pct, color: colors.danger },
              ]}
            />
            <DataWarning text={t.nationalOnlyCropLevel} />
            <SourceMethodSheet
              title={t.sourceAndMethod}
              source={postHarvest.data?.provenance?.source_id}
              coverage="national crop-level"
              unit="%"
              method={postHarvest.data?.provenance?.method}
              limitations={postHarvest.data?.provenance?.limitations}
            />
          </>
        ) : (
          <EmptyState title={t.noDataAvailable} icon="cube-outline" />
        )}
      </DataSection>
    </ScreenLayout>
  );
}

/** Dense metric switcher: label plus the unit it will be plotted in. */
function MetricSelectorRow({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: { id: string; label: string; unit: string | null }[];
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.selectorRow}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.unit ? `${option.label}, ${option.unit}` : option.label}
            onPress={() => onChange(option.id)}
            hitSlop={6}
            style={[
              styles.selectorChip,
              compact ? styles.selectorChipCompact : null,
              selected ? styles.selectorChipSelected : null,
            ]}
          >
            <Text style={[styles.selectorLabel, selected ? styles.selectorLabelSelected : null]}>
              {option.label}
            </Text>
            {option.unit ? (
              <Text style={[styles.selectorUnit, selected ? styles.selectorUnitSelected : null]}>
                {option.unit}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function PeriodChips({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; hint: string }[];
  value: string | null;
  onChange: (code: string) => void;
}) {
  const t = strings(useAppStore((s) => s.language));
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.selectorRow}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label}, ${option.hint} ${t.districts}`}
            onPress={() => onChange(option.id)}
            hitSlop={6}
            style={[styles.selectorChip, selected ? styles.selectorChipSelected : null]}
          >
            <Text style={[styles.selectorLabel, selected ? styles.selectorLabelSelected : null]}>
              {option.label}
            </Text>
            <Text style={[styles.selectorUnit, selected ? styles.selectorUnitSelected : null]}>
              {`${option.hint} ${t.districts}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function DistrictPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = strings(useAppStore((s) => s.language));
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!options.length) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={typography.microCaps}>{label.toUpperCase()}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectorRow}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
          accessibilityLabel={t.districts}
          onPress={() => onChange(null)}
          hitSlop={6}
          style={[styles.selectorChip, styles.selectorChipCompact, value === null ? styles.selectorChipSelected : null]}
        >
          <Text style={[styles.selectorLabel, value === null ? styles.selectorLabelSelected : null]}>
            {t.districts}
          </Text>
        </Pressable>
        {options.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.id }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.id)}
            hitSlop={6}
            style={[
              styles.selectorChip,
              styles.selectorChipCompact,
              value === option.id ? styles.selectorChipSelected : null,
            ]}
          >
            <Text style={[styles.selectorLabel, value === option.id ? styles.selectorLabelSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ToolbarAction({
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed ? { opacity: 0.8 } : null]}
    >
      <Ionicons name={icon} size={16} color={colors.primaryStrong} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette, typography: Typography) =>
  StyleSheet.create({
  toolbar: { gap: spacing.sm },
  toolbarTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.h1, fontSize: 22 },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  action: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 88,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { color: colors.primaryStrong, fontWeight: "600", fontSize: 13 },
  figureRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  figureValue: {
    ...typography.numericLarge,
    fontSize: 28,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
  changeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  selectorRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  selectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectorChipCompact: { minHeight: 34 },
  selectorChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectorLabel: { fontSize: 13, fontWeight: "600", color: colors.slate700 },
  selectorLabelSelected: { color: colors.white },
  selectorUnit: { fontSize: 10, color: colors.slate500, fontVariant: ["tabular-nums"] },
  selectorUnitSelected: { color: colors.mintLight },
});
