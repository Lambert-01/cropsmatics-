/**
 * The district panel of the crop terminal: one published period's cross-section
 * plus, when a district is picked, that district's own published series.
 *
 * Presentational. The screen owns the queries (the period cross-section, the gap
 * layer, one district's series) and the metric / period / district state; this
 * component only decides layout and which disclosure belongs to which branch.
 *
 * The `gap` metric is a different published layer from the productivity panel,
 * so it is modelled as its own branch rather than a third column: it has its own
 * period coverage, its own provenance and its own coverage note, and mixing the
 * two would put a value and a source from different releases beside each other.
 * The district series carries the same expand-to-full-screen control the
 * national series has.
 */

import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  districtMetrics,
  metricLabel,
  resolveMetricOptions,
  type DistrictMetricId,
} from "../../constants/analytical";
import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { PANEL_UNITS } from "../../constants/metrics";
import { radius, spacing } from "../../theme";
import type { Palette, Typography } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";
import type { ChangeResult, SeriesPoint } from "../../utils/analytics";
import { HorizontalBarChart } from "../charts";
import { ChangeIndicator, DataSection, DataWarning, SourceMethodSheet } from "../data-view";
import { EmptyState, LoadingSkeleton } from "../ui";
import { ExpandableTimeSeriesChart } from "./ExpandableTimeSeriesChart";
import { MetricTabs } from "./MetricTabs";
import { SeasonSelector } from "./SeasonSelector";

/** Units the productivity panel publishes its columns in. */
const CROSS_SECTION_UNITS = {
  production_mt: PANEL_UNITS.production_mt,
  harvested_area_ha: PANEL_UNITS.harvested_area_ha,
  yield_kg_ha: PANEL_UNITS.yield_kg_ha,
} as const;

export interface CropDistrictPanelProps {
  metric: DistrictMetricId;
  onMetricChange: (id: DistrictMetricId) => void;
  periods: { period_code: string; label: string; n_districts: number }[];
  activePeriod: string | null;
  onPeriodChange: (code: string | null) => void;

  /** The benchmark gap layer — the only metric whose periods differ. */
  gap: {
    loading: boolean;
    values: { label: string; value: number }[];
    emptyTitle: string | null;
    emptyMessage: string | null;
    /** Null when the layer is not loaded; the section then omits the sheet. */
    loaded: boolean;
    source: string | null;
    period: string | null;
    method: string | null;
    limitations: string[] | null;
  };

  /** The productivity cross-section for the active period. */
  crossSection: {
    loading: boolean;
    values: { label: string; value: number }[];
    /** Districts covered by the response, for the coverage note; null when unpublished. */
    districtCount: number | null;
    source: string | null;
    period: string | null;
    method: string | null;
    limitations: string[] | null;
  };

  /** One district's own published series. */
  district: {
    options: { id: string; label: string }[];
    selected: string | null;
    onSelect: (id: string | null) => void;
    loading: boolean;
    error: boolean;
    published: number;
    points: SeriesPoint[];
    unit: string | null;
    change: ChangeResult | null;
    selectedName: string | null;
  };
}

export function CropDistrictPanel({
  metric,
  onMetricChange,
  periods,
  activePeriod,
  onPeriodChange,
  gap,
  crossSection,
  district,
}: CropDistrictPanelProps) {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const label = metricLabel(t, metric);
  const isGap = metric === "gap";

  const metricOptions = useMemo(
    () =>
      resolveMetricOptions(districtMetrics, t, {
        ...CROSS_SECTION_UNITS,
        gap: "%",
      }),
    [t],
  );

  return (
    <DataSection title={t.districts} subtitle={t.districtSeries}>
      <SeasonSelector
        label={t.selectPeriod}
        options={periods.map((period) => ({
          id: period.period_code,
          label: period.label,
          hint: `${period.n_districts} ${t.districts}`,
        }))}
        value={activePeriod}
        onChange={onPeriodChange}
      />

      {periods.length === 0 ? <DataWarning text={t.errorNoDistrictPeriod} /> : null}

      <MetricTabs
        accessibilityLabel={t.selectIndicator}
        options={metricOptions}
        value={metric}
        onChange={(id) => onMetricChange(id as DistrictMetricId)}
      />

      {isGap ? (
        <>
          <DataWarning text={t.gapBenchmarkNote} />
          {gap.loading ? (
            <LoadingSkeleton height={180} />
          ) : gap.values.length ? (
            <HorizontalBarChart values={gap.values} unit="%" maxItems={30} />
          ) : (
            <EmptyState title={gap.emptyTitle ?? t.errorNoDistrictData} message={gap.emptyMessage ?? undefined} />
          )}
        </>
      ) : (
        <>
          <DistrictPicker
            label={t.pickDistrict}
            options={district.options}
            value={district.selected}
            onChange={district.onSelect}
          />

          {district.selected ? (
            district.loading ? (
              <LoadingSkeleton height={208} />
            ) : district.error || district.published === 0 ? (
              <EmptyState
                title={t.noDataAvailable}
                message={t.noPublishedSelection
                  .replace("{metric}", label)
                  .replace("{selection}", district.selectedName ?? "")}
              />
            ) : district.published === 1 ? (
              /* One published point. Shown as a value, never as a trend and
                 never with a rank movement. */
              <View style={{ gap: 4 }}>
                <Text style={typography.microCaps}>{`${district.selectedName ?? ""} · ${district.unit ?? ""}`}</Text>
                <Text style={styles.figureValue}>
                  {(district.points.find((point) => point.value !== null)?.value ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </Text>
                <DataWarning tone="slate" text={t.singlePointNote} />
              </View>
            ) : (
              <ExpandableTimeSeriesChart
                series={[
                  {
                    key: `${district.selected}-${metric}`,
                    label: district.selectedName ?? "District",
                    points: district.points,
                  },
                ]}
                unit={district.unit}
                title={label}
                subtitle={district.selectedName}
                accessibilityLabel={t.trendChartA11y
                  .replace("{metric}", label)
                  .replace("{selection}", district.selectedName ?? t.districtSeries)}
                footer={
                  <ChangeIndicator change={district.change} unavailableNote={t.noComparableChange} />
                }
              />
            )
          ) : crossSection.loading ? (
            <LoadingSkeleton height={180} />
          ) : crossSection.values.length ? (
            <HorizontalBarChart
              values={crossSection.values}
              unit={PANEL_UNITS[metric as "yield_kg_ha" | "production_mt" | "harvested_area_ha"]}
              maxItems={30}
            />
          ) : (
            <EmptyState title={t.errorNoDistrictData} message={t.noDataAvailable} />
          )}
        </>
      )}

      {isGap ? (
        gap.loaded ? (
          <SourceMethodSheet
            title={t.sourceAndMethod}
            source={gap.source}
            period={gap.period ?? activePeriod}
            coverage={t.coverageDistrictBenchmark}
            unit="%"
            method={gap.method}
            limitations={gap.limitations}
          />
        ) : null
      ) : (
        <SourceMethodSheet
          title={t.sourceAndMethod}
          source={crossSection.source}
          period={crossSection.period ?? activePeriod}
          coverage={t.mapCoverageDistricts.replace(
            "{count}",
            String(crossSection.districtCount ?? crossSection.values.length),
          )}
          unit={PANEL_UNITS[metric as "yield_kg_ha" | "production_mt" | "harvested_area_ha"]}
          method={crossSection.method}
          limitations={crossSection.limitations}
        />
      )}
    </DataSection>
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

const makeStyles = (colors: Palette, typography: Typography) =>
  StyleSheet.create({
    figureValue: {
      ...typography.numericLarge,
      fontSize: 28,
      fontVariant: ["tabular-nums"] as ["tabular-nums"],
    },
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
  });
