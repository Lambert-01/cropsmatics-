import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, SearchBar } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { districtsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";
import { slugifyEntity } from "../../src/utils/slug";

const PROVINCES = ["Kigali City", "Northern", "Southern", "Eastern", "Western"];

export default function DistrictsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [query, setQuery] = useState("");
  const [province, setProvince] = useState<string>("all");

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["districts"], queryFn: districtsApi.list });

  const filtered = useMemo(() => {
    return (data ?? []).filter((d) => {
      if (province !== "all" && d.province !== province) return false;
      if (!query) return true;
      return slugifyEntity(d.district).includes(slugifyEntity(query));
    });
  }, [data, province, query]);

  return (
    <ScreenLayout back active="explore">
      <SearchBar value={query} onChangeText={setQuery} placeholder={t.searchDistricts} />
      <View style={styles.chips}>
        <FilterChip label={t.allCategories} selected={province === "all"} onPress={() => setProvince("all")} />
        {PROVINCES.map((item) => (
          <FilterChip key={item} label={item} selected={province === item} onPress={() => setProvince(item)} />
        ))}
      </View>

      {isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <>
          <LoadingSkeleton height={76} />
          <LoadingSkeleton height={76} />
          <LoadingSkeleton height={76} />
        </>
      ) : filtered.length ? (
        filtered.map((district) => (
          <Card
            key={district.district_code}
            onPress={() => router.push(("/explore/district/" + district.district_code) as never)}
            accessibilityLabel={district.district}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          >
            <View style={styles.icon}>
              <Text style={{ fontSize: 20 }}>📍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h2}>{district.district}</Text>
              <Text style={typography.caption}>
                {district.province ?? "—"}
                {district.agro_ecological_zone ? ` · ${district.agro_ecological_zone}` : ""}
              </Text>
            </View>
            <Text style={styles.code}>{district.district_code}</Text>
          </Card>
        ))
      ) : (
        <EmptyState title={t.noResults} message={t.noDataAvailable} icon="location-outline" />
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  code: { ...typography.micro, color: colors.slate500 },
});
