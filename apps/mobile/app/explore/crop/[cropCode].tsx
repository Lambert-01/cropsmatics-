import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Share, View } from "react-native";

import { FactorAssociation } from "../../../src/components/analytics/FactorAssociation";
import { StackedShareBar } from "../../../src/components/charts";
import {
  CoverageBadge,
  DataSection,
  DataWarning,
  SourceMethodSheet,
} from "../../../src/components/data-view";
import { ScreenLayout } from "../../../src/components/ScreenLayout";
import { AnalyticalToolbar } from "../../../src/components/terminal/AnalyticalToolbar";
import { CropDistrictPanel } from "../../../src/components/terminal/CropDistrictPanel";
import { CropTrendPanel, type PeriodView } from "../../../src/components/terminal/CropTrendPanel";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../../src/components/ui";
import { nationalMetrics, type DistrictMetricId, type NationalMetricId } from "../../../src/constants/analytical";
import { PANEL_UNITS } from "../../../src/constants/metrics";
import { getSavedItem, removeSavedItem, saveItem } from "../../../src/database";
import { useNationalBoard, usePeriods } from "../../../src/hooks/queries";
import { strings } from "../../../src/i18n";
import { analyticsApi, cropsApi, mapsApi, postHarvestApi } from "../../../src/services/api";
import { useAppStore } from "../../../src/store/useAppStore";
import { spacing } from "../../../src/theme";
import { useTheme } from "../../../src/theme/theme-context";
import {
  boardPoints,
  changeFromApi,
  filterSeason,
  fromPeriodCoded,
  latestSeason,
  publishedCount,
  toSeriesPoints,
  type PeriodRange,
} from "../../../src/utils/analytics";
import { periodsCarryingLayer } from "../../../src/utils/coverage";
import { buildCropShareText } from "../../../src/utils/shareCrop";

export default function CropTerminalScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ cropCode: string }>();
  const slug = params.cropCode;

  const [nationalMetric, setNationalMetric] = useState<NationalMetricId>("yield_mt_ha");
  const [periodView, setPeriodView] = useState<PeriodView>("all");
  const [periodRange, setPeriodRange] = useState<PeriodRange>("all");
  const [districtMetric, setDistrictMetric] = useState<DistrictMetricId>("yield_kg_ha");
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
  const nationalPeriodLabel = axis.length ? `${axis[0]}–${axis[axis.length - 1]}` : null;
  // Latest published figure for the current metric — the only number the share
  // card is allowed to carry.
  const latestNational = useMemo(() => {
    for (let index = nationalPoints.length - 1; index >= 0; index -= 1) {
      const point = nationalPoints[index];
      if (point && point.value !== null && point.value !== undefined) return point;
    }
    return null;
  }, [nationalPoints]);
  const metricLabel =
    t[nationalMetrics.find((option) => option.id === nationalMetric)?.labelKey ?? "metricYield"];

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

  /** The productivity cross-section: one period's published value per district. */
  const crossSection = useMemo(() => {
    const key = districtMetric as "yield_kg_ha" | "production_mt" | "harvested_area_ha";
    return panelRows
      .map((row) => ({ label: row.district ?? "—", value: row[key] ?? null }))
      .filter((row): row is { label: string; value: number } => row.value !== null)
      .sort((a, b) => b.value - a.value);
  }, [panelRows, districtMetric]);

  /** The benchmark gap layer's cross-section — a separate published release. */
  const gapCrossSection = useMemo(
    () =>
      (gapLayer.data?.districts ?? [])
        .filter((row) => row.value !== null && row.district_code)
        .map((row) => ({ label: row.district, value: row.value as number }))
        .sort((a, b) => b.value - a.value),
    [gapLayer.data],
  );

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
      <View style={{ gap: spacing.sm }}>
        <AnalyticalToolbar
          title={name ?? slug}
          subtitle={
            [crop.data?.category, crop.data?.kinyarwanda_name].filter(Boolean).join(" · ") || null
          }
          saved={saved}
          saveLabel={t.saveItem}
          unsaveLabel={t.unsaveItem}
          onToggleSave={() => {
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
          actions={[
            {
              id: "compare",
              icon: "git-compare-outline",
              label: t.compare,
              onPress: () =>
                router.push({ pathname: "/explore/compare", params: { crop: name ?? slug } }),
            },
            {
              id: "map",
              icon: "map-outline",
              label: t.maps,
              // Carry the district period this screen is showing so the map
              // opens on the same release (or explains why it cannot).
              onPress: () =>
                router.push({
                  pathname: "/maps",
                  params: { crop: name ?? slug, period: activePeriod ?? undefined },
                }),
            },
            {
              id: "share",
              icon: "share-outline",
              label: t.shareCropAction,
              // Published identity and the latest published figure only — the
              // composer drops any line whose input is missing.
              onPress: () => {
                const text = buildCropShareText({
                  crop: name ?? slug,
                  periods: axis,
                  metricLabel,
                  value: latestNational?.value ?? null,
                  unit: nationalUnit,
                  valuePeriod: latestNational?.label ?? null,
                  source: board.data?.provenance?.source_id ?? null,
                  t: {
                    heading: t.shareCropHeading,
                    series: t.shareCropSeries,
                    metric: t.shareCropMetric,
                    source: t.shareCropSource,
                    note: t.shareCropNote,
                  },
                });
                void Share.share({ message: text, title: t.shareCropTitle }).catch(() => {
                  // Share sheet unavailable — nothing to report, nothing invented.
                });
              },
            },
            {
              id: "ask",
              icon: "chatbubble-ellipses-outline",
              label: t.ask,
              onPress: () =>
                router.push({
                  pathname: "/ask",
                  params: { q: `What does the published data show for ${name ?? slug} in Rwanda?` },
                }),
            },
          ]}
        />

        {/* Coverage is stated once, here, and not repeated under every section. */}
        <CoverageBadge
          level="national series"
          period={nationalPeriodLabel}
          source={board.data?.provenance?.source_id ?? null}
        />
      </View>

      {/* ---- National series: the main analytical surface ------------------ */}
      <CropTrendPanel
        selectionLabel={name ?? slug}
        loading={board.isLoading}
        error={board.isError}
        onRetry={() => void board.refetch()}
        empty={!entry || nationalPublished === 0}
        published={nationalPublished}
        metric={nationalMetric}
        onMetricChange={setNationalMetric}
        units={board.data?.metric_units}
        unit={nationalUnit}
        series={[{ key: nationalMetric, label: name ?? slug, points: nationalPoints }]}
        periodRange={periodRange}
        onPeriodRangeChange={setPeriodRange}
        change={nationalChange}
        periodView={periodView}
        onPeriodViewChange={setPeriodView}
        seasonLetter={seasonLetter}
        periodLabel={nationalPeriodLabel}
        source={board.data?.provenance?.source_id}
        method={board.data?.provenance?.method}
        limitations={board.data?.provenance?.limitations}
      />

      {/* ---- District cross-section and one district's own series ---------- */}
      <CropDistrictPanel
        metric={districtMetric}
        onMetricChange={(id) => {
          setDistrictMetric(id);
          setDistrictKey(null);
        }}
        periods={districtPeriods}
        activePeriod={activePeriod}
        onPeriodChange={setPeriodCode}
        gap={{
          loading: gapLayer.isLoading,
          values: gapCrossSection,
          emptyTitle: gapLayer.data?.message ?? null,
          emptyMessage: gapLayer.data?.available_period
            ? t.latestDistrictRelease.replace("{period}", gapLayer.data.available_period)
            : null,
          loaded: Boolean(gapLayer.data),
          source: gapLayer.data?.source_id ?? gapLayer.data?.provenance?.source_id ?? null,
          period: gapLayer.data?.period_code ?? null,
          method: gapLayer.data?.provenance?.method ?? null,
          limitations: gapLayer.data?.provenance?.limitations ?? null,
        }}
        crossSection={{
          loading: panel.isLoading,
          values: crossSection,
          districtCount: panel.data?.n_districts ?? null,
          source: panel.data?.provenance?.source_id ?? districtSeries.data?.provenance?.source_id ?? null,
          period: panel.data?.label ?? null,
          method: panel.data?.provenance?.method ?? null,
          limitations: panel.data?.provenance?.limitations ?? null,
        }}
        district={{
          options: districtOptions,
          selected: districtKey,
          onSelect: setDistrictKey,
          loading: districtSeries.isLoading,
          error: districtSeries.isError,
          published: districtPublished,
          points: districtPoints,
          unit: districtUnit,
          change: districtChange,
          selectedName: selectedDistrictName,
        }}
      />

      {/* ---- Factors associated with yield --------------------------------- */}
      <DataSection title={t.factorsTitle} subtitle={t.factorsSubtitle}>
        {cropFactors.isError ? (
          <ErrorState message={t.errorGeneric} onRetry={() => void cropFactors.refetch()} />
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
        {postHarvest.isError ? (
          <ErrorState message={t.errorGeneric} onRetry={() => void postHarvest.refetch()} />
        ) : postHarvest.isLoading ? (
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
              coverage={t.coverageNationalCropLevel}
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
