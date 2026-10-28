import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CropBoardRow, type BoardMetric } from "../../src/components/CropBoardRow";
import { ChangeIndicator, DataSection, DataWarning, MetricSelector } from "../../src/components/data-view";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import { EmptyState, ErrorState, FilterButton, FilterChip, ListRow, LoadingSkeleton, SearchBar } from "../../src/components/ui";
import { SingleSelectSheet } from "../../src/components/terminal/SingleSelectSheet";
import { useAllCrops, useAllDistricts, useNationalBoard, usePeriods, usePracticeIndicators } from "../../src/hooks/queries";
import { useSavedCrops } from "../../src/hooks/useSavedCrops";
import { strings } from "../../src/i18n";
import type { NationalBoardCrop, PracticeObservation } from "../../src/types";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";
import { computeMovers } from "../../src/utils/movers";
import { slugifyEntity } from "../../src/utils/slug";

/** Row height the skeleton must match, so the list does not jump when it lands. */
const ROW_HEIGHT = 96;
const PULSE_METRIC: BoardMetric = "production_mt";
/** Movers are shown only when a same-season change exists for the crop. */
const MOVERS = 3;

export default function CropsScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [scope, setScope] = useState<"all" | "saved">("all");
  const [metric, setMetric] = useState<BoardMetric>("production_mt");
  const [periodCode, setPeriodCode] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false);
  const [districtSheetOpen, setDistrictSheetOpen] = useState(false);

  const crops = useAllCrops();
  const periodsQuery = usePeriods();
  const districtsQuery = useAllDistricts();
  // One request for the whole board: the series are already aligned to a shared
  // period axis and the same-season change is computed by the service. The
  // exact period scope is applied by the server, so a filtered board is filtered
  // data rather than a filtered label. The default is deliberately the complete
  // published axis, not the latest release.
  const board = useNationalBoard(undefined, { periodCode });
  const practice = usePracticeIndicators({
    district: district ?? undefined,
    periodCode: periodCode ?? undefined,
    enabled: Boolean(district),
  });
  const { savedCodes, toggle } = useSavedCrops();

  const byName = useMemo(() => {
    const map = new Map<string, NationalBoardCrop>();
    for (const crop of board.data?.crops ?? []) map.set(crop.crop.toLowerCase(), crop);
    return map;
  }, [board.data]);

  // Memoised because the scope controls below derive from it: reading it off
  // `board.data` inline would mint a new array each render and re-run them.
  const periods = useMemo(() => board.data?.periods ?? [], [board.data]);
  const catalogPeriods = useMemo(() => periodsQuery.data?.periods ?? [], [periodsQuery.data]);
  const periodOptions = useMemo(
    () => [
      {
        id: "__all__",
        label: t.allPublishedPeriods,
        hint: `${catalogPeriods.length || periods.length} ${t.period}`,
      },
      ...catalogPeriods.map((period) => ({
        id: period.period_code,
        label: period.label,
        hint: `${period.n_districts} ${t.districts}`,
      })),
    ],
    [catalogPeriods, periods.length, t],
  );
  const selectedPeriodLabel = periodCode
    ? catalogPeriods.find((period) => period.period_code === periodCode)?.label ??
      board.data?.period_labels?.[periodCode] ??
      periodCode
    : t.allPublishedPeriods;

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const crop of crops.data ?? []) if (crop.category) set.add(crop.category);
    return Array.from(set).sort();
  }, [crops.data]);
  const categoryOptions = useMemo(
    () => [
      { id: "__all__", label: t.allCategories, hint: `${categories.length} ${t.allCategories.toLowerCase()}` },
      ...categories.map((item) => ({ id: item, label: item })),
    ],
    [categories, t],
  );
  const districtOptions = useMemo(
    () => [
      { id: "__all__", label: t.allDistricts, hint: t.nationalSeries },
      ...(districtsQuery.data ?? []).map((item) => ({ id: item.district, label: item.district })),
    ],
    [districtsQuery.data, t],
  );

  const savedCount = useMemo(
    () => (crops.data ?? []).filter((crop) => savedCodes[crop.crop_code]).length,
    [crops.data, savedCodes],
  );

  const rows = useMemo(
    () =>
      (crops.data ?? []).filter((crop) => {
        if (scope === "saved" && !savedCodes[crop.crop_code]) return false;
        if (category !== "all" && crop.category !== category) return false;
        if (!query) return true;
        return slugifyEntity(crop.crop_name).includes(slugifyEntity(query));
      }),
    [crops.data, category, query, scope, savedCodes],
  );

  // A period filter must change the visible observations, not only the label
  // above them. Rows with no value in the selected release are omitted and the
  // empty state explains why, instead of showing an unchanged catalogue with
  // repeated "not published" values.
  const visibleRows = useMemo(() => {
    if (!periodCode || !board.data) return rows;
    const index = board.data.periods.indexOf(periodCode);
    if (index < 0) return [];
    return rows.filter((crop) => {
      const entry = byName.get(crop.crop_name.toLowerCase());
      return typeof entry?.series?.[metric]?.[index] === "number";
    });
  }, [board.data, byName, metric, periodCode, rows]);

  // Movers come straight from the board's platform-computed same-season change:
  // the strongest rise and the strongest fall in published production. A crop
  // without a comparable earlier period is excluded, never treated as 0%.
  const movers = useMemo(
    () => computeMovers(board.data?.crops, PULSE_METRIC, MOVERS),
    [board.data],
  );

  const metricLabel =
    metric === "production_mt"
      ? t.metricProduction
      : metric === "harvested_area_ha"
        ? t.metricArea
        : t.metricYield;

  if (crops.isError || board.isError) {
    return (
      <ScreenLayout back active="crops">
        <ErrorState
          message={t.errorGeneric}
          onRetry={() => {
            void crops.refetch();
            void board.refetch();
          }}
        />
      </ScreenLayout>
    );
  }

  const loading = crops.isLoading || board.isLoading;

  return (
    <ScreenLayout back active="crops">
      {/* Controls stay compact: the board is the content. */}
      <SearchBar value={query} onChangeText={setQuery} placeholder={t.searchCrops} />

        <View style={styles.scopeRow}>
        <FilterChip label={t.filterAll} selected={scope === "all"} onPress={() => setScope("all")} />
        <FilterChip
          label={savedCount ? `${t.filterSaved} · ${savedCount}` : t.filterSaved}
          selected={scope === "saved"}
          onPress={() => setScope("saved")}
        />
      </View>

      <View style={styles.filterGrid}>
        <FilterButton
          label={t.selectPeriod}
          value={selectedPeriodLabel}
          active={periodCode !== null}
          icon="calendar-outline"
          onPress={() => setPeriodSheetOpen(true)}
        />
        <FilterButton
          label={t.allCategories}
          value={category === "all" ? t.allCategories : category}
          active={category !== "all"}
          icon="layers-outline"
          onPress={() => setCategorySheetOpen(true)}
        />
        <FilterButton
          label={t.district}
          value={district ?? t.allDistricts}
          active={district !== null}
          icon="location-outline"
          onPress={() => setDistrictSheetOpen(true)}
        />
      </View>

      <SingleSelectSheet
        visible={periodSheetOpen}
        title={t.selectPeriod}
        subtitle={t.allPublishedPeriods}
        searchPlaceholder={t.selectPeriod}
        options={periodOptions}
        selected={periodCode ?? "__all__"}
        onApply={(next) => {
          setPeriodCode(next && next !== "__all__" ? next : null);
          setPeriodSheetOpen(false);
        }}
        onCancel={() => setPeriodSheetOpen(false)}
      />
      <SingleSelectSheet
        visible={districtSheetOpen}
        title={t.district}
        subtitle={t.cropDistrictLensSubtitle}
        searchPlaceholder={t.searchDistricts}
        options={districtOptions}
        selected={district ?? "__all__"}
        onApply={(next) => {
          setDistrict(next && next !== "__all__" ? next : null);
          setDistrictSheetOpen(false);
        }}
        onCancel={() => setDistrictSheetOpen(false)}
      />
      <SingleSelectSheet
        visible={categorySheetOpen}
        title={t.allCategories}
        subtitle={`${categories.length} ${t.allCategories.toLowerCase()}`}
        searchPlaceholder={t.searchCrops}
        options={categoryOptions}
        selected={category === "all" ? "__all__" : category}
        onApply={(next) => {
          setCategory(next && next !== "__all__" ? next : "all");
          setCategorySheetOpen(false);
        }}
        onCancel={() => setCategorySheetOpen(false)}
      />

      <MetricSelector
        label={t.selectIndicator}
        value={metric}
        onChange={(id) => setMetric(id as BoardMetric)}
        options={[
          { id: "production_mt", label: t.metricProduction },
          { id: "harvested_area_ha", label: t.metricArea },
          { id: "yield_mt_ha", label: t.metricYield },
        ]}
      />

      {district ? <DistrictLens district={district} practice={practice} /> : null}

      {/* Movers: a compact read of the biggest published changes. */}
      {!loading && metric === PULSE_METRIC && (movers.growing.length || movers.falling.length) ? (
        <DataSection title={t.moversTitle} subtitle={t.moversSubtitle}>
          {movers.growing.map((item) => (
            <ListRow
              key={`up-${item.crop}`}
              title={item.crop}
              subtitle={t.latestPublished}
              right={<ChangeIndicator change={item.change} tone="positive" />}
            />
          ))}
          {movers.falling.map((item) => (
            <ListRow
              key={`down-${item.crop}`}
              title={item.crop}
              subtitle={t.latestPublished}
              right={<ChangeIndicator change={item.change} tone="negative" />}
            />
          ))}
        </DataSection>
      ) : null}

      {loading ? (
        <View>
          {[0, 1, 2, 3, 4].map((key) => (
            <LoadingSkeleton key={key} height={ROW_HEIGHT} />
          ))}
        </View>
      ) : visibleRows.length ? (
        <>
          <View style={styles.countRow}>
            <Text style={typography.micro}>
              {`${visibleRows.length} ${t.crops} · ${selectedPeriodLabel}`}
            </Text>
            <Text style={typography.micro}>
              {periods.length ? `${periods[0]}–${periods[periods.length - 1]}` : ""}
            </Text>
          </View>
          {/* A single pinned period has no same-season predecessor to compare
              with, so say so instead of leaving the row blank. */}
          {periodCode ? (
            <Text style={typography.caption}>{t.noComparableChange}</Text>
          ) : null}
          <View>
            {visibleRows.map((crop) => {
              const saved = Boolean(savedCodes[crop.crop_code]);
              return (
                <CropBoardRow
                  key={crop.crop_code}
                  crop={byName.get(crop.crop_name.toLowerCase()) ?? null}
                  metric={metric}
                  metricLabel={metricLabel}
                  periods={board.data?.periods ?? []}
                  periodLabels={board.data?.period_labels ?? {}}
                  unit={board.data?.metric_units?.[metric] ?? null}
                  changeNote={t.noComparableChange}
                  onPress={() => router.push((`/explore/crop/${crop.crop_code}`) as never)}
                  right={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={saved ? t.unsaveItem : t.saveItem}
                      accessibilityState={{ selected: saved }}
                      hitSlop={8}
                      onPress={() => toggle(crop)}
                      style={styles.star}
                    >
                      <Ionicons
                        name={saved ? "bookmark" : "bookmark-outline"}
                        size={18}
                        color={saved ? colors.primary : colors.slate300}
                      />
                    </Pressable>
                  }
                />
              );
            })}
          </View>
        </>
      ) : (
        <EmptyState
          title={scope === "saved" ? t.savedEmpty : t.noResults}
          message={periodCode ? t.noPublishedSelection.replace("{metric}", metricLabel).replace("{selection}", selectedPeriodLabel) : t.noDataAvailable}
          icon={scope === "saved" ? "bookmark-outline" : "leaf-outline"}
        />
      )}
    </ScreenLayout>
  );
}

function DistrictLens({
  district,
  practice,
}: {
  district: string;
  practice: ReturnType<typeof usePracticeIndicators>;
}) {
  const { typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  const observations = useMemo(() => {
    const latest = new Map<string, PracticeObservation>();
    for (const row of practice.data?.observations ?? []) {
      if (row.value !== null && row.value !== undefined) latest.set(row.indicator_code, row);
    }
    return Array.from(latest.values()).slice(0, 6);
  }, [practice.data]);

  return (
    <DataSection title={`${t.district}: ${district}`} subtitle={t.cropDistrictLensSubtitle}>
      {practice.isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void practice.refetch()} />
      ) : practice.isLoading ? (
        <LoadingSkeleton height={140} />
      ) : practice.data && !practice.data.available ? (
        <EmptyState title={practice.data.note ?? t.noDataAvailable} icon="layers-outline" />
      ) : observations.length ? (
        <>
          {observations.map((row) => (
            <ListRow
              key={`${row.indicator_code}-${row.period_code}`}
              title={row.indicator_code.replace(/_/g, " ")}
              subtitle={`${row.period_code} · ${row.unit ?? "%"}`}
              right={<Text style={typography.numericSmall}>{`${row.value}${row.unit ? ` ${row.unit}` : ""}`}</Text>}
            />
          ))}
          <DataWarning text={t.cropDistrictLensNote} tone="slate" />
        </>
      ) : (
        <EmptyState title={t.noDataAvailable} icon="layers-outline" />
      )}
    </DataSection>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  scopeRow: { flexDirection: "row", gap: spacing.sm },
  filterGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  star: { width: 34, minHeight: 44, alignItems: "center", justifyContent: "center" },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
