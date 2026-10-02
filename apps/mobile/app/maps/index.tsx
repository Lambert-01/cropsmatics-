import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { BottomNav } from "../../src/components/BottomNav";
import { RwandaMap } from "../../src/components/RwandaMap";
import { DataWarning, PeriodSelector, SourceMethodSheet } from "../../src/components/data-view";
import { ErrorState, SecondaryButton } from "../../src/components/ui";
import { useAllCrops, usePeriods } from "../../src/hooks/queries";
import { strings } from "../../src/i18n";
import { mapsApi } from "../../src/services/api";
import type { MapMetric } from "../../src/services/api/maps";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, radius, shadow, spacing, typography } from "../../src/theme";
import { formatValue } from "../../src/utils/analytics";
import { layerRequiresCrop, linkPeriodToLayer, periodsCarryingLayer } from "../../src/utils/coverage";
import {
  NO_DATA_COLOR,
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
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ crop?: string; district?: string; period?: string }>();

  const [metric, setMetric] = useState<MapMetric>("gap");
  const [crop, setCrop] = useState<string | null>(params.crop ?? null);
  const [requestedPeriod, setRequestedPeriod] = useState<string | null>(params.period ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  const periods = usePeriods();
  const crops = useAllCrops();

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
        out[row.district_code] = { value: null, color: NO_DATA_COLOR };
        continue;
      }
      const palette = bandPaletteIndex(row.value, cuts, layerScale.colors.length);
      out[row.district_code] = { value: row.value, color: layerScale.colors[palette] };
    }
    return { values: out, scale: layerScale, bands: modelBands };
  }, [data, metric]);

  const hasDistrictData = (data?.districts ?? []).some((row) => row.value !== null);
  const selectedRow = data?.districts.find((row) => row.district_code === selected) ?? null;
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
                hint: `${period.n_districts} districts`,
              })),
            ]}
          />
        ) : null}
      </View>

      {/* The map is the viewport, not a card inside one. */}
      <View
        style={{ flex: 1 }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setMapSize((current) =>
            Math.round(current.width) === Math.round(width) && Math.round(current.height) === Math.round(height)
              ? current
              : { width, height },
          );
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
              {data?.message ??
                "Raw yields from different crops share no natural scale, so district yield is never aggregated across crops."}
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
              {data?.message ??
                "District-level values are not published for this selection. The map is only coloured where a verified district value exists."}
            </Text>
            {data?.available_period ? (
              <Text style={typography.micro}>{`Latest district release: ${data.available_period}`}</Text>
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
            />

            {selectedRow ? (
              <View style={styles.sheet}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={typography.h3}>{selectedRow.district}</Text>
                    <Text style={typography.micro}>
                      {[selectedRow.province, data?.metric_label, data?.period_code ?? data?.period]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.close}
                    onPress={() => setSelected(null)}
                    hitSlop={10}
                    style={styles.close}
                  >
                    <Text style={styles.closeText}>✕</Text>
                  </Pressable>
                </View>

                <Text style={typography.numericLarge}>
                  {selectedRow.value === null ? "Not published" : formatValue(selectedRow.value)}
                  {selectedRow.value !== null && unit ? <Text style={typography.unit}>{` ${unit}`}</Text> : null}
                </Text>

                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton
                      label={t.viewDistrictDetails}
                      onPress={() => router.push((`/explore/district/${selectedRow.district_code}`) as never)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton
                      label={t.compare}
                      onPress={() =>
                        router.push({ pathname: "/explore/compare", params: { crop: crop ?? undefined } })
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton
                      label={t.ask}
                      onPress={() =>
                        router.push({
                          pathname: "/ask",
                          params: {
                            q: `What does the published data show for ${selectedRow.district} district${crop ? ` and ${crop}` : ""}?`,
                          },
                        })
                      }
                    />
                  </View>
                </View>
              </View>
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
                    <View style={[styles.swatch, { backgroundColor: NO_DATA_COLOR }]} />
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

      {link.reason ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <DataWarning text={link.reason} />
        </View>
      ) : null}

      {data ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <SourceMethodSheet
            title={t.sourceAndMethod}
            source={data.source_id ?? data.provenance?.source_id}
            period={data.period_code ?? data.period}
            coverage={`district · ${(data.districts ?? []).filter((row) => row.value !== null).length} districts`}
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

const styles = StyleSheet.create({
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
