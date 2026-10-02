import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useState } from "react";

import { HorizontalBarChart, StackedShareBar } from "../../src/components/charts";
import { DataSection, DataWarning } from "../../src/components/data-view";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  EmptyState,
  ErrorState,
  FilterChip,
  InfoRow,
  LoadingSkeleton,
  SectionHeader,
} from "../../src/components/ui";
import { useAllCrops, usePeriods } from "../../src/hooks/queries";
import { strings } from "../../src/i18n";
import { postHarvestApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import { useTheme } from "../../src/theme/theme-context";
import { releaseLabel } from "../../src/utils/coverage";

/**
 * The published post-harvest table is a single national crop-level release with
 * no district dimension and no season filter, so the release label is read back
 * from `/meta/periods` instead of being written into the screen.
 */
export default function PostHarvestScreen() {
  const { colors, typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  const [crop, setCrop] = useState<string | null>(null);

  const crops = useAllCrops();
  const periods = usePeriods();
  const summary = useQuery({
    queryKey: ["postharvest", crop],
    queryFn: () => postHarvestApi.summary({ crop: crop ?? undefined }),
  });
  const storage = useQuery({
    queryKey: ["storage-infrastructure"],
    queryFn: postHarvestApi.storageInfrastructure,
  });

  const row = crop ? summary.data?.crops?.[0] : undefined;
  const release = releaseLabel(summary.data?.provenance?.source_period, periods.data?.periods ?? []);
  // `storageInfrastructure` is typed, so the items and program are read directly.
  const items = storage.data?.items ?? [];
  const program = storage.data?.program ?? null;

  return (
    <ScreenLayout back active="explore">
      <SectionHeader title={t.postHarvestTitle} subtitle={t.postHarvestSubtitle} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        <FilterChip label={t.allCategories} selected={crop === null} onPress={() => setCrop(null)} />
        {(crops.data ?? []).map((item) => (
          <FilterChip
            key={item.crop_code}
            label={item.crop_name}
            selected={crop === item.crop_name}
            onPress={() => setCrop(item.crop_name)}
          />
        ))}
      </ScrollView>

      {summary.isError ? (
        <ErrorState message={t.errorGeneric} onRetry={() => void summary.refetch()} />
      ) : summary.isLoading ? (
        <LoadingSkeleton height={220} />
      ) : row ? (
        <DataSection title={`${row.crop} · ${t.useOfProduction}`} subtitle={release} first>
          <StackedShareBar
            sumOk={row.shares_sum_ok}
            segments={[
              { key: "sold", label: t.sold, value: row.sold_pct, color: colors.primary },
              { key: "stored", label: t.stored, value: row.stored_pct, color: colors.blue },
              { key: "own", label: t.homeConsumption, value: row.own_consumption_pct, color: colors.amber },
              { key: "seed", label: t.seed, value: row.seeds_pct, color: colors.forest },
              { key: "losses", label: t.losses, value: row.post_harvest_losses_pct, color: colors.danger },
            ]}
          />
          <InfoRow
            label={t.losses}
            value={row.post_harvest_losses_pct != null ? `${row.post_harvest_losses_pct.toFixed(2)}%` : t.notPublished}
            note={row.risk_band ?? undefined}
          />
          <DataWarning text={t.postHarvestNoDistrictNote} />
          <Text style={typography.micro}>
            {t.postHarvestLossNote}
          </Text>
        </DataSection>
      ) : (
        <DataSection title={t.useOfProduction} subtitle={release} first>
          <Text style={typography.caption}>{t.postHarvestPickCropNote}</Text>
        </DataSection>
      )}

      {crop === null && summary.data?.crops?.length ? (
        <DataSection title={t.losses} subtitle={t.postHarvestLossesSubtitle}>
          <HorizontalBarChart
            values={summary.data.crops
              .filter((item) => item.post_harvest_losses_pct != null)
              .map((item) => ({ label: item.crop, value: item.post_harvest_losses_pct as number }))
              .sort((a, b) => b.value - a.value)}
            unit="%"
            maxItems={17}
          />
        </DataSection>
      ) : null}

      <DataSection title={t.nationalContext} subtitle={t.postHarvestNationalSubtitle}>
        {storage.isLoading ? (
          <LoadingSkeleton height={140} />
        ) : items.length ? (
          <>
            <DataWarning text={t.postHarvestNationalWarning} />
            {items.slice(0, 6).map((item, index) => (
              <InfoRow
                key={item.infrastructure_type ?? index}
                label={item.infrastructure_type ?? t.notPublished}
                value={item.total_number != null ? String(item.total_number) : t.notPublished}
                note={item.total_capacity_mt != null ? `${item.total_capacity_mt.toLocaleString()} mt capacity` : undefined}
              />
            ))}
          </>
        ) : (
          <EmptyState title={t.noDataAvailable} />
        )}
      </DataSection>

      <DataSection title={t.programCoverage} subtitle={t.postHarvestProgramSubtitle}>
        <Text style={typography.body}>
          {program?.program_districts?.length
            ? t.postHarvestProgramDistricts.replace("{districts}", program.program_districts.join(", "))
            : t.postHarvestProgramNone}
        </Text>
        <DataWarning tone="slate" text={t.postHarvestFacilityNote} />
      </DataSection>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
});
