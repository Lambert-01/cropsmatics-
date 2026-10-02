import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Dimensions, Text, View } from "react-native";

import { RwandaMap } from "../../../src/components/RwandaMap";
import { ScreenLayout } from "../../../src/components/ScreenLayout";
import { Badge, Card, ErrorState, InfoRow, LoadingSkeleton, PrimaryButton, SectionHeader } from "../../../src/components/ui";
import { districtsApi, mapsApi } from "../../../src/services/api";
import { strings } from "../../../src/i18n";
import { useAppStore } from "../../../src/store/useAppStore";
import { colors, spacing, typography } from "../../../src/theme";

export default function MapDistrictScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const params = useLocalSearchParams<{ districtCode: string }>();
  const slug = params.districtCode;
  const width = Math.min(Dimensions.get("window").width - spacing.md * 2, 460);

  const profile = useQuery({ queryKey: ["district-profile", slug], queryFn: () => districtsApi.profile(slug) });
  const metrics = useQuery({ queryKey: ["map-metrics", "gap"], queryFn: () => mapsApi.districtMetrics({ metric: "gap" }) });

  const row = metrics.data?.districts.find((d) => d.district_code === slug);

  return (
    <ScreenLayout back active="map">
      <SectionHeader title={profile.data?.district ?? slug} subtitle="Agricultural map context" />
      {profile.isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void profile.refetch()} />
      ) : profile.isLoading ? (
        <LoadingSkeleton height={300} />
      ) : (
        <>
          <Card style={{ alignItems: "center" }}>
            <RwandaMap
              width={width}
              values={row?.district_code ? { [row.district_code]: { value: row.value, color: colors.primary } } : {}}
              selected={slug}
            />
            <Text style={{ ...typography.micro, textAlign: "center" }}>
              {row && row.value !== null
                ? `Productivity gap: ${row.value.toLocaleString()} ${metrics.data?.unit ?? ""} (${metrics.data?.period ?? "—"})`
                : "No verified district value for the selected indicator."}
            </Text>
          </Card>

          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ ...typography.h2, flex: 1 }}>{profile.data?.district}</Text>
              <Badge text={profile.data?.province ?? "—"} />
              <Badge text={profile.data?.period_label ?? "—"} tone="blue" />
            </View>
            <InfoRow label="Crops with data" value={String(profile.data?.n_crops_with_data ?? 0)} />
            <InfoRow label="Largest production crop" value={profile.data?.largest_production_crops[0]?.crop ?? "Not available"} />
            <PrimaryButton label={t.viewDistrictDetails} onPress={() => router.push(("/explore/district/" + slug) as never)} />
          </Card>
        </>
      )}
    </ScreenLayout>
  );
}

