import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DonutChart, HorizontalBarChart } from "../../src/components/charts";
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
import { strings } from "../../src/i18n";
import { cropsApi, postHarvestApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

interface InfraItem {
  infrastructure_type: string;
  existing_number: number | null;
  total_number: number | null;
  total_capacity_mt: number | null;
  period: string | null;
}

export default function PostHarvestScreen() {
  const t = strings(useAppStore((s) => s.language));
  const [crop, setCrop] = useState<string | null>(null);

  const crops = useQuery({ queryKey: ["crops"], queryFn: cropsApi.list });
  const summary = useQuery({
    queryKey: ["postharvest", crop],
    queryFn: () => postHarvestApi.summary({ crop: crop ?? undefined }),
  });
  const storage = useQuery({
    queryKey: ["storage-infrastructure"],
    queryFn: postHarvestApi.storageInfrastructure,
  });

  const row = summary.data?.crops?.[0];
  const items = ((storage.data?.items as InfraItem[] | undefined) ?? []);
  const program = storage.data?.program as { program_districts?: string[]; note?: string } | undefined;

  return (
    <ScreenLayout back active="explore">
      <SectionHeader title={t.postHarvestTitle} subtitle="From harvest to use" />

      <View style={styles.chips}>
        <FilterChip label={t.allCategories} selected={crop === null} onPress={() => setCrop(null)} />
        {(crops.data ?? []).slice(0, 10).map((item) => (
          <FilterChip key={item.crop_code} label={item.crop_name} selected={crop === item.crop_name} onPress={() => setCrop(item.crop_name)} />
        ))}
      </View>

      {summary.isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void summary.refetch()} />
      ) : summary.isLoading ? (
        <LoadingSkeleton height={220} />
      ) : row ? (
        <Card>
          <SectionHeader title={row.crop} subtitle="Use of production" />
          <DonutChart
            slices={[
              { label: t.sold, value: row.sold_pct, color: colors.primary },
              { label: t.stored, value: row.stored_pct, color: colors.blue },
              { label: t.homeConsumption, value: row.own_consumption_pct, color: colors.amber },
              { label: t.seed, value: row.seeds_pct, color: colors.forest },
              { label: t.losses, value: row.post_harvest_losses_pct, color: colors.danger },
            ]}
          />
          <InfoRow label={t.losses} value={row.post_harvest_losses_pct != null ? `${row.post_harvest_losses_pct.toFixed(2)}%` : "Not available"} note={row.risk_band ?? undefined} />
          <Text style={typography.micro}>National crop-level shares; no district breakdown exists for this table.</Text>
          <SourceCard
            sourceLabel={summary.data?.provenance?.source_id ?? undefined}
            period="2025 Season B"
            coverage="national crop-level"
            limitations={summary.data?.provenance?.limitations}
          />
        </Card>
      ) : (
        <EmptyState title={t.noDataAvailable} icon="pie-chart-outline" />
      )}

      {crop === null && summary.data?.crops?.length ? (
        <Card>
          <SectionHeader title="Compare stored share" subtitle="Across crops" />
          <HorizontalBarChart
            values={summary.data.crops
              .filter((c) => c.stored_pct != null)
              .map((c) => ({ label: c.crop, value: c.stored_pct as number }))}
            unit="%"
          />
        </Card>
      ) : null}

      <SectionHeader title={t.nationalContext} />
      {storage.isLoading ? (
        <LoadingSkeleton height={140} />
      ) : items.length ? (
        <Card>
          <Badge text="NATIONAL CONTEXT" tone="amber" />
          {items.slice(0, 6).map((item) => (
            <InfoRow
              key={item.infrastructure_type}
              label={item.infrastructure_type}
              value={item.total_number != null ? String(item.total_number) : "Not available"}
              note={item.total_capacity_mt != null ? `${item.total_capacity_mt.toLocaleString()} mt capacity` : undefined}
            />
          ))}
          <Text style={typography.micro}>
            National totals — not facility-level capacity, and not attached to any district.
          </Text>
        </Card>
      ) : null}

      <Card style={{ backgroundColor: colors.mintSoft }}>
        <Text style={typography.h3}>{t.programCoverage}</Text>
        <Badge text="VERIFIED PROGRAM CONTEXT" tone="mint" />
        <Text style={typography.body}>
          {program?.program_districts?.length
            ? `Program districts: ${program.program_districts.join(", ")}.`
            : "Program districts are not published for this selection."}
        </Text>
        <Text style={typography.micro}>Facility capacities and exact coordinates are not published.</Text>
      </Card>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
