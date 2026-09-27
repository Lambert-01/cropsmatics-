import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HorizontalBarChart } from "../../src/components/charts";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  Card,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingSkeleton,
  SearchBar,
  SectionHeader,
  SourceCard,
} from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { analyticsApi, cropsApi, districtsApi } from "../../src/services/api";
import type { DistrictProfile } from "../../src/services/api/districts";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing, typography } from "../../src/theme";
import { slugifyEntity } from "../../src/utils/slug";

type Mode = "crops" | "districts";
type CropMetric = "production_mt" | "harvested_area_ha";

export default function CompareScreen() {
  const t = strings(useAppStore((s) => s.language));
  const [mode, setMode] = useState<Mode>("crops");
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [cropMetric, setCropMetric] = useState<CropMetric>("production_mt");
  const [query, setQuery] = useState("");

  const crops = useQuery({ queryKey: ["crops"], queryFn: cropsApi.list });
  const districts = useQuery({ queryKey: ["districts"], queryFn: districtsApi.list });

  const compareTrends = useQuery({
    queryKey: ["compare-trends", selectedCrops],
    queryFn: () => analyticsApi.trends({ compare: selectedCrops.join(",") }),
    enabled: mode === "crops" && selectedCrops.length >= 2,
  });

  // District comparison uses the same indicator on every district.
  const profiles = useQuery({
    queryKey: ["compare-districts", selectedDistricts],
    queryFn: async () => {
      const results = await Promise.all(selectedDistricts.map((slug) => districtsApi.profile(slug)));
      return results;
    },
    enabled: mode === "districts" && selectedDistricts.length >= 2,
  });

  const toggle = (list: string[], setList: (v: string[]) => void, value: string, max: number) => {
    if (list.includes(value)) setList(list.filter((v) => v !== value));
    else if (list.length < max) setList([...list, value]);
  };

  const filteredCrops = (crops.data ?? []).filter((c) => !query || slugifyEntity(c.crop_name).includes(slugifyEntity(query)));
  const filteredDistricts = (districts.data ?? []).filter((d) => !query || slugifyEntity(d.district).includes(slugifyEntity(query)));

  const cropBars = (() => {
    const points = compareTrends.data?.points ?? [];
    const latest = points[points.length - 1];
    if (!latest) return [];
    // The compare series keys each value as "<metric>:<crop>", e.g.
    // "production_mt:Maize" (see trend_service.crop_trends).
    return (compareTrends.data?.compared_crops ?? []).map((crop) => ({
      label: crop ?? "—",
      value: latest.values?.[`${cropMetric}:${crop}`] ?? null,
    }));
  })();

  const districtBars = (profiles.data ?? []).map((profile: DistrictProfile) => ({
    label: profile.district,
    value: profile.n_crops_with_data,
  }));

  return (
    <ScreenLayout back active="explore">
      <SectionHeader title={t.compareTitle} subtitle={t.compareSubtitle} />
      <View style={styles.row}>
        <FilterChip label="Compare crops" selected={mode === "crops"} onPress={() => setMode("crops")} />
        <FilterChip label="Compare districts" selected={mode === "districts"} onPress={() => setMode("districts")} />
      </View>

      <SearchBar value={query} onChangeText={setQuery} placeholder={mode === "crops" ? t.searchCrops : t.searchDistricts} />

      {mode === "crops" ? (
        <>
          <View style={styles.chips}>
            {filteredCrops.map((crop) => (
              <FilterChip
                key={crop.crop_code}
                label={crop.crop_name}
                selected={selectedCrops.includes(crop.crop_name)}
                onPress={() => toggle(selectedCrops, setSelectedCrops, crop.crop_name, 5)}
              />
            ))}
          </View>
          <Text style={typography.micro}>{selectedCrops.length}/5 crops selected</Text>
          <View style={styles.chips}>
            <FilterChip label={t.production} selected={cropMetric === "production_mt"} onPress={() => setCropMetric("production_mt")} />
            <FilterChip label={t.harvestedArea} selected={cropMetric === "harvested_area_ha"} onPress={() => setCropMetric("harvested_area_ha")} />
          </View>
          {selectedCrops.length < 2 ? (
            <EmptyState title="Pick at least two crops" message="Raw yield is not compared across crops because they do not share a natural scale." icon="git-compare-outline" />
          ) : compareTrends.isLoading ? (
            <LoadingSkeleton height={200} />
          ) : compareTrends.isError ? (
            <ErrorState message={t.errorGeneric} onRetry={() => void compareTrends.refetch()} />
          ) : (
            <Card>
              <HorizontalBarChart values={cropBars} unit={cropMetric === "production_mt" ? "t" : "ha"} />
              <Text style={typography.micro}>
                Absolute metrics only. Raw yield is deliberately not compared across crops: they do not share a
                natural yield scale.
              </Text>
              <SourceCard sourceLabel={compareTrends.data?.provenance?.source_id ?? undefined} coverage="national" limitations={compareTrends.data?.provenance?.limitations} />
            </Card>
          )}
        </>
      ) : (
        <>
          <View style={styles.chips}>
            {filteredDistricts.map((district) => (
              <FilterChip
                key={district.district_code}
                label={district.district}
                selected={selectedDistricts.includes(district.district_code)}
                onPress={() => toggle(selectedDistricts, setSelectedDistricts, district.district_code, 4)}
              />
            ))}
          </View>
          <Text style={typography.micro}>{selectedDistricts.length}/4 districts selected</Text>
          {selectedDistricts.length < 2 ? (
            <EmptyState
              title="Pick at least two districts"
              message="Districts are compared on the same indicator so the comparison stays meaningful."
              icon="git-compare-outline"
            />
          ) : profiles.isLoading ? (
            <LoadingSkeleton height={200} />
          ) : profiles.isError ? (
            <ErrorState message={t.errorGeneric} onRetry={() => void profiles.refetch()} />
          ) : (
            <Card>
              <SectionHeader title="Crops with published data" />
              <HorizontalBarChart values={districtBars} unit="crops" />
              <Text style={typography.micro}>A single cross-crop yield is never compared, because crops have different natural scales.</Text>
            </Card>
          )}
        </>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
