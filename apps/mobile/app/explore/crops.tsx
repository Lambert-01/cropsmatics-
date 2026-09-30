import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { CropBoardRow, type BoardMetric } from "../../src/components/CropBoardRow";
import { MetricSelector } from "../../src/components/data-view";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import { EmptyState, ErrorState, FilterChip, LoadingSkeleton, SearchBar } from "../../src/components/ui";
import { useAllCrops, useNationalBoard } from "../../src/hooks/queries";
import { strings } from "../../src/i18n";
import type { NationalBoardCrop } from "../../src/types";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";
import { slugifyEntity } from "../../src/utils/slug";

/** Row height the skeleton must match, so the list does not jump when it lands. */
const ROW_HEIGHT = 96;

export default function CropsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [metric, setMetric] = useState<BoardMetric>("production_mt");

  const crops = useAllCrops();
  // One request for the whole board: the series are already aligned to a shared
  // period axis and the same-season change is computed by the service.
  const board = useNationalBoard();

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

  const rows = useMemo(
    () =>
      (crops.data ?? []).filter((crop) => {
        if (category !== "all" && crop.category !== category) return false;
        if (!query) return true;
        return slugifyEntity(crop.crop_name).includes(slugifyEntity(query));
      }),
    [crops.data, category, query],
  );

  const metricLabel =
    metric === "production_mt"
      ? t.metricProduction
      : metric === "harvested_area_ha"
        ? t.metricArea
        : t.metricYield;

  if (crops.isError || board.isError) {
    return (
      <ScreenLayout back active="explore">
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
    <ScreenLayout back active="explore">
      {/* Controls stay compact: the board is the content. */}
      <SearchBar value={query} onChangeText={setQuery} placeholder={t.searchCrops} />

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
            {rows.map((crop) => (
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
              />
            ))}
          </View>
        </>
      ) : (
        <EmptyState title={t.noResults} message={t.noDataAvailable} icon="leaf-outline" />
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
