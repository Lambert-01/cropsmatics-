import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { BottomNav } from "../../src/components/BottomNav";
import { RwandaMap } from "../../src/components/RwandaMap";
import {
  Badge,
  Card,
  ErrorState,
  FilterChip,
  InfoRow,
  LoadingSkeleton,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  SourceCard,
} from "../../src/components/ui";
import type { MapMetric } from "../../src/services/api/maps";
import { mapsApi } from "../../src/services/api";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

// Five-class sequential palette (light -> dark). Colour is never the only
// encoding: the legend prints the numeric band next to each swatch.
const BANDS = ["#DDF5EB", "#A7E3C9", "#5FC4A0", "#1E9A73", "#056A4A"];

const METRICS: { id: MapMetric; label: string }[] = [
  { id: "gap", label: "Productivity gap" },
  { id: "input_adoption", label: "Input adoption" },
  { id: "irrigation", label: "Irrigation" },
  { id: "erosion", label: "Erosion protection" },
];

export default function MapsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const [metric, setMetric] = useState<MapMetric>("gap");
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null);

  const width = Math.min(Dimensions.get("window").width - spacing.md * 2, 460);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["map-metrics", metric],
    queryFn: () => mapsApi.districtMetrics({ metric }),
  });

  const { values, legend } = useMemo(() => {
    const rows = (data?.districts ?? []).filter((r) => r.value !== null);
    const sorted = [...rows].sort((a, b) => (a.value as number) - (b.value as number));
    const out: Record<string, { value: number | null; color: string }> = {};
    const cuts: number[] = [];
    for (let i = 1; i < BANDS.length; i += 1) {
      const idx = Math.floor((i / BANDS.length) * (sorted.length - 1));
      cuts.push(sorted[idx]?.value ?? 0);
    }
    for (const row of data?.districts ?? []) {
      if (!row.district_code) continue;
      if (row.value === null) {
        out[row.district_code] = { value: null, color: colors.slate300 };
        continue;
      }
      let band = 0;
      for (const cut of cuts) if ((row.value as number) > cut) band += 1;
      out[row.district_code] = { value: row.value, color: BANDS[Math.min(band, BANDS.length - 1)] };
    }
    return { values: out, legend: cuts };
  }, [data]);

  const hasDistrictData = (data?.districts ?? []).some((r) => r.value !== null);
  const selectedRow = data?.districts.find((r) => r.district_code === selected?.code) ?? null;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <SectionHeader title={t.mapsTitle} subtitle={t.mapsSubtitle} />

        <View style={styles.chips}>
          {METRICS.map((item) => (
            <FilterChip key={item.id} label={item.label} selected={metric === item.id} onPress={() => setMetric(item.id)} />
          ))}
        </View>

        {isError ? (
          <ErrorState message={t.errorGeneric} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingSkeleton height={360} />
        ) : !hasDistrictData ? (
          <Card>
            <Text style={typography.h2}>{t.nationalDataOnly}</Text>
            <Text style={typography.caption}>
              {data?.message ??
                "District-level data are not available for this selection. A map is only coloured where a verified district value exists."}
            </Text>
            {data?.available_period ? (
              <Text style={typography.micro}>
                Latest district release: {data.available_period}
              </Text>
            ) : null}
            <SecondaryButton label={t.viewDistrictDetails} onPress={() => router.push("/explore/indicators")} />
          </Card>
        ) : (
          <>
            <Card style={{ alignItems: "center" }}>
              <RwandaMap
                width={width}
                values={values}
                selected={selected?.code ?? null}
                onSelect={(code, name) => setSelected({ code, name })}
              />
              {/* Legend: swatch + numeric band, never colour alone. */}
              <View style={styles.legend}>
                {legend.map((cut, index) => (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.swatch, { backgroundColor: BANDS[index] }]} />
                    <Text style={styles.legendText}>
                      {index === 0 ? "≤" : ">"} {Math.round(cut)}
                    </Text>
                  </View>
                ))}
                <View style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: colors.slate300 }]} />
                  <Text style={styles.legendText}>No data</Text>
                </View>
              </View>
              <Text style={typography.micro}>
                {data?.metric_label} · {data?.unit ?? ""} · {data?.period_code ?? data?.period ?? "—"}. Tap a
                district for its value.
              </Text>
              {data?.reference_period ? (
                <Text style={typography.micro}>
                  Reference period: {data.reference_period} (readiness and cost components).
                </Text>
              ) : null}
            </Card>

            {selectedRow ? (
              <Card style={{ backgroundColor: colors.mintSoft }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ ...typography.h2, flex: 1 }}>{selectedRow.district}</Text>
                  <Badge text={selectedRow.province ?? "—"} />
                </View>
                <InfoRow
                  label={data?.metric_label ?? ""}
                  value={selectedRow.value === null ? "Not available" : `${selectedRow.value.toLocaleString()} ${data?.unit ?? ""}`}
                  note={data?.period ?? undefined}
                />
                {selectedRow.details?.priority_band ? (
                  <InfoRow label="Priority band" value={selectedRow.details.priority_band} />
                ) : null}
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      label={t.viewDistrictDetails}
                      onPress={() => router.push(("/explore/district/" + selectedRow.district_code) as never)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton label={t.compare} onPress={() => router.push("/explore/compare")} />
                  </View>
                </View>
              </Card>
            ) : (
              <Text style={{ ...typography.caption, textAlign: "center" }}>{t.tapDistrictHint}</Text>
            )}

            <SourceCard
              sourceLabel={data?.source_id ?? data?.provenance?.source_id ?? undefined}
              period={data?.period_code ?? data?.period ?? undefined}
              coverage="district"
              limitations={data?.provenance?.limitations}
            />
          </>
        )}
      </ScrollView>
      <BottomNav active="maps" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: colors.border },
  legendText: { fontSize: 11, color: colors.slate500 },
});
