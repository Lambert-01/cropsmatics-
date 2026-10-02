import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
import { EmptyState, ErrorState, FilterChip, LoadingSkeleton, SearchBar, SectionHeader } from "../../src/components/ui";
import { PANEL_UNITS } from "../../src/constants/metrics";
import { useAllCrops, useAllDistricts, usePeriods } from "../../src/hooks/queries";
import { strings } from "../../src/i18n";
import { analyticsApi, mapsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { seriesColor, spacing, typography } from "../../src/theme";
import { alignIndexedSeries, toSeriesPoints, valueLookup } from "../../src/utils/analytics";
import { periodsCarryingLayer } from "../../src/utils/coverage";
import { slugifyEntity } from "../../src/utils/slug";

type Mode = "crops" | "districts";
/** Absolute metrics come from the compare-trends view; the index is a separate
 * Python calculation, not a locally derived number. */
type CropMetric = "production_mt" | "harvested_area_ha" | "indexed_yield";
type DistrictMetric = "yield_kg_ha" | "production_mt" | "harvested_area_ha" | "gap";

interface PanelRow {
  district?: string | null;
  district_code?: string | null;
  yield_kg_ha?: number | null;
  production_mt?: number | null;
  harvested_area_ha?: number | null;
}

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
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ crop?: string }>();

  const [mode, setMode] = useState<Mode>("crops");
  const [selectedCrops, setSelectedCrops] = useState<string[]>(params.crop ? [params.crop] : []);
  const [cropMetric, setCropMetric] = useState<CropMetric>("production_mt");
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [compareCrop, setCompareCrop] = useState<string | null>(params.crop ?? null);
  const [districtMetric, setDistrictMetric] = useState<DistrictMetric>("yield_kg_ha");
  const [periodCode, setPeriodCode] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const crops = useAllCrops();
  const districts = useAllDistricts();
  const periods = usePeriods();

  // --- crops over time ------------------------------------------------------
  // The query key carries the selected crops and the metric, so a change really
  // refetches instead of reusing a stale comparison.
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

  // --- districts, like for like --------------------------------------------
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
    () => (panel.data?.rows ?? []) as unknown as PanelRow[],
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

  const toggle = (list: string[], setList: (value: string[]) => void, value: string, max: number) => {
    if (list.includes(value)) setList(list.filter((item) => item !== value));
    else if (list.length < max) setList([...list, value]);
  };

  const filteredCrops = (crops.data ?? []).filter(
    (crop) => !query || slugifyEntity(crop.crop_name).includes(slugifyEntity(query)),
  );
  const filteredDistricts = (districts.data ?? []).filter(
    (district) => !query || slugifyEntity(district.district).includes(slugifyEntity(query)),
  );

  const trendPoints = compareTrends.data?.points ?? [];
  // The service aligns every series to one period axis; alignIndexedSeries
  // verifies that contract and repairs it if it does not hold, so two crops
  // with different available periods can never be plotted by array position.
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

  const comparisonRows = districtValues.filter(
    (row): row is { label: string; value: number } => row.value !== null,
  );
  const missingRows = districtValues.filter((row) => row.value === null);

  return (
    <ScreenLayout back active="compare">
      <SectionHeader title={t.compareTitle} subtitle={t.compareSubtitle} />
      <View style={styles.row}>
        <FilterChip label={t.compareCrops} selected={mode === "crops"} onPress={() => setMode("crops")} />
        <FilterChip label={t.compareDistricts} selected={mode === "districts"} onPress={() => setMode("districts")} />
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={mode === "crops" ? t.searchCrops : t.searchDistricts}
      />

      {mode === "crops" ? (
        <DataSection title={t.compareCrops} subtitle={t.cropBoardSubtitle} first>
          <View style={styles.chips}>
            {filteredCrops.map((crop) => (
              <FilterChip
                key={crop.crop_code}
                label={crop.crop_name}
                selected={selectedCrops.includes(crop.crop_name)}
                onPress={() => toggle(selectedCrops, setSelectedCrops, crop.crop_name, 4)}
              />
            ))}
          </View>
          <Text style={typography.micro}>{`${selectedCrops.length}/4 · ${t.publishedCoverage}`}</Text>

          <MetricSelector
            label={t.selectIndicator}
            value={cropMetric}
            onChange={(id) => setCropMetric(id as CropMetric)}
            options={[
              { id: "production_mt", label: t.metricProduction },
              { id: "harvested_area_ha", label: t.metricArea },
              { id: "indexed_yield", label: t.indexedYield, hint: "100" },
            ]}
          />

          {selectedCrops.length < 2 ? (
            <EmptyState
              title="Pick at least two crops"
              message="Raw yield is not compared across crops because they do not share a natural scale. Choose indexed yield to compare the shape of each crop's change instead."
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
                  series={indexedSeriesList}
                  unit="index"
                  height={240}
                  note={`100 = ${indexed.data?.baseline_definition ?? "the crop's own published baseline"}. Each crop is indexed separately.`}
                  accessibilityLabel={`Indexed yield comparison of ${selectedCrops.join(", ")}`}
                />
              ) : (
                <EmptyState
                  title={t.noDataAvailable}
                  message="No selected crop meets the eligibility rules for an index."
                />
              )}
              <DataWarning text={t.indexedYieldNote} />
              {ineligible.length ? (
                <DataWarning
                  text={`Not indexed: ${ineligible
                    .map((item) => `${item.crop} (${item.reason ?? "ineligible"})`)
                    .join("; ")}.`}
                />
              ) : null}
              <SourceMethodSheet
                title={t.sourceAndMethod}
                source={indexed.data?.provenance?.source_id}
                period={indexed.data?.provenance?.source_period ?? null}
                coverage={`national · ${indexedSeriesList.length} eligible crops`}
                unit={indexed.data?.unit ?? "index"}
                method={indexed.data?.provenance?.method}
                limitations={indexed.data?.provenance?.limitations}
              />
            </>
          ) : (
            <>
              <MultiSeriesChart
                series={seriesList}
                unit={compareTrends.data?.metric_units?.[`${cropMetric}:${selectedCrops[0]}`] ?? ABSOLUTE_METRIC_UNIT[cropMetric]}
                height={240}
                accessibilityLabel={`Comparison of ${selectedCrops.join(", ")} over published periods`}
              />
              <DataWarning text="Absolute metrics only. Raw yield is deliberately not compared across crops: different species do not share a natural yield scale." />
              <SourceMethodSheet
                title={t.sourceAndMethod}
                source={compareTrends.data?.provenance?.source_id}
                period={trendPoints.map((point) => point.period).join(", ")}
                coverage="national crop series"
                unit={compareTrends.data?.metric_units?.[`${cropMetric}:${selectedCrops[0]}`]}
                method={compareTrends.data?.provenance?.method}
                limitations={compareTrends.data?.provenance?.limitations}
              />
            </>
          )}
        </DataSection>
      ) : (
        <DataSection title={t.compareDistricts} subtitle={t.compareSelectCropAndPeriod} first>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {(crops.data ?? []).map((crop) => (
              <FilterChip
                key={crop.crop_code}
                label={crop.crop_name}
                selected={compareCrop === crop.crop_name}
                onPress={() => setCompareCrop(crop.crop_name)}
              />
            ))}
          </View>

          {!compareCrop ? (
            <EmptyState title={t.pickCropFirst} message={t.compareSelectCropAndPeriod} icon="leaf-outline" />
          ) : (
            <>
              <PeriodSelector
                label={t.selectPeriod}
                value={activePeriod}
                onChange={setPeriodCode}
                options={districtPeriods.map((period) => ({
                  id: period.period_code,
                  label: period.label,
                  hint: `${period.n_districts} districts`,
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

              <View style={styles.chips}>
                {filteredDistricts.map((district) => (
                  <FilterChip
                    key={district.district_code}
                    label={district.district}
                    selected={selectedDistricts.includes(district.district_code)}
                    onPress={() => toggle(selectedDistricts, setSelectedDistricts, district.district_code, 4)}
                  />
                ))}
              </View>
              <Text style={typography.micro}>{`${selectedDistricts.length}/4 districts selected`}</Text>

              {selectedDistricts.length < 2 ? (
                <EmptyState
                  title="Pick at least two districts"
                  message="Every district is measured on the same crop, the same metric and one published period."
                  icon="git-compare-outline"
                />
              ) : districtMetric === "gap" ? (
                gapLayer.isLoading ? (
                  <LoadingSkeleton height={200} />
                ) : comparisonRows.length ? (
                  <>
                    <HorizontalBarChart values={comparisonRows} unit="%" />
                    <DataWarning text="A gap is relative to the selected crop's own published benchmark, so it is comparable between these districts and not between crops." />
                  </>
                ) : (
                  <EmptyState title={gapLayer.data?.message ?? t.noDataAvailable} />
                )
              ) : panel.isLoading ? (
                <LoadingSkeleton height={200} />
              ) : comparisonRows.length ? (
                <>
                  <HorizontalBarChart values={comparisonRows} unit={METRIC_UNIT[districtMetric]} />
                  <CoverageBadge
                    level="district"
                    period={panel.data?.label ?? activePeriod}
                    source={panel.data?.provenance?.source_id ?? null}
                  />
                  <Text style={typography.micro}>
                    {`Coverage metadata: ${panel.data?.n_crops ?? 0} crops carry published district rows for this period.`}
                  </Text>
                  <SourceMethodSheet
                    title={t.sourceAndMethod}
                    source={panel.data?.provenance?.source_id}
                    period={panel.data?.label ?? activePeriod}
                    coverage={`district · ${panel.data?.n_observations ?? 0} observations`}
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
                  text={`Not published for this crop and period: ${missingRows.map((row) => row.label).join(", ")}. Nothing is inferred for them.`}
                />
              ) : null}
            </>
          )}
        </DataSection>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
