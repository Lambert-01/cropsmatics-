import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MultiSeriesChart } from "../../src/components/charts";
import { DataSection, DataWarning } from "../../src/components/data-view";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FilterChip,
  InfoRow,
  LoadingSkeleton,
  SectionHeader,
  SourceCard,
} from "../../src/components/ui";
import { useAllDistricts, usePeriods, usePracticeIndicators } from "../../src/hooks/queries";
import { strings } from "../../src/i18n";
import { analyticsApi, indicatorsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { seriesColor, spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";
import { releaseLabel } from "../../src/utils/coverage";
import {
  districtIndicatorSeries,
  districtIndicators,
  indicatorBasisKey,
  indicatorLabelKey,
  PRACTICE_DOMAINS,
  practiceCoverage,
} from "../../src/utils/practiceIndicators";

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Productivity: "trending-up-outline",
  Inputs: "flask-outline",
  Irrigation: "water-outline",
  "Soil & Erosion": "layers-outline",
  "Post-Harvest": "cube-outline",
  Infrastructure: "business-outline",
};

export default function IndicatorsScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ id?: string }>();
  const [open, setOpen] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [practiceDomain, setPracticeDomain] = useState<string>("practice");
  const [practiceIndicator, setPracticeIndicator] = useState<string>("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["indicators"],
    queryFn: indicatorsApi.list,
  });

  const districts = useAllDistricts();
  // The practice endpoint returns district-grained rows and pages its 9,468-row
  // table, so an unfiltered chart would read one truncated page as if it were
  // the whole picture. A single district's slice (306 rows) always fits, so the
  // request waits for a district and a gap always means "not published".
  const practice = usePracticeIndicators({
    district: district ?? undefined,
    enabled: district !== null,
  });
  const availableDomains = PRACTICE_DOMAINS.filter((item) =>
    (practice.data?.domains ?? []).includes(item.domain),
  );
  const activeDomain = availableDomains.some((item) => item.domain === practiceDomain)
    ? practiceDomain
    : (availableDomains[0]?.domain ?? practiceDomain);
  const indicatorChoices =
    district && practice.data
      ? districtIndicators(practice.data.observations, district, activeDomain)
      : [];
  const activeIndicator = indicatorChoices.includes(practiceIndicator)
    ? practiceIndicator
    : (indicatorChoices[0] ?? "");
  const activeMeta = practice.data?.indicators.find(
    (item) => item.indicator_code === activeIndicator,
  );
  const coverage = practice.data ? practiceCoverage(practice.data.periods) : null;
  const periods = usePeriods();

  // One line for the chosen indicator, with a slot for every release the
  // domain is published for: an unpublished release draws a gap, and a
  // published 0% stays a real zero on the axis.
  const practiceSeries = useMemo(() => {
    if (!district || !practice.data || !activeIndicator) return [];
    const base = indicatorLabelKey(activeIndicator);
    const basis = indicatorBasisKey(activeIndicator);
    const label = [
      base ? t[base] : activeIndicator.replace(/_/g, " "),
      basis ? t[basis] : null,
    ]
      .filter(Boolean)
      .join(" ");
    return [
      {
        key: activeIndicator,
        label,
        color: colors.primary,
        points: districtIndicatorSeries(
          practice.data.observations,
          district,
          activeIndicator,
          practice.data.periods,
        ).map((point) => ({
          label: releaseLabel(point.period, periods.data?.periods ?? []) ?? point.period,
          value: point.value,
        })),
      },
    ];
  }, [district, practice.data, activeIndicator, t, colors.primary, periods.data]);

  // National input/practice adoption trend. Only series the endpoint actually
  // publishes a value for are drawn, so a missing practice never reads as 0%.
  const adoption = useQuery({
    queryKey: ["input-adoption"],
    queryFn: analyticsApi.inputAdoption,
  });
  const adoptionSeries = useMemo(() => {
    const points = adoption.data?.points ?? [];
    const defs = [
      { key: "improved_seed_pct", label: t.improvedSeed },
      { key: "inorganic_fertilizer_pct", label: t.inorganicFertilizer },
      { key: "organic_fertilizer_pct", label: t.organicFertilizer },
      { key: "pesticide_pct", label: t.pesticide },
      { key: "irrigation_pct", label: t.irrigation },
      { key: "anti_erosion_pct", label: t.erosionProtection },
    ];
    return defs
      .map((def, index) => ({
        key: def.key,
        label: def.label,
        color: seriesColor(index),
        points: points.map((point) => ({
          label: point.label ?? point.period,
          value: point.values?.[def.key] ?? null,
        })),
      }))
      .filter((serie) => serie.points.some((point) => point.value !== null));
  }, [adoption.data, t]);

  const selected = data?.indicators.find((i) => i.id === params.id) ?? null;

  return (
    <ScreenLayout back active="explore">
      {isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <>
          <LoadingSkeleton height={90} />
          <LoadingSkeleton height={90} />
          <LoadingSkeleton height={90} />
        </>
      ) : (
        <>
          <SectionHeader title={t.indicatorsTitle} subtitle={t.indicatorsSubtitle} />
          <Badge text={`Latest: ${data?.latest_period_label ?? "—"}`} tone="blue" />

          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title={t.inputAdoptionTitle} subtitle={t.inputAdoptionSubtitle} />
            {adoption.isError ? (
              <Text style={typography.caption}>{t.errorGeneric}</Text>
            ) : adoption.isLoading ? (
              <LoadingSkeleton height={220} />
            ) : adoptionSeries.length ? (
              <>
                <MultiSeriesChart
                  series={adoptionSeries}
                  unit="%"
                  height={240}
                  accessibilityLabel={t.inputAdoptionTitle}
                />
                <DataWarning text={t.inputAdoptionNote} tone="slate" />
              </>
            ) : (
              <EmptyState title={t.noDataAvailable} icon="flask-outline" />
            )}
          </Card>

          {/* Multi-period practice history (2024A-2026B). District-grained and
              gated on a district: the endpoint pages its full table, and a
              truncated slice must never read as the whole picture. */}
          <DataSection title={t.practiceHistoryTitle} subtitle={t.practiceHistorySubtitle}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              keyboardShouldPersistTaps="handled"
            >
              {(districts.data ?? []).map((item) => (
                <FilterChip
                  key={item.district_code}
                  label={item.district}
                  selected={district === item.district}
                  onPress={() => setDistrict(item.district)}
                />
              ))}
            </ScrollView>

            {district === null ? (
              <Text style={typography.caption}>{t.practicePickDistrictNote}</Text>
            ) : practice.isError ? (
              <ErrorState
                message={t.errorGeneric}
                onRetry={() => void practice.refetch()}
              />
            ) : practice.isLoading ? (
              <LoadingSkeleton height={220} />
            ) : practice.data && !practice.data.available ? (
              <EmptyState title={practice.data.note ?? t.practiceUnavailableNote} icon="cloud-offline-outline" />
            ) : practice.data ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                  keyboardShouldPersistTaps="handled"
                >
                  {availableDomains.map((item) => (
                    <FilterChip
                      key={item.domain}
                      label={t[item.key]}
                      selected={item.domain === activeDomain}
                      onPress={() => setPracticeDomain(item.domain)}
                    />
                  ))}
                </ScrollView>

                {indicatorChoices.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chips}
                    keyboardShouldPersistTaps="handled"
                  >
                    {indicatorChoices.map((code) => {
                      const base = indicatorLabelKey(code);
                      const basis = indicatorBasisKey(code);
                      const label = [
                        base ? t[base] : code.replace(/_/g, " "),
                        basis ? t[basis] : null,
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <FilterChip
                          key={code}
                          label={label}
                          selected={code === activeIndicator}
                          onPress={() => setPracticeIndicator(code)}
                        />
                      );
                    })}
                  </ScrollView>
                ) : null}

                {practiceSeries.length ? (
                  <>
                    <MultiSeriesChart
                      series={practiceSeries}
                      unit="%"
                      height={220}
                      accessibilityLabel={`${t.practiceHistoryTitle} — ${district}`}
                    />
                    <InfoRow
                      label={t.sheetUnit}
                      value={activeMeta?.unit ?? "%"}
                      note={activeMeta?.geography_levels?.join(", ")}
                    />
                  </>
                ) : (
                  <EmptyState title={t.noDataAvailable} icon="analytics-outline" />
                )}

                <Text style={typography.micro}>{t.practiceZeroNote}</Text>
                {coverage ? (
                  <DataWarning
                    tone="slate"
                    text={t.practiceCoverageNote.replace(
                      "{periods}",
                      `${coverage.first}\u2013${coverage.last}`,
                    )}
                  />
                ) : null}
                {practice.data.note ? <DataWarning tone="slate" text={practice.data.note} /> : null}
                <SourceCard
                  sourceLabel={practice.data.provenance?.source_id}
                  coverage="district"
                  limitations={practice.data.provenance?.limitations}
                />
              </>
            ) : null}
          </DataSection>

          {(data?.categories ?? []).map((category) => {
            const items = (data?.indicators ?? []).filter(
              (i) => i.category === category.label && i.available,
            );
            const expanded = open === category.id || selected?.category === category.label;
            return (
              <Card key={category.id} style={{ gap: spacing.sm }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={category.label}
                  onPress={() => setOpen(expanded ? null : category.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
                >
                  <View style={styles.icon}>
                    <Ionicons name={CATEGORY_ICON[category.label] ?? "analytics-outline"} size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h2}>{category.label}</Text>
                    <Text style={typography.caption}>
                      {category.available_count} available indicator{category.available_count === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.slate300} />
                </Pressable>

                {expanded
                  ? items.map((indicator) => (
                      <View key={indicator.id} style={styles.indicator}>
                        <Text style={typography.h3}>{indicator.label}</Text>
                        <InfoRow label={t.sheetUnit} value={indicator.unit ?? "—"} />
                        <InfoRow label={t.sheetPeriod} value={indicator.period ?? "—"} />
                        <InfoRow label={t.sheetCoverage} value={indicator.coverage_level ?? "—"} />
                        <InfoRow label={t.aggregation} value={indicator.aggregation.replace(/_/g, " ")} />
                        <SourceCard sourceLabel={indicator.source_label} period={indicator.period} coverage={indicator.coverage_level} />
                      </View>
                    ))
                  : null}
              </Card>
            );
          })}

          {!data?.indicators.some((i) => i.available) ? <EmptyState title={t.noDataAvailable} /> : null}
        </>
      )}
    </ScreenLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    paddingRight: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
});
