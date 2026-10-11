import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { BottomNav } from "../../src/components/BottomNav";
import { RwandaMap } from "../../src/components/RwandaMap";
import { DataWarning, PeriodSelector, SourceMethodSheet } from "../../src/components/data-view";
import { DistrictDetailSheet } from "../../src/components/terminal/DistrictDetailSheet";
import { SingleSelectSheet } from "../../src/components/terminal/SingleSelectSheet";
import { ErrorState } from "../../src/components/ui";
import { useAllCrops, useAllDistricts, usePeriods } from "../../src/hooks/queries";
import { strings } from "../../src/i18n";
import { mapsApi } from "../../src/services/api";
import type { MapMetric } from "../../src/services/api/maps";
import { useAppStore } from "../../src/store/useAppStore";
import { radius, shadow, spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";
import { formatValue } from "../../src/utils/analytics";
import { layerRequiresCrop, linkPeriodToLayer, periodsCarryingLayer } from "../../src/utils/coverage";
import {
  ZOOM_STEP,
  canZoomIn,
  canZoomOut,
  clampTransform,
  isDefaultTransform,
  panBy,
  resetTransform,
  zoomBy,
  type MapTransform,
} from "../../src/utils/mapTransform";
import { resolveDistrictRouteParam } from "../../src/utils/selection";
import {
  bandPaletteIndex,
  bandsFor,
  formatBand,
  scaleForLayer,
} from "../../src/utils/scale";

const LATEST = "__latest__";

/** Classification bands the scale model actually used, in ascending order. */
const CLASS_COUNT = 5;

const LAYERS: { id: MapMetric; labelKey: "metricGap" | "metricPriority" | "metricYield" | "metricInputAdoption" | "metricIrrigation" | "metricErosion" }[] = [
  { id: "gap", labelKey: "metricGap" },
  { id: "priority", labelKey: "metricPriority" },
  { id: "yield", labelKey: "metricYield" },
  { id: "input_adoption", labelKey: "metricInputAdoption" },
  { id: "irrigation", labelKey: "metricIrrigation" },
  { id: "erosion", labelKey: "metricErosion" },
];

export default function MapsScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ crop?: string; district?: string; period?: string }>();

  const [metric, setMetric] = useState<MapMetric>("gap");
  const [crop, setCrop] = useState<string | null>(params.crop ?? null);
  const [requestedPeriod, setRequestedPeriod] = useState<string | null>(params.period ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  /**
   * Zoom/pan. Clamping lives in `mapTransform` (unit tested), so the gesture code
   * here only forwards deltas - it cannot leave the map panned off screen.
   */
  const [transform, setTransform] = useState<MapTransform>(() => resetTransform());
  const panStart = useRef<MapTransform | null>(null);
  // Refs mirror the latest transform/size so the PanResponder can be created
  // once and still read current values inside its handlers (a memoized
  // responder that closes over stale state would pan from the wrong origin).
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const mapSizeRef = useRef(mapSize);
  mapSizeRef.current = mapSize;
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  // A deep link can name a district that is not in the catalogue at all; that
  // is different from a real district whose value simply is not published.
  const [unknownDistrict, setUnknownDistrict] = useState<string | null>(null);

  const periods = usePeriods();
  const crops = useAllCrops();
  const districtCatalogue = useAllDistricts();

  // Apply a `?district=` deep-link once the catalogue is known, so the detail
  // sheet opens exactly as if the shape had been tapped. A district whose value
  // is not published for this layer still opens the sheet — it says "Not
  // published" honestly rather than pretending the selection failed.
  const paramDistrict = params.district ?? null;
  const [districtParamApplied, setDistrictParamApplied] = useState(false);
  useEffect(() => {
    if (districtParamApplied || !paramDistrict) return;
    if (districtCatalogue.isLoading) return;
    const decision = resolveDistrictRouteParam(paramDistrict, districtCatalogue.data ?? []);
    if (decision.action === "select" && decision.code) setSelected(decision.code);
    else if (decision.action === "unknown") setUnknownDistrict(decision.code);
    setDistrictParamApplied(true);
  }, [districtParamApplied, paramDistrict, districtCatalogue.data, districtCatalogue.isLoading]);

  /**
   * Drag to pan, but only while zoomed in. At scale 1 the responder declines,
   * so a tap still reaches the district shape underneath; past that it claims
   * the gesture and forwards the delta, letting `panBy` decide the limit.
   */
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          transformRef.current.scale > 1 &&
          (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
        onPanResponderGrant: () => {
          panStart.current = transformRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const start = panStart.current ?? transformRef.current;
          const { width, height } = mapSizeRef.current;
          setTransform(panBy(start, gesture.dx, gesture.dy, width, height));
        },
        onPanResponderRelease: () => {
          panStart.current = null;
        },
        onPanResponderTerminate: () => {
          panStart.current = null;
        },
      }),
    [],
  );

  const allowedPeriods = useMemo(
    () => periodsCarryingLayer(periods.data?.periods ?? [], metric),
    [periods.data, metric],
  );

  // A map may only follow a period that genuinely carries the layer. When it
  // cannot, it stays on a published period and says why.
  const link = useMemo(
    () => linkPeriodToLayer(periods.data?.periods ?? [], metric, requestedPeriod),
    [periods.data, metric, requestedPeriod],
  );

  const singleRelease = allowedPeriods.length === 1 ? allowedPeriods[0].period_code : null;
  const effectivePeriod = singleRelease ?? link.periodCode;

  // Localized sentence for a chart period the layer cannot follow.
  const linkReasonText =
    link.reasonCode === "not-district"
      ? t.mapPeriodNotDistrict
          .replace("{period}", link.reasonPeriods.requested ?? "")
          .replace("{fallback}", link.reasonPeriods.fallback ?? "")
      : link.reasonCode === "no-period"
        ? t.mapPeriodNoneForLayer
        : null;

  const needsCrop = layerRequiresCrop(metric);
  const cropBlocked = needsCrop && !crop;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["map-metrics", metric, crop, effectivePeriod],
    queryFn: () =>
      mapsApi.districtMetrics({
        metric,
        crop: crop ?? undefined,
        periodCode: effectivePeriod ?? undefined,
      }),
    enabled: !cropBlocked,
  });

  // Classification and legend come from the same scale model, so a swatch in
  // the legend can never describe a different rule than the colour on the map.
  // Burden metrics (gap, priority) use a warm ramp that darkens towards worse,
  // never green; districts without a verified value stay grey.
  const { values, scale, bands } = useMemo(() => {
    const layerScale = scaleForLayer(metric);
    const published = (data?.districts ?? [])
      .map((row) => row.value)
      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    const { cuts, bands: modelBands } = bandsFor(published, CLASS_COUNT);

    const out: Record<string, { value: number | null; color: string }> = {};
    for (const row of data?.districts ?? []) {
      if (!row.district_code) continue;
      if (row.value === null || row.value === undefined || !Number.isFinite(row.value)) {
        out[row.district_code] = { value: null, color: colors.missing };
        continue;
      }
      const palette = bandPaletteIndex(row.value, cuts, layerScale.colors.length);
      out[row.district_code] = { value: row.value, color: layerScale.colors[palette] };
    }
    return { values: out, scale: layerScale, bands: modelBands };
  }, [data, metric, colors.missing]);

  const hasDistrictData = (data?.districts ?? []).some((row) => row.value !== null);
  const selectedRow = data?.districts.find((row) => row.district_code === selected) ?? null;
  // A district that is absent from this response (or carries no value) still
  // gets a sheet: name from the catalogue, value honestly null.
  const selectedMeta =
    selectedRow ??
    (selected
      ? (() => {
          const fromCatalogue = (districtCatalogue.data ?? []).find(
            (item) => item.district_code === selected,
          );
          return fromCatalogue
            ? {
                district_code: fromCatalogue.district_code,
                district: fromCatalogue.district,
                province: fromCatalogue.province,
                value: null as number | null,
              }
            : null;
        })()
      : null);
  const districtPickerOptions = (districtCatalogue.data ?? [])
    .map((item) => ({ id: item.district_code, label: item.district }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const selectedDistrictLabel =
    districtPickerOptions.find((option) => option.id === selected)?.label ?? null;
  const unit = data?.unit ?? "";

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader />

      {/* Compact controls: no scrolling page above the map. */}
      <View style={styles.controls}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRow}>
          {LAYERS.map((layer) => (
            <Pressable
              key={layer.id}
              accessibilityRole="button"
              accessibilityState={{ selected: metric === layer.id }}
              accessibilityLabel={t[layer.labelKey]}
              onPress={() => {
                setMetric(layer.id);
                setSelected(null);
              }}
              hitSlop={6}
              style={[styles.chip, metric === layer.id ? styles.chipSelected : null]}
            >
              <Text style={[styles.chipText, metric === layer.id ? styles.chipTextSelected : null]}>
                {t[layer.labelKey]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {needsCrop ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRow}>
            {(crops.data ?? []).map((item) => (
              <Pressable
                key={item.crop_code}
                accessibilityRole="button"
                accessibilityState={{ selected: crop === item.crop_name }}
                accessibilityLabel={item.crop_name}
                onPress={() => setCrop(item.crop_name)}
                hitSlop={6}
                style={[styles.chip, crop === item.crop_name ? styles.chipSelected : null]}
              >
                <Text style={[styles.chipText, crop === item.crop_name ? styles.chipTextSelected : null]}>
                  {item.crop_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {allowedPeriods.length > 1 ? (
          <PeriodSelector
            value={requestedPeriod ?? LATEST}
            onChange={(code) => setRequestedPeriod(code === LATEST ? null : code)}
            options={[
              { id: LATEST, label: t.latestPublished },
              ...allowedPeriods.map((period) => ({
                id: period.period_code,
                label: period.label,
                hint: `${period.n_districts} ${t.districts}`,
              })),
            ]}
          />
        ) : null}

        {/*
          An accessible alternative to tapping the SVG shapes: one searchable
          picker instead of a 30-chip strip, applying the same selection so a
          screen reader or keyboard user can open a district's details without
          a gesture on the map.
        */}
        {!cropBlocked && (data?.districts?.length ?? 0) > 0 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.chooseDistrict}
              onPress={() => setDistrictPickerOpen(true)}
              style={styles.districtPicker}
            >
              <Ionicons name="location-outline" size={16} color={colors.primaryStrong} />
              <Text numberOfLines={1} style={styles.districtPickerText}>
                {selectedDistrictLabel ?? t.chooseDistrict}
              </Text>
              <Ionicons name="search" size={15} color={colors.slate500} />
            </Pressable>
            <SingleSelectSheet
              visible={districtPickerOpen}
              title={t.chooseDistrict}
              subtitle={data?.metric_label ?? null}
              searchPlaceholder={t.searchDistricts}
              options={districtPickerOptions}
              selected={selected}
              onApply={(next) => {
                setSelected(next);
                setDistrictPickerOpen(false);
              }}
              onCancel={() => setDistrictPickerOpen(false)}
            />
          </>
        ) : null}

        {unknownDistrict ? (
          <DataWarning text={t.mapDistrictUnknown.replace("{district}", unknownDistrict)} />
        ) : null}
      </View>

      {/* The map is the viewport, not a card inside one. */}
      <View
        style={{ flex: 1 }}
        {...panResponder.panHandlers}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          const changed =
            Math.round(mapSizeRef.current.width) !== Math.round(width) ||
            Math.round(mapSizeRef.current.height) !== Math.round(height);
          if (changed) {
            setMapSize({ width, height });
            // A rotate/resize can shrink the frame under an existing zoom, so
            // the pan limit is recomputed rather than left stale.
            setTransform((current) => clampTransform(current, width, height));
          }
        }}
      >
        {isError ? (
          <View style={styles.center}>
            <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
          </View>
        ) : cropBlocked ? (
          <View style={styles.center}>
            <Text style={{ ...typography.h3, textAlign: "center" }}>{t.pickCropFirst}</Text>
            <Text style={{ ...typography.caption, textAlign: "center" }}>
              {data?.message ?? t.mapYieldNeedsCropNote}
            </Text>
          </View>
        ) : isLoading ? (
          <View style={styles.center}>
            <Text style={typography.caption}>{t.loading}</Text>
          </View>
        ) : !hasDistrictData ? (
          <View style={styles.center}>
            <Text style={{ ...typography.h3, textAlign: "center" }}>{t.nationalDataOnly}</Text>
            <Text style={{ ...typography.caption, textAlign: "center" }}>
              {data?.message ?? t.mapDistrictValuesNote}
            </Text>
            {data?.available_period ? (
              <Text style={typography.micro}>
                {t.latestDistrictRelease.replace("{period}", data.available_period)}
              </Text>
            ) : null}
          </View>
        ) : mapSize.width > 0 ? (
          <>
            <RwandaMap
              width={mapSize.width}
              height={mapSize.height}
              values={values}
              selected={selected}
              onSelect={(code) => setSelected(code)}
              transform={transform}
            />

            <View style={styles.zoomControls} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.mapZoomIn}
                accessibilityState={{ disabled: !canZoomIn(transform) }}
                disabled={!canZoomIn(transform)}
                onPress={() =>
                  setTransform((current) =>
                    zoomBy(current, ZOOM_STEP, mapSize.width, mapSize.height),
                  )
                }
                style={[styles.zoomButton, !canZoomIn(transform) ? styles.zoomButtonDisabled : null]}
              >
                <Ionicons name="add" size={20} color={colors.forestDeep} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.mapZoomOut}
                accessibilityState={{ disabled: !canZoomOut(transform) }}
                disabled={!canZoomOut(transform)}
                onPress={() =>
                  setTransform((current) =>
                    zoomBy(current, 1 / ZOOM_STEP, mapSize.width, mapSize.height),
                  )
                }
                style={[styles.zoomButton, !canZoomOut(transform) ? styles.zoomButtonDisabled : null]}
              >
                <Ionicons name="remove" size={20} color={colors.forestDeep} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.mapResetView}
                accessibilityState={{ disabled: isDefaultTransform(transform) }}
                disabled={isDefaultTransform(transform)}
                onPress={() => setTransform(resetTransform())}
                style={[styles.zoomButton, isDefaultTransform(transform) ? styles.zoomButtonDisabled : null]}
              >
                <Ionicons name="locate-outline" size={18} color={colors.forestDeep} />
              </Pressable>
            </View>

            {selectedMeta ? (
              <DistrictDetailSheet
                district={selectedMeta.district}
                province={selectedMeta.province}
                metricLabel={data?.metric_label}
                period={data?.period_code ?? data?.period}
                value={selectedMeta.value}
                unit={unit}
                onClose={() => setSelected(null)}
                actions={[
                  {
                    id: "details",
                    icon: "information-circle-outline",
                    label: t.viewDistrictDetails,
                    onPress: () =>
                      router.push((`/explore/district/${selectedMeta.district_code}`) as never),
                  },
                  {
                    id: "compare",
                    icon: "git-compare-outline",
                    label: t.compare,
                    onPress: () =>
                      router.push({
                        pathname: "/explore/compare",
                        params: {
                          crop: crop ?? undefined,
                          mode: "districts",
                          district: selectedMeta.district_code,
                          // The comparison only adopts this when it actually
                          // publishes the period, so an incompatible layer
                          // calendar cannot leave its selector empty.
                          period: effectivePeriod ?? undefined,
                        },
                      }),
                  },
                  {
                    id: "ask",
                    icon: "chatbubble-ellipses-outline",
                    label: t.ask,
                    onPress: () =>
                      router.push({
                        pathname: "/ask",
                        params: {
                          q: `What does the published data show for ${selectedMeta.district} district${crop ? ` and ${crop}` : ""}?`,
                        },
                      }),
                  },
                ]}
              />
            ) : (
              <View style={styles.legend}>
                <View style={styles.legendBands}>
                  {/* One swatch per populated class, bounds taken from the same
                      cuts that coloured the shapes. */}
                  {bands.map((band) => (
                    <View key={band.index} style={styles.legendItem}>
                      <View style={[styles.swatch, { backgroundColor: scale.colors[band.index] }]} />
                      <Text style={styles.legendText}>
                        {formatBand(band, (value) => formatValue(value))}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.legendItem}>
                    <View style={[styles.swatch, { backgroundColor: colors.missing }]} />
                    <Text style={styles.legendText}>{t.mapNoData}</Text>
                  </View>
                </View>
                {/* Direction is stated in words: colour alone never carries the
                    meaning of a scale. */}
                <Text style={styles.legendDirection}>
                  {scale.direction === "higherIsWorse" ? t.legendHigherIsWorse : t.legendHigherIsBetter}
                </Text>
                <Text style={styles.legendUnit}>
                  {[data?.metric_label, unit, data?.period_code ?? data?.period].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}
          </>
        ) : null}
      </View>

      {linkReasonText ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <DataWarning text={linkReasonText} />
        </View>
      ) : null}

      {data ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <SourceMethodSheet
            title={t.sourceAndMethod}
            source={data.source_id ?? data.provenance?.source_id}
            period={data.period_code ?? data.period}
            coverage={t.mapCoverageDistricts.replace(
              "{count}",
              String((data.districts ?? []).filter((row) => row.value !== null).length),
            )}
            unit={unit}
            method={data.provenance?.method}
            limitations={data.provenance?.limitations}
          />
        </View>
      ) : null}

      <BottomNav active="map" />
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  controls: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  controlRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  chip: {
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.slate700 },
  chipTextSelected: { color: colors.white },
  districtPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mintSoft,
  },
  districtPickerText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.forestDeep },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  legend: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 3,
  },
  legendBands: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 13, height: 13, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  legendText: { fontSize: 10, color: colors.slate700, fontVariant: ["tabular-nums"] },
  zoomControls: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    gap: 6,
  },
  zoomButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  zoomButtonDisabled: { opacity: 0.4 },
  legendDirection: { fontSize: 10, fontWeight: "600", color: colors.slate700 },
  legendUnit: { fontSize: 10, color: colors.slate500 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sheet,
  },
  close: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.background,
  },
  closeText: { fontSize: 14, color: colors.slate700 },
});
