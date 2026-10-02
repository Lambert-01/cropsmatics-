import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CropBoardRow, type BoardMetric } from "../../src/components/CropBoardRow";
import { ChangeIndicator, DataSection, MetricSelector } from "../../src/components/data-view";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import { EmptyState, ErrorState, FilterChip, ListRow, LoadingSkeleton, SearchBar } from "../../src/components/ui";
import { useAllCrops, useNationalBoard } from "../../src/hooks/queries";
import { useSavedCrops } from "../../src/hooks/useSavedCrops";
import { strings } from "../../src/i18n";
import type { NationalBoardCrop } from "../../src/types";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";
import { computeMovers } from "../../src/utils/movers";
import { slugifyEntity } from "../../src/utils/slug";

/** Row height the skeleton must match, so the list does not jump when it lands. */
const ROW_HEIGHT = 96;
const PULSE_METRIC: BoardMetric = "production_mt";
/** Movers are shown only when a same-season change exists for the crop. */
const MOVERS = 3;

export default function CropsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [scope, setScope] = useState<"all" | "saved">("all");
  const [metric, setMetric] = useState<BoardMetric>("production_mt");

  const crops = useAllCrops();
  // One request for the whole board: the series are already aligned to a shared
  // period axis and the same-season change is computed by the service.
  const board = useNationalBoard();
  const { savedCodes, toggle } = useSavedCrops();

  const byName = useMemo(() => {
    const map = new Map<string, NationalBoardCrop>();
    for (const crop of board.data?.crops ?? []) map.set(crop.crop.toLowerCase(), crop);
    return map;
  }, [board.data]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const crop of crops.data ?? []) if (crop.category) set.add(crop.category);
    return Array.from(set).sort();
  }, [crops.data]);

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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        <FilterChip label={t.allCategories} selected={category === "all"} onPress={() => setCategory("all")} />
        {categories.map((item) => (
          <FilterChip
            key={item}
            label={item}
            selected={category === item}
            onPress={() => setCategory(item)}
          />
        ))}
      </ScrollView>

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
      ) : rows.length ? (
        <>
          <View style={styles.countRow}>
            <Text style={typography.micro}>
              {`${rows.length} ${t.crops} · ${t.nationalSeries}`}
            </Text>
            <Text style={typography.micro}>
              {board.data?.periods.length
                ? `${board.data.periods[0]}–${board.data.periods[board.data.periods.length - 1]}`
                : ""}
            </Text>
          </View>
          <View>
            {rows.map((crop) => {
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
          message={t.noDataAvailable}
          icon={scope === "saved" ? "bookmark-outline" : "leaf-outline"}
        />
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  scopeRow: { flexDirection: "row", gap: spacing.sm },
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
