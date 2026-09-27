import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, SearchBar } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { cropsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";
import { slugifyEntity } from "../../src/utils/slug";

export default function CropsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["crops"], queryFn: cropsApi.list });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const crop of data ?? []) if (crop.category) set.add(crop.category);
    return Array.from(set).sort();
  }, [data]);

  const filtered = (data ?? []).filter((crop) => {
    if (category !== "all" && crop.category !== category) return false;
    if (!query) return true;
    return slugifyEntity(crop.crop_name).includes(slugifyEntity(query));
  });

  return (
    <ScreenLayout back active="explore">
      <SearchBar value={query} onChangeText={setQuery} placeholder={t.searchCrops} />
      <View style={styles.chips}>
        <FilterChip label={t.allCategories} selected={category === "all"} onPress={() => setCategory("all")} />
        {categories.map((item) => (
          <FilterChip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
        ))}
      </View>

      {isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <>
          <LoadingSkeleton height={84} />
          <LoadingSkeleton height={84} />
          <LoadingSkeleton height={84} />
        </>
      ) : filtered.length ? (
        filtered.map((crop) => (
          <Card
            key={crop.crop_code}
            onPress={() => router.push(('/explore/crop/' + crop.crop_code) as never)}
            accessibilityLabel={crop.crop_name}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          >
            <View style={styles.cropIcon}>
              <Text style={{ fontSize: 22 }}>🌿</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h2}>{crop.crop_name}</Text>
              <Text style={typography.caption}>
                {crop.category ?? "—"}
                {crop.kinyarwanda_name ? ` · ${crop.kinyarwanda_name}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.code}>{crop.crop_code}</Text>
              {crop.cold_chain_recommended ? <Text style={styles.cold}>Cold chain</Text> : null}
            </View>
          </Card>
        ))
      ) : (
        <EmptyState title={t.noResults} message={t.noDataAvailable} icon="leaf-outline" />
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cropIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  code: { ...typography.micro, color: colors.slate500 },
  cold: { fontSize: 10, fontWeight: "700", color: colors.blue },
});
