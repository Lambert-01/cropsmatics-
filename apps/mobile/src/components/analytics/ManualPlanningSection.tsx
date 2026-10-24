import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  projectionApi,
  buildManualProjectionPayload,
  type ManualProjectionResponse,
  type ProjectionGeography,
  type ProjectionMethod,
  type ProjectionMetric,
} from "../../services/api/projection";
import { useAllCrops, useAllDistricts, usePeriods } from "../../hooks/queries";
import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { radius, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useThemedStyles, useTheme } from "../../theme/theme-context";
import {
  DataSection,
  DataWarning,
  MetricReadout,
  MetricSelector,
  SourceMethodSheet,
} from "../data-view";
import { SingleSelectSheet } from "../terminal/SingleSelectSheet";
import {
  ErrorState,
  EmptyState,
  InfoRow,
  PrimaryButton,
  SecondaryButton,
} from "../ui";

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function ManualPlanningSection() {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const crops = useAllCrops();
  const districts = useAllDistricts();
  const periods = usePeriods();

  const [crop, setCrop] = useState("");
  const [geography, setGeography] = useState<ProjectionGeography>("national");
  const [district, setDistrict] = useState("");
  const [season, setSeason] = useState("");
  const [metric, setMetric] = useState<ProjectionMetric>("yield_kg_ha");
  const [method, setMethod] = useState<ProjectionMethod>("carry_forward");
  const [origin, setOrigin] = useState("");
  const [horizon, setHorizon] = useState("1");
  const [change, setChange] = useState("");
  const [assumedYield, setAssumedYield] = useState("");
  const [assumedArea, setAssumedArea] = useState("");
  const [picker, setPicker] = useState<"crop" | "district" | "origin" | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const seasonOptions = useMemo(() => {
    const values = new Set(
      (periods.data?.periods ?? []).map((period) => period.season).filter(Boolean),
    );
    return Array.from(values).sort().map((value) => ({ id: value, label: value }));
  }, [periods.data]);

  useEffect(() => {
    if (!crop && crops.data?.length) setCrop(crops.data[0].crop_name);
  }, [crop, crops.data]);

  useEffect(() => {
    if (seasonOptions.length && !seasonOptions.some((option) => option.id === season)) {
      const latest = periods.data?.latest_district ?? periods.data?.latest ?? "";
      const latestSeason = latest.slice(-1);
      setSeason(
        seasonOptions.some((option) => option.id === latestSeason)
          ? latestSeason
          : seasonOptions[seasonOptions.length - 1].id,
      );
    }
  }, [periods.data, season, seasonOptions]);

  useEffect(() => {
    if (method === "personal" && metric !== "production_mt") setMetric("production_mt");
  }, [method, metric]);

  const originsEnabled = Boolean(
    crop && season && (geography === "national" || district) &&
      !(method === "personal" && metric !== "production_mt"),
  );
  const origins = useQuery({
    queryKey: ["manual-projection-origins", crop, geography, district, season, metric, method],
    queryFn: () =>
      projectionApi.origins({
        crop,
        season,
        geography,
        district: geography === "district" ? district : undefined,
        metric,
        method,
      }),
    enabled: originsEnabled,
    staleTime: 10 * 60 * 1000,
  });

  const originOptions = useMemo(() => origins.data?.origins ?? [], [origins.data]);
  useEffect(() => {
    if (!originOptions.some((option) => option.period_code === origin)) {
      setOrigin(originOptions[originOptions.length - 1]?.period_code ?? "");
    }
  }, [origin, originOptions]);

  const calculation = useMutation<ManualProjectionResponse, Error, ReturnType<typeof buildManualProjectionPayload>>({
    mutationFn: (payload) => projectionApi.calculate(payload),
  });

  const selectedCrop = crops.data?.find((item) => item.crop_name === crop);
  const selectedDistrict = districts.data?.find((item) => item.district === district);
  const parsedHorizon = Number(horizon);
  const parsedChange = numberOrNull(change);
  const parsedYield = numberOrNull(assumedYield);
  const parsedArea = numberOrNull(assumedArea);
  const validHorizon = Number.isInteger(parsedHorizon) && parsedHorizon >= 1 && parsedHorizon <= 3;
  const validMethodInputs =
    method === "carry_forward"
      ? true
      : method === "percent_change"
        ? parsedChange !== null && parsedChange >= -95 && parsedChange <= 500
        : parsedYield !== null && parsedYield > 0 && parsedArea !== null && parsedArea > 0;
  const canCalculate = Boolean(
    crop && season && origin && validHorizon && validMethodInputs &&
      (geography === "national" || district),
  );

  const validationMessage = !crop || !season || !origin || !validHorizon || !validMethodInputs
    ? t.planningRequiredInputs
    : geography === "district" && !district
      ? t.planningDistrictRequired
      : null;

  function calculate() {
    setShowValidation(true);
    if (!canCalculate) return;
    calculation.mutate(
      buildManualProjectionPayload({
        crop,
        geography,
        district,
        season,
        originPeriod: origin,
        horizonSteps: parsedHorizon,
        metric,
        method,
        changePct: parsedChange,
        assumedYield: parsedYield,
        assumedArea: parsedArea,
      }),
    );
  }

  const pickerOptions = picker === "crop"
    ? (crops.data ?? []).map((item) => ({ id: item.crop_name, label: item.crop_name }))
    : picker === "district"
      ? (districts.data ?? []).map((item) => ({ id: item.district, label: item.district, hint: item.province }))
      : originOptions.map((item) => ({
          id: item.period_code,
          label: item.period_label,
          hint: item.kind === "observed" ? t.planningOriginObserved : t.planningOriginAssumed,
        }));
  const pickerSelected = picker === "crop" ? crop : picker === "district" ? district : origin;
  const result = calculation.data;

  return (
    <DataSection title={t.planningTitle} subtitle={t.planningSubtitle}>
      <DataWarning text={t.planningNotForecast} />

      <View style={styles.selectorRow}>
        <View style={styles.selectorCell}>
          <Text style={typography.microCaps}>{t.planningCrop.toUpperCase()}</Text>
          <SecondaryButton
            label={selectedCrop?.crop_name ?? t.planningSelectCrop}
            icon="leaf-outline"
            onPress={() => setPicker("crop")}
          />
        </View>
        <View style={styles.selectorCell}>
          <Text style={typography.microCaps}>{t.planningGeography.toUpperCase()}</Text>
          <MetricSelector
            value={geography}
            onChange={(value) => setGeography(value as ProjectionGeography)}
            options={[
              { id: "national", label: t.planningNational },
              { id: "district", label: t.planningDistrict },
            ]}
          />
        </View>
      </View>

      {geography === "district" ? (
        <SecondaryButton
          label={selectedDistrict?.district ?? t.planningSelectDistrict}
          icon="location-outline"
          onPress={() => setPicker("district")}
        />
      ) : null}

      <MetricSelector
        label={t.planningSeason}
        value={season}
        onChange={setSeason}
        options={seasonOptions}
      />
      <MetricSelector
        label={t.planningMetric}
        value={metric}
        onChange={(value) => setMetric(value as ProjectionMetric)}
        options={[
          { id: "yield_kg_ha", label: t.planningYield, disabled: method === "personal", disabledReason: t.planningProduction },
          { id: "production_mt", label: t.planningProduction },
        ]}
      />
      <MetricSelector
        label={t.planningMethod}
        value={method}
        onChange={(value) => setMethod(value as ProjectionMethod)}
        options={[
          { id: "carry_forward", label: t.planningCarryForward },
          { id: "percent_change", label: t.planningPercentChange },
          { id: "personal", label: t.planningPersonal },
        ]}
      />

      {origins.isError ? <ErrorState message={t.errorGeneric} onRetry={() => void origins.refetch()} /> : null}
      {origins.isLoading ? <Text style={typography.caption}>{t.loading}</Text> : null}
      {originsEnabled && !origins.isLoading && !origins.isError && !originOptions.length ? (
        <EmptyState title={t.planningNoOrigins} message={origins.data?.note ?? t.noDataAvailable} icon="calendar-outline" />
      ) : null}
      {originOptions.length ? (
        <SecondaryButton
          label={originOptions.find((item) => item.period_code === origin)?.period_label ?? t.planningSelectOrigin}
          icon="calendar-outline"
          onPress={() => setPicker("origin")}
        />
      ) : null}

      <MetricSelector
        label={t.planningHorizon}
        value={horizon}
        onChange={setHorizon}
        options={[1, 2, 3].map((value) => ({ id: String(value), label: String(value) }))}
      />

      {method === "percent_change" ? (
        <InputField label={t.planningChange} value={change} onChangeText={setChange} suffix="%" />
      ) : null}
      {method === "personal" ? (
        <View style={styles.inputGroup}>
          <InputField label={t.planningAssumedYield} value={assumedYield} onChangeText={setAssumedYield} suffix="kg/ha" />
          <InputField label={t.planningAssumedArea} value={assumedArea} onChangeText={setAssumedArea} suffix="ha" />
        </View>
      ) : null}

      {showValidation && validationMessage ? <DataWarning text={validationMessage} /> : null}
      <PrimaryButton
        label={calculation.isPending ? t.planningCalculating : t.planningCalculate}
        icon="analytics-outline"
        loading={calculation.isPending}
        disabled={!canCalculate}
        onPress={calculate}
      />

      {calculation.isError ? <ErrorState message={calculation.error.message || t.errorGeneric} onRetry={calculate} /> : null}
      {result ? <ProjectionResult result={result} /> : null}

      <SingleSelectSheet
        visible={picker !== null}
        title={picker === "crop" ? t.planningCrop : picker === "district" ? t.planningDistrict : t.planningOrigin}
        searchPlaceholder={picker === "crop" ? t.searchCrops : picker === "district" ? t.searchDistricts : t.planningSelectOrigin}
        options={pickerOptions}
        selected={pickerSelected || null}
        onCancel={() => setPicker(null)}
        onApply={(value) => {
          if (picker === "crop" && value) setCrop(value);
          if (picker === "district" && value) setDistrict(value);
          if (picker === "origin" && value) setOrigin(value);
          setPicker(null);
        }}
      />
    </DataSection>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  suffix: string;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.inputGroup}>
      <Text style={typography.microCaps}>{label.toUpperCase()}</Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor={colors.slate500}
          style={styles.input}
        />
        <Text style={typography.caption}>{suffix}</Text>
      </View>
    </View>
  );
}

function ProjectionResult({ result }: { result: ManualProjectionResponse }) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  return (
    <View style={styles.result}>
      <View style={styles.resultHeading}>
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{t.planningResult}</Text>
          <Text style={typography.caption}>{result.assumption_badge}</Text>
        </View>
        <Text style={[styles.resultKind, { color: colors.primaryStrong }]}>{result.value_kind_label}</Text>
      </View>
      <View style={styles.metricRow}>
        <MetricReadout
          label={result.baseline_is_assumption ? t.planningAssumed : t.planningBaseline}
          value={result.baseline_value}
          unit={result.baseline_unit}
        />
        <View style={styles.metricDivider} />
        <MetricReadout label={t.planningOrigin} value={null} note={result.resolved.origin_label} />
      </View>
      {result.cases.map((item) => (
        <View key={item.label} style={styles.caseBlock}>
          <View style={styles.caseHeader}>
            <Text style={typography.h3}>{item.label}</Text>
            {typeof item.change_pct === "number" ? (
              <Text style={typography.caption}>{item.change_pct > 0 ? "+" : ""}{item.change_pct}%</Text>
            ) : null}
          </View>
          {item.points.map((point) => (
            <InfoRow
              key={`${item.label}-${point.period_code}`}
              label={point.period_label}
              value={`${formatNumber(point.value)} ${point.unit}`}
              note={point.is_planning_target ? t.planningTarget : t.planningObserved}
            />
          ))}
        </View>
      ))}
      <DataWarning text={t.planningSourceNote} tone="slate" />
      <SourceMethodSheet
        source={result.provenance.source_id}
        period={result.provenance.source_period}
        unit={result.units}
        method={result.method_note}
        limitations={[...result.warnings, ...result.limitations]}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    selectorRow: { flexDirection: "row", gap: spacing.sm },
    selectorCell: { flex: 1, gap: spacing.xs, minWidth: 0 },
    inputGroup: { gap: spacing.xs },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 46,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.background,
    },
    input: { flex: 1, color: colors.slate900, fontSize: 16, paddingVertical: 9 },
    result: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.md },
    resultHeading: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    resultKind: { fontSize: 11, fontWeight: "700", maxWidth: 130, textAlign: "right" },
    metricRow: { flexDirection: "row", alignItems: "stretch", gap: spacing.sm },
    metricDivider: { width: 1, backgroundColor: colors.hairline },
    caseBlock: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm, gap: spacing.xs },
    caseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  });
