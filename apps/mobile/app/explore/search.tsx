import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  EmptyState,
  FilterChip,
  ListRow,
  LoadingSkeleton,
  SearchBar,
  SectionHeader,
} from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { cropsApi, districtsApi, indicatorsApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import { useTheme } from "../../src/theme/theme-context";
import { slugifyEntity } from "../../src/utils/slug";

type Kind = "crop" | "district" | "indicator";
interface Result {
  key: string;
  name: string;
  kind: Kind;
  meta?: string | null;
  href: string;
}

export default function SearchScreen() {
  const { colors, typography } = useTheme();
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");

  const crops = useQuery({ queryKey: ["crops"], queryFn: cropsApi.list });
  const districts = useQuery({ queryKey: ["districts"], queryFn: districtsApi.list });
  const indicators = useQuery({ queryKey: ["indicators"], queryFn: indicatorsApi.list });

  const results = useMemo<Result[]>(() => {
    const out: Result[] = [];
    for (const crop of crops.data ?? []) {
      out.push({
        key: `crop-${crop.crop_code}`,
        name: crop.crop_name,
        kind: "crop",
        meta: crop.category,
        href: `/explore/crop/${crop.crop_code}`,
      });
    }
    for (const district of districts.data ?? []) {
      out.push({
        key: `district-${district.district_code}`,
        name: district.district,
        kind: "district",
        meta: district.province,
        href: `/explore/district/${district.district_code}`,
      });
    }
    for (const indicator of indicators.data?.indicators ?? []) {
      if (!indicator.available) continue;
      out.push({
        key: `indicator-${indicator.id}`,
        name: indicator.label,
        kind: "indicator",
        meta: indicator.category,
        href: `/explore/indicators?id=${indicator.id}`,
      });
    }
    return out;
  }, [crops.data, districts.data, indicators.data]);

  const normalized = slugifyEntity(query);
  const filtered = results.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (!normalized) return true;
    return slugifyEntity(r.name).includes(normalized);
  });

  const loading = crops.isLoading || districts.isLoading || indicators.isLoading;
  const kindLabel: Record<Kind, string> = { crop: t.crop, district: t.district, indicator: t.indicators };

  return (
    <ScreenLayout back>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t.searchPlaceholder} autoFocus />
      <View style={styles.chips}>
        {(["all", "crop", "district", "indicator"] as const).map((value) => (
          <FilterChip
            key={value}
            label={
              value === "all" ? t.allCategories : value === "crop" ? t.crop : value === "district" ? t.district : t.indicators
            }
            selected={kind === value}
            onPress={() => setKind(value)}
          />
        ))}
      </View>

      <SectionHeader title={normalized ? `${filtered.length} results` : t.exploreTitle} />
      {loading ? (
        <>
          <LoadingSkeleton height={60} />
          <LoadingSkeleton height={60} />
        </>
      ) : filtered.length ? (
        filtered.map((result) => (
          <ListRow
            key={result.key}
            title={result.name}
            subtitle={result.meta ?? undefined}
            meta={kindLabel[result.kind]}
            icon={
              result.kind === "crop"
                ? "leaf-outline"
                : result.kind === "district"
                  ? "location-outline"
                  : "analytics-outline"
            }
            onPress={() => router.push(result.href as never)}
          />
        ))
      ) : (
        <EmptyState
          title={t.noResults}
          message={`Nothing matched "${query}". Try a crop, a district or an indicator.`}
          icon="search-outline"
        />
      )}

      {!normalized ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.md, flexDirection: "row" }}>
          <Ionicons name="bulb-outline" size={16} color={colors.amber} />
          <Text style={{ ...typography.micro, flex: 1 }}>
            Try: Maize, Kigali, Ngoma, irrigation, improved seed. Search covers the crop dictionary, the district
            dictionary and the indicator catalogue.
          </Text>
        </View>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
