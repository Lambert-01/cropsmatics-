import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { Card } from "./ui";
import { LoadingSkeleton } from "./ui";
import type { FieldObservationsResponse } from "../types";
import { spacing } from "../theme";
import type { Palette } from "../theme";
import { useTheme, useThemedStyles } from "../theme/theme-context";
import { formatValue } from "../utils/analytics";

export function FieldEvidenceCard({
  data,
  isLoading,
  isError,
  onRetry,
  onOpenMap,
}: {
  data?: FieldObservationsResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  onOpenMap: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((state) => state.language));
  const districtRows = useMemo(
    () =>
      (data?.district_summaries ?? [])
        .filter((row) => row.district && row.plot_crop_records > 0)
        .sort((a, b) => b.plot_crop_records - a.plot_crop_records || (a.district ?? "").localeCompare(b.district ?? ""))
        .slice(0, 5),
    [data?.district_summaries],
  );
  const largestDistrictSample = districtRows[0]?.plot_crop_records ?? 0;

  if (isLoading && !data) {
    return (
      <Card style={styles.card}>
        <LoadingSkeleton height={86} />
      </Card>
    );
  }

  if (isError && !data) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="layers-outline" size={17} color={colors.primaryStrong} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={typography.h3}>{t.fieldEvidenceTitle}</Text>
            <Text style={typography.micro}>{t.errorGeneric}</Text>
          </View>
          {onRetry ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.tryAgain} onPress={onRetry}>
              <Ionicons name="refresh-outline" size={18} color={colors.primaryStrong} />
            </Pressable>
          ) : null}
        </View>
      </Card>
    );
  }

  const available = Boolean(data?.available && data.rows.length);
  const coverage = data?.available_periods?.join(", ") || "—";

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="layers-outline" size={17} color={colors.primaryStrong} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={typography.h3}>{t.fieldEvidenceTitle}</Text>
          <Text numberOfLines={2} style={typography.micro}>
            {t.fieldEvidenceSubtitle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.fieldEvidenceOpenMap}
          onPress={onOpenMap}
          hitSlop={8}
          style={styles.openButton}
        >
          <Ionicons name="map-outline" size={15} color={colors.primaryStrong} />
          <Text style={styles.openText}>{t.openMap}</Text>
        </Pressable>
      </View>

      {available ? (
        <>
          <View style={styles.stats}>
            <Stat label={t.fieldEvidenceRecords} value={formatValue(data?.n_plot_records ?? null)} />
            <Stat label={t.fieldEvidenceArea} value={`${formatValue(data?.area_ha_total ?? null, 1)} ha`} />
            <Stat label={t.fieldEvidenceProduction} value={`${formatValue(data?.production_kg_total ?? null, 0)} kg`} />
          </View>
          {districtRows.length > 1 ? (
            <View style={styles.districtChart}>
              <Text style={styles.chartTitle}>{t.fieldEvidenceDistrictChart}</Text>
              <Text style={typography.micro}>{t.fieldEvidenceChartHint}</Text>
              {districtRows.map((row) => (
                <View key={`${row.district_code ?? row.district}`} style={styles.barRow}>
                  <Text numberOfLines={1} style={styles.barLabel}>{row.district}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.max(8, (row.plot_crop_records / largestDistrictSample) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barValue}>{formatValue(row.plot_crop_records)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={typography.micro}>
            {t.fieldEvidenceCoverage}: {coverage} · {t.fieldEvidenceNoBoundaries}
          </Text>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={typography.caption}>{t.fieldEvidenceNoMatch}</Text>
          <Text style={typography.micro}>
            {data?.message ?? t.fieldEvidenceNoMatch} {t.fieldEvidenceCoverage}: {coverage}
          </Text>
        </View>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      <Text numberOfLines={2} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: { gap: spacing.sm },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.mintSoft,
    },
    titleBlock: { flex: 1, minWidth: 0, gap: 2 },
    openButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      minHeight: 34,
      borderRadius: 10,
      backgroundColor: colors.mintSoft,
    },
    openText: { fontSize: 11, fontWeight: "700", color: colors.primaryStrong },
    stats: { flexDirection: "row", gap: spacing.sm },
    stat: {
      flex: 1,
      minWidth: 0,
      padding: spacing.sm,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    statValue: { fontSize: 16, fontWeight: "800", color: colors.kpiValue },
    statLabel: { marginTop: 2, fontSize: 10, lineHeight: 13, color: colors.slate500 },
    empty: { gap: 3, paddingVertical: 2 },
    districtChart: {
      gap: 5,
      paddingTop: spacing.xs,
    },
    chartTitle: { fontSize: 12, fontWeight: "800", color: colors.kpiValue },
    barRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    barLabel: { width: 78, fontSize: 10, color: colors.slate500 },
    barTrack: {
      flex: 1,
      height: 8,
      overflow: "hidden",
      borderRadius: 99,
      backgroundColor: colors.mintSoft,
    },
    barFill: { height: "100%", borderRadius: 99, backgroundColor: colors.primaryStrong },
    barValue: { width: 38, textAlign: "right", fontSize: 10, fontWeight: "700", color: colors.kpiValue },
  });
