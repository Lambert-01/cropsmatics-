import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useThemedStyles, useTheme } from "../../theme/theme-context";
import type { ForecastStatusResponse } from "../../types";
import { Card, ErrorState, LoadingSkeleton, OfflineBanner, SectionHeader, SecondaryButton } from "../ui";

export function PredictionsSection({
  status, isLoading, error = false, isOffline = false, onRetry,
}: {
  status: ForecastStatusResponse | undefined;
  isLoading: boolean;
  error?: boolean;
  isOffline?: boolean;
  onRetry?: () => void;
}) {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const [details, setDetails] = useState(false);
  const title = <SectionHeader title={t.predictionsTitle} subtitle={t.predictionsSubtitle} />;
  if (isLoading && !isOffline) return <View style={styles.section}>{title}<LoadingSkeleton height={110} /></View>;
  if (!status) return (
    <View style={styles.section}>
      {title}
      <ErrorState message={isOffline ? t.offline : t.errorGeneric} onRetry={onRetry} />
    </View>
  );
  const headline = !status.report_available ? t.predictionsMissing
    : status.serves_forecast ? t.predictionsPublished : t.predictionsWithheld;
  return (
    <View style={styles.section}>
      {title}
      {isOffline ? <OfflineBanner text={t.offlineCached} /> : null}
      {error ? <ErrorState message={t.errorGeneric} onRetry={onRetry} /> : null}
      <View style={styles.headline}>
        <Text style={typography.h2}>{headline}</Text>
        <Text style={typography.caption}>{status.note ?? t.predictionsGateNote}</Text>
        {status.generated ? <Text style={typography.micro}>{status.generated}</Text> : null}
      </View>
      {status.targets.map((target) => {
        const published = status.serves_forecast && target.status === "ok";
        const interval = target.interval;
        const validInterval = Array.isArray(interval) && interval.length === 2
          && interval.every((value) => typeof value === "number" && Number.isFinite(value));
        const level = typeof target.interval_level === "number"
          ? `${(target.interval_level * 100).toFixed(0)}%` : "";
        return (
          <Card key={target.target_id ?? target.label} style={styles.target}>
            <Text style={typography.h3}>{target.label ?? target.target_id}</Text>
            <Text style={typography.caption}>{published ? t.predictionsPublished : t.predictionsWithheld}</Text>
            {published && typeof target.point_estimate === "number" ? (
              <View style={styles.section}>
                <Text style={typography.caption}>{t.predictionsForecastFor.replace("{period}", target.next_period ?? "")}</Text>
                <Text style={styles.value}>{target.point_estimate.toFixed(1)} {target.unit ?? ""}</Text>
                {validInterval ? <Text style={typography.caption}>
                  {t.predictionsInterval.replace("{level}", level)
                    .replace("{low}", interval![0].toFixed(1)).replace("{high}", interval![1].toFixed(1))}
                  {" "}{target.unit ?? ""}
                </Text> : null}
              </View>
            ) : null}
            {details ? (
              <View style={styles.section}>
                <Text style={typography.caption}>{t.predictionsSeriesCleared
                  .replace("{eligible}", String(target.n_series_eligible ?? 0))
                  .replace("{total}", String(target.n_series ?? 0))}</Text>
                {target.reasons.map((reason) => <Text key={reason} style={typography.caption}>{reason}</Text>)}
                {!target.reasons.length && target.decision_note ? <Text style={typography.caption}>{target.decision_note}</Text> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
      <SecondaryButton label={t.viewDetails} icon={details ? "chevron-up" : "chevron-down"} onPress={() => setDetails(!details)} />
      {details ? (
        <View style={styles.section}>
          <Text style={typography.caption}>{status.scope_note ?? t.predictionsNotScenario}</Text>
          <Text style={typography.caption}>{status.method_note}</Text>
          <Text style={typography.micro}>{status.provenance.source_id ?? "ML_FORECAST_BACKTEST"}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  section: { gap: spacing.sm },
  headline: { borderLeftWidth: 3, borderLeftColor: colors.amber, padding: spacing.md, gap: spacing.xs },
  target: { gap: spacing.sm },
  value: { color: colors.forestDeep, fontSize: 24, fontWeight: "700" },
});
