import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HorizontalBarChart, MultiSeriesChart } from "../../src/components/charts";
import {
  CoverageBadge,
  DataSection,
  DataWarning,
  MetricSelector,
  PeriodSelector,
  SourceMethodSheet,
} from "../../src/components/data-view";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import { ChartWorkspace } from "../../src/components/terminal/ChartWorkspace";
import { ComparisonSelectionSheet } from "../../src/components/terminal/ComparisonSelectionSheet";
import { PeriodRangeChips } from "../../src/components/terminal/PeriodRangeChips";
import { SelectedEntityTray } from "../../src/components/terminal/SelectedEntityTray";
import { SingleSelectSheet } from "../../src/components/terminal/SingleSelectSheet";
import { EmptyState, ErrorState, FilterChip, LoadingSkeleton, SectionHeader } from "../../src/components/ui";
import { PANEL_UNITS } from "../../src/constants/metrics";
import { useAllCrops, useAllDistricts, usePeriods } from "../../src/hooks/queries";
import { strings } from "../../src/i18n";
import { analyticsApi, mapsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { seriesColor, spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useTheme, useThemedStyles } from "../../src/theme/theme-context";
import type { PeriodRange } from "../../src/utils/analytics";
import { alignIndexedSeries, applyAxisWindow, toSeriesPoints, valueLookup } from "../../src/utils/analytics";
import { periodsCarryingLayer } from "../../src/utils/coverage";
import { mergeCompareSelection } from "../../src/utils/selection";
import { slugifyEntity } from "../../src/utils/slug";

type Mode = "crops" | "districts";
/** Absolute metrics come from the compare-trends view; the index is a separate
 * Python calculation, not a locally derived number. */
type CropMetric = "production_mt" | "harvested_area_ha" | "indexed_yield";
type DistrictMetric = "yield_kg_ha" | "production_mt" | "harvested_area_ha" | "gap";

const MAX_COMPARE_CROPS = 5;
const MAX_COMPARE_DISTRICTS = 4;

const ABSOLUTE_METRIC_UNIT: Record<Exclude<CropMetric, "indexed_yield">, string> = {
  production_mt: PANEL_UNITS.production_mt,
  harvested_area_ha: PANEL_UNITS.harvested_area_ha,
};

const METRIC_UNIT: Record<DistrictMetric, string> = {
  yield_kg_ha: PANEL_UNITS.yield_kg_ha,
  production_mt: PANEL_UNITS.production_mt,
  harvested_area_ha: PANEL_UNITS.harvested_area_ha,
  gap: "%",
};

export default function CompareScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{
    crop?: string;
    crops?: string;
    mode?: string;
    district?: string;
    districts?: string;
  }>();

  // Quick-comparison links and the map's Compare action remount this screen
  // from scratch. Route params therefore *merge into* the last selection —
  // route ids first (the choice just made), stored ids filling the remaining
  // slots — instead of replacing it, so a half-built comparison is not lost.
  const storedSelection = useAppStore((s) => s.compareSelection);
  const setStoredSelection = useAppStore((s) => s.setCompareSelection);
  const initial = useMemo(
    () =>
      mergeCompareSelection(storedSelection, params, {
        maxCrops: MAX_COMPARE_CROPS,
        maxDistricts: MAX_COMPARE_DISTRICTS,
      }),
    // Computed once per mount; later merges would fight the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [mode, setMode] = useState<Mode>(initial.mode);
  const [selectedCrops, setSelectedCrops] = useState<string[]>(initial.crops);
  const [cropMetric, setCropMetric] = useState<CropMetric>("production_mt");
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>(initial.districts);
  const [compareCrop, setCompareCrop] = useState<string | null>(initial.compareCrop);
  const [districtMetric, setDistrictMetric] = useState<DistrictMetric>("yield_kg_ha");
  const [periodCode, setPeriodCode] = useState<string | null>(null);
  const [periodRange, setPeriodRange] = useState<PeriodRange>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cropPickerOpen, setCropPickerOpen] = useState(false);
  // Shared crosshair: the inline chart and the full-screen copy follow one
  // selection, so expanding keeps the period the user was reading.
  const [pointIndex, setPointIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setStoredSelection({ mode, crops: selectedCrops, districts: selectedDistricts, compareCrop });
  }, [mode, selectedCrops, selectedDistricts, compareCrop, setStoredSelection]);

  const crops = useAllCrops();
  const districts = useAllDistricts();
  const periods = usePeriods();

  const compareTrends = useQuery({
    queryKey: ["compare-trends", selectedCrops, cropMetric],
    queryFn: () => analyticsApi.trends({ compare: selectedCrops.join(",") }),
    enabled: mode === "crops" && selectedCrops.length >= 2 && cropMetric !== "indexed_yield",
  });

  const indexed = useQuery({
    queryKey: ["compare-indexed-yield", selectedCrops],
    queryFn: () => analyticsApi.indexedYield({ crops: selectedCrops }),
    enabled: mode === "crops" && selectedCrops.length >= 2 && cropMetric === "indexed_yield",
  });

  const districtPeriods = useMemo(
    () => periodsCarryingLayer(periods.data?.periods ?? [], districtMetric === "gap" ? "gap" : "yield"),
    [periods.data, districtMetric],
  );
  const activePeriod =
    periodCode ?? periods.data?.latest_district ?? districtPeriods[districtPeriods.length - 1]?.period_code ?? null;

  const panel = useQuery({
    queryKey: ["compare-panel", compareCrop, activePeriod],
    queryFn: () => analyticsApi.productivity({ crop: compareCrop as string, periodCode: activePeriod ?? undefined }),
    enabled: mode === "districts" && Boolean(compareCrop) && districtMetric !== "gap",
  });

  const gapLayer = useQuery({
    queryKey: ["compare-gap", compareCrop, activePeriod],
    queryFn: () => mapsApi.districtMetrics({ metric: "gap", crop: compareCrop as string, periodCode: activePeriod ?? undefined }),
    enabled: mode === "districts" && Boolean(compareCrop) && districtMetric === "gap",
  });

  const panelRows = useMemo(
    // Typed from `PeriodProductivityResponse`; no cast is needed.
    () => panel.data?.rows ?? [],
    [panel.data],
  );

  const districtMetricKey: Exclude<DistrictMetric, "gap"> =
    districtMetric === "gap" ? "yield_kg_ha" : districtMetric;

  const districtValues = useMemo(() => {
    const byCode =
      districtMetric === "gap"
        ? valueLookup(gapLayer.data?.districts ?? [], "district_code", "value")
        : valueLookup(panelRows, "district_code", districtMetricKey);
    return selectedDistricts.map((code) => ({
      label: districts.data?.find((item) => item.district_code === code)?.district ?? code,
      value: byCode.get(code) ?? null,
    }));
  }, [districtMetric, gapLayer.data, panelRows, districtMetricKey, selectedDistricts, districts.data]);

  const cropOptions = (crops.data ?? []).map((crop) => ({ id: crop.crop_name, label: crop.crop_name }));
  const districtOptions = (districts.data ?? []).map((district) => ({
    id: district.district_code,
    label: district.district,
  }));

  const trendPoints = compareTrends.data?.points ?? [];
  const indexedSeriesList = useMemo(
    () =>
      alignIndexedSeries(
        (indexed.data?.series ?? []).filter((item) => item.eligible),
        indexed.data?.periods ?? [],
      ).map((item, index) => ({ ...item, color: seriesColor(index) })),
    [indexed.data],
  );

  const seriesList =
    cropMetric === "indexed_yield"
      ? indexedSeriesList
      : (compareTrends.data?.compared_crops ?? []).map((crop, index) => ({
          key: `${cropMetric}:${crop}`,
          label: crop,
          color: seriesColor(index),
          points: toSeriesPoints(trendPoints, `${cropMetric}:${crop}`),
        }));

  const ineligible = (indexed.data?.series ?? []).filter((item) => !item.eligible);
  const activeQuery = cropMetric === "indexed_yield" ? indexed : compareTrends;

  // The same series the inline chart draws, reused by the full-screen workspace
  // so expanding never issues a second analytics request. One shared period
  // window (`applyAxisWindow`) moves every series to the same published
  // positions — it never slices each crop's observations independently.
  const canExpand = mode === "crops" && selectedCrops.length >= 2 && !activeQuery.isLoading;
  const activeSeries = useMemo(
    () => applyAxisWindow(cropMetric === "indexed_yield" ? indexedSeriesList : seriesList, periodRange),
    [cropMetric, indexedSeriesList, seriesList, periodRange],
  );
  const activeUnit =
    cropMetric === "indexed_yield"
      ? "index"
      : (compareTrends.data?.metric_units?.[`${cropMetric}:${selectedCrops[0]}`] ??
        ABSOLUTE_METRIC_UNIT[cropMetric]);

  const compareA11yLabel =
    cropMetric === "indexed_yield"
      ? t.compareIndexA11y.replace("{crops}", selectedCrops.join(", "))
      : t.compareAbsoluteA11y.replace("{crops}", selectedCrops.join(", "));

  const comparisonRows = districtValues.filter(
    (row): row is { label: string; value: number } => row.value !== null,
  );
  const missingRows = districtValues.filter((row) => row.value === null);
  const activePeriodLabel =
    districtPeriods.find((period) => period.period_code === activePeriod)?.label ?? activePeriod ?? "";

  return (
    <ScreenLayout back active="compare">
      <SectionHeader title={t.compareTitle} subtitle={t.compareSubtitle} />
      <View style={styles.row}>
        <FilterChip label={t.compareCrops} selected={mode === "crops"} onPress={() => setMode("crops")} />
        <FilterChip label={t.compareDistricts} selected={mode === "districts"} onPress={() => setMode("districts")} />
      </View>
      {mode === "crops" ? (
        <DataSection
          title={t.compareCrops}
          subtitle={t.cropBoardSubtitle}
          first
          right={
            canExpand ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.expandChart}
                onPress={() => setExpanded(true)}
                hitSlop={8}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primaryStrong }}>
                  {t.expandChart}
                </Text>
              </Pressable>
            ) : null
          }
        >
          <SelectedEntityTray
            entities={selectedCrops.map((name) => ({ id: name, label: name }))}
            onRemove={(id) => setSelectedCrops((list) => list.filter((item) => item !== id))}
            onEdit={() => setSheetOpen(true)}
            editLabel={t.editSelection}
            removeLabel={t.unsaveItem}
            emptyLabel={t.comparePickTwoCropsMessage}
          />
          <Text style={typography.micro}>
            {t.compareCropsSelected
              .replace("{selected}", String(selectedCrops.length))
              .replace("{max}", String(MAX_COMPARE_CROPS))}{" "}
            · {t.publishedCoverage}
          </Text>
          <ComparisonSelectionSheet
            visible={sheetOpen}
            title={t.compareCrops}
            countTemplate={t.compareCropsSelected}
            searchPlaceholder={t.searchCrops}
            options={cropOptions}
            selected={selectedCrops}
            max={MAX_COMPARE_CROPS}
            normalize={slugifyEntity}
            onApply={(next) => {
              setSelectedCrops(next);
              setSheetOpen(false);
            }}
            onCancel={() => setSheetOpen(false)}
          />

          <MetricSelector
            label={t.selectIndicator}
            value={cropMetric}
            onChange={(id) => {
              setCropMetric(id as CropMetric);
              setPointIndex(null);
            }}
            options={[
              { id: "production_mt", label: t.metricProduction },
              { id: "harvested_area_ha", label: t.metricArea },
              { id: "indexed_yield", label: t.indexedYield, hint: "100" },
            ]}
          />

          {selectedCrops.length < 2 ? (
            <EmptyState
              title={t.comparePickTwoCropsTitle}
              message={t.comparePickTwoCropsMessage}
              icon="git-compare-outline"
            />
          ) : activeQuery.isError ? (
            <ErrorState message={t.errorGeneric} onRetry={() => void activeQuery.refetch()} />
          ) : activeQuery.isLoading ? (
            <LoadingSkeleton height={240} />
          ) : cropMetric === "indexed_yield" ? (
            <>
              {indexedSeriesList.length ? (
                <MultiSeriesChart
                  series={activeSeries}
                  unit="index"
                  height={240}
                  note={t.compareIndexBaselineNote.replace(
                    "{baseline}",
                    indexed.data?.baseline_definition ?? "the crop's own published baseline",
                  )}
                  accessibilityLabel={compareA11yLabel}
                  selectedIndex={pointIndex}
                  onSelectIndex={(index) => setPointIndex(index)}
                />
              ) : (
                <EmptyState title={t.noDataAvailable} message={t.compareNoEligibleIndex} />
              )}
              <PeriodRangeChips value={periodRange} onChange={setPeriodRange} />
              <DataWarning text={t.indexedYieldNote} />
              {ineligible.length ? (
                <DataWarning
                  text={t.compareNotIndexed.replace(
                    "{items}",
                    ineligible.map((item) => `${item.crop} (${item.reason ?? "ineligible"})`).join("; "),
                  )}
                />
              ) : null}
              <SourceMethodSheet
                title={t.sourceAndMethod}
                source={indexed.data?.provenance?.source_id}
                period={indexed.data?.provenance?.source_period ?? null}
                coverage={t.compareCoverageEligible.replace("{count}", String(indexedSeriesList.length))}
                unit={indexed.data?.unit ?? "index"}
                method={indexed.data?.provenance?.method}
                limitations={indexed.data?.provenance?.limitations}
              />
            </>
          ) : (
            <>
              <MultiSeriesChart
                series={activeSeries}
                unit={compareTrends.data?.metric_units?.[`${cropMetric}:${selectedCrops[0]}`] ?? ABSOLUTE_METRIC_UNIT[cropMetric]}
                height={240}
                accessibilityLabel={compareA11yLabel}
                selectedIndex={pointIndex}
                onSelectIndex={(index) => setPointIndex(index)}
              />
              <PeriodRangeChips value={periodRange} onChange={setPeriodRange} />
              <DataWarning text={t.compareAbsolutesOnlyNote} />
              <SourceMethodSheet
                title={t.sourceAndMethod}
                source={compareTrends.data?.provenance?.source_id}
                period={trendPoints.map((point) => point.period).join(", ")}
                coverage={t.compareCoverageNationalCrop}
                unit={compareTrends.data?.metric_units?.[`${cropMetric}:${selectedCrops[0]}`]}
                method={compareTrends.data?.provenance?.method}
                limitations={compareTrends.data?.provenance?.limitations}
              />
            </>
          )}

          <ChartWorkspace
            visible={expanded}
            title={t.compareTitle}
            subtitle={t.compareSubtitle}
            onClose={() => setExpanded(false)}
          >
            <View style={{ gap: spacing.sm }}>
              <PeriodRangeChips value={periodRange} onChange={setPeriodRange} />
              <MultiSeriesChart
                series={activeSeries}
                unit={activeUnit}
                height={360}
                accessibilityLabel={compareA11yLabel}
                selectedIndex={pointIndex}
                onSelectIndex={(index) => setPointIndex(index)}
              />
            </View>
          </ChartWorkspace>
        </DataSection>
      ) : (
        <DataSection title={t.compareDistricts} subtitle={t.compareSelectCropAndPeriod} first>
          {/* One searchable picker instead of a wall of 17 crop chips. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.compareChooseCrop}
            accessibilityHint={compareCrop ? compareCrop : undefined}
            onPress={() => setCropPickerOpen(true)}
            style={styles.cropPicker}
          >
            <Ionicons name="leaf-outline" size={16} color={colors.primaryStrong} />
            <Text numberOfLines={1} style={styles.cropPickerText}>
              {compareCrop ?? t.compareChooseCrop}
            </Text>
            <Ionicons name="search" size={15} color={colors.slate500} />
          </Pressable>
          <SingleSelectSheet
            visible={cropPickerOpen}
            title={t.selectCrop}
            subtitle={t.compareSelectCropAndPeriod}
            searchPlaceholder={t.searchCrops}
            options={cropOptions}
            selected={compareCrop}
            onApply={(next) => {
              setCompareCrop(next);
              setCropPickerOpen(false);
            }}
            onCancel={() => setCropPickerOpen(false)}
          />

          {!compareCrop ? (
            <EmptyState title={t.pickCropFirst} message={t.compareSelectCropAndPeriod} icon="leaf-outline" />
          ) : (
            <>
              <Text style={typography.micro}>
                {`${compareCrop} · ${activePeriodLabel}`}
              </Text>

              <PeriodSelector
                label={t.selectPeriod}
                value={activePeriod}
                onChange={setPeriodCode}
                options={districtPeriods.map((period) => ({
                  id: period.period_code,
                  label: period.label,
                  hint: t.compareDistrictHint.replace("{count}", String(period.n_districts)),
                }))}
              />

              <MetricSelector
                label={t.selectIndicator}
                value={districtMetric}
                onChange={(id) => setDistrictMetric(id as DistrictMetric)}
                options={[
                  { id: "yield_kg_ha", label: t.metricYield, hint: "kg/ha" },
                  { id: "production_mt", label: t.metricProduction, hint: "t" },
                  { id: "harvested_area_ha", label: t.metricArea, hint: "ha" },
                  { id: "gap", label: t.metricGap, hint: "%" },
                ]}
              />

              <SelectedEntityTray
                entities={selectedDistricts.map((code) => ({
                  id: code,
                  label: districts.data?.find((item) => item.district_code === code)?.district ?? code,
                }))}
                onRemove={(id) => setSelectedDistricts((list) => list.filter((item) => item !== id))}
                onEdit={() => setSheetOpen(true)}
                editLabel={t.editSelection}
                removeLabel={t.unsaveItem}
                emptyLabel={t.comparePickTwoDistrictsMessage}
              />
              <Text style={typography.micro}>
                {t.compareDistrictsSelected
                  .replace("{selected}", String(selectedDistricts.length))
                  .replace("{max}", String(MAX_COMPARE_DISTRICTS))}
              </Text>
              <ComparisonSelectionSheet
                visible={sheetOpen}
                title={t.compareDistricts}
                countTemplate={t.compareDistrictsSelected}
                searchPlaceholder={t.searchDistricts}
                options={districtOptions}
                selected={selectedDistricts}
                max={MAX_COMPARE_DISTRICTS}
                normalize={slugifyEntity}
                onApply={(next) => {
                  setSelectedDistricts(next);
                  setSheetOpen(false);
                }}
                onCancel={() => setSheetOpen(false)}
              />

              {selectedDistricts.length < 2 ? (
                <EmptyState
                  title={t.comparePickTwoDistrictsTitle}
                  message={t.comparePickTwoDistrictsMessage}
                  icon="git-compare-outline"
                />
              ) : districtMetric === "gap" ? (
                // A failed request is recoverable, not "no data".
                gapLayer.isError ? (
                  <ErrorState message={t.errorGeneric} onRetry={() => void gapLayer.refetch()} />
                ) : gapLayer.isLoading ? (
                  <LoadingSkeleton height={200} />
                ) : comparisonRows.length ? (
                  <>
                    <HorizontalBarChart values={comparisonRows} unit="%" />
                    <DataWarning text={t.compareGapBenchmarkNote} />
                  </>
                ) : (
                  <EmptyState title={gapLayer.data?.message ?? t.noDataAvailable} />
                )
              ) : panel.isError ? (
                <ErrorState message={t.errorGeneric} onRetry={() => void panel.refetch()} />
              ) : panel.isLoading ? (
                <LoadingSkeleton height={200} />
              ) : comparisonRows.length ? (
                <>
                  <HorizontalBarChart values={comparisonRows} unit={METRIC_UNIT[districtMetric]} />
                  <CoverageBadge level="district" period={panel.data?.label ?? activePeriod} source={panel.data?.provenance?.source_id ?? null} />
                  <Text style={typography.micro}>
                    {t.compareCoverageMetadata.replace(
                      "{count}",
                      String(panel.data?.n_crops ?? 0),
                    )}
                  </Text>
                  <SourceMethodSheet
                    title={t.sourceAndMethod}
                    source={panel.data?.provenance?.source_id}
                    period={panel.data?.label ?? activePeriod}
                    coverage={t.compareCoverageObservations.replace(
                      "{count}",
                      String(panel.data?.n_observations ?? 0),
                    )}
                    unit={METRIC_UNIT[districtMetric]}
                    method={panel.data?.provenance?.method}
                    limitations={panel.data?.provenance?.limitations}
                  />
                </>
              ) : (
                <EmptyState title={t.errorNoDistrictData} message={t.noDataAvailable} />
              )}

              {missingRows.length ? (
                <DataWarning
                  text={t.compareNotPublishedForPeriod.replace(
                    "{items}",
                    missingRows.map((row) => row.label).join(", "),
                  )}
                />
              ) : null}
            </>
          )}
        </DataSection>
      )}
    </ScreenLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.sm },
    cropPicker: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 46,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.mintSoft,
    },
    cropPickerText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.forestDeep },
  });
