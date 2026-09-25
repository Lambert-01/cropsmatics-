import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { DataBadge } from "../src/components/DataBadge";
import { ScreenLayout } from "../src/components/ScreenLayout";
import { getHarvest } from "../src/database";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import type { FacilityContext, FacilityContextResponse, StorageInfrastructure } from "../src/types";
import { formatQuantity } from "../src/utils/units";

export default function StorageOptionsScreen() {
  const { harvestClientUuid, crop, district, quantity } = useLocalSearchParams<{
    harvestClientUuid?: string;
    crop?: string;
    district?: string;
    quantity?: string;
  }>();
  const t = strings(useAppStore((state) => state.language));

  const [infrastructure, setInfrastructure] = useState<StorageInfrastructure | null>(null);
  const [facilityContext, setFacilityContext] = useState<FacilityContext[] | null>(null);
  const [program, setProgram] = useState<FacilityContextResponse | null>(null);
  const [error, setError] = useState(false);

  // Active harvest comes from SQLite, so the screen still shows its summary
  // when the device is offline.
  const [activeHarvest, setActiveHarvest] = useState<{
    crop: string | null;
    district: string | null;
    quantityKg: number | null;
    needsStorage: boolean;
  } | null>(null);

  useEffect(() => {
    if (harvestClientUuid) {
      try {
        const record = getHarvest(harvestClientUuid);
        if (record) {
          setActiveHarvest({
            crop: record.crop,
            district: record.district,
            quantityKg: record.expectedQuantityKg ?? null,
            needsStorage: Boolean(record.needsStorageAssistance),
          });
        }
      } catch {
        // no local record: fall back to the navigation params below
      }
    }
  }, [harvestClientUuid]);

  const harvestCrop = activeHarvest?.crop ?? crop ?? null;
  const harvestDistrict = activeHarvest?.district ?? district ?? null;
  const harvestQuantityKg =
    activeHarvest?.quantityKg ?? (quantity && Number.isFinite(Number(quantity)) ? Number(quantity) : null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.storageInfrastructure(),
      api.facilityContext(harvestDistrict ?? undefined),
      api.programContext(harvestDistrict ?? undefined),
    ])
      .then(([infra, facilities, programContext]) => {
        if (!active) return;
        setInfrastructure(infra);
        setFacilityContext(facilities.facilities);
        setProgram(programContext);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [harvestDistrict]);

  return (
    <ScreenLayout back>
      <Text style={typography.h1}>{t.storageAndMarketOptions}</Text>

      {/* Active harvest */}
      <View style={panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={typography.h2}>{t.activeHarvest}</Text>
          {activeHarvest?.needsStorage ? (
            <View style={badge}>
              <Text style={badgeText}>{t.storageAssistanceRequested}</Text>
            </View>
          ) : null}
        </View>
        {harvestCrop || harvestDistrict ? (
          <>
            <Text style={typography.body}>
              {harvestCrop ?? "—"} · {harvestDistrict ?? "—"}
            </Text>
            {harvestQuantityKg != null ? (
              <Text style={typography.caption}>
                {t.quantity}: {formatQuantity(harvestQuantityKg, "kg")}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={typography.caption}>{t.noActiveHarvest}</Text>
        )}
      </View>

      {/* District / program context */}
      <View style={panel}>
        <Text style={typography.h2}>{t.districtContext}</Text>
        {program ? (
          <>
            <DataBadge kind="verified_program" />
            <Text style={typography.body}>
              {program.district_in_program === true
                ? `${harvestDistrict} is part of the verified cold-chain program.`
                : program.district_in_program === false
                  ? `${harvestDistrict} is not among the named program districts.`
                  : t.notVerifiedNote}
            </Text>
            <Text style={typography.caption}>
              {t.programDistricts}: {program.program_districts.join(", ") || "—"}
            </Text>
          </>
        ) : (
          <Text style={typography.caption}>{error ? t.noVerifiedContext : "…"}</Text>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          <DataBadge kind="facility_unavailable" />
          <DataBadge kind="not_verified" />
        </View>
        <Text style={typography.caption}>{t.capacityNotVerified}</Text>
        <Text style={typography.caption}>{t.exactLocationNotPublished}</Text>
        <Text style={typography.caption}>{t.notVerifiedNote}</Text>
      </View>

      {/* Program district cards */}
      {facilityContext && facilityContext.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={typography.h2}>{t.programDistrictCards}</Text>
          {facilityContext.map((facility, index) => (
            <View key={`${facility.district}-${index}`} style={panel}>
              <Text style={typography.h2}>{facility.district}</Text>
              <Text style={typography.body}>{facility.initiative ?? t.nearbyContext}</Text>
              <Text style={{ ...typography.caption, color: colors.amber }}>
                {t.capacityNotVerified}
              </Text>
              <Text style={typography.caption}>{t.exactLocationNotPublished}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* National infrastructure — national totals, never district capacity */}
      <View style={panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ ...typography.h2, flex: 1 }}>{t.nationalInfrastructure}</Text>
        </View>
        <DataBadge kind="official_national" />
        <Text style={{ ...typography.caption, fontWeight: "700", color: colors.forest }}>
          {t.nationalTotals}
        </Text>

        {infrastructure?.totals ? (
          <>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Tile
                label={t.nationalTotals.split("—")[0].trim()}
                value={String(infrastructure.totals.total_number ?? "—")}
                note="facilities"
              />
              <Tile
                label="Total capacity"
                value={String(infrastructure.totals.total_capacity_mt ?? "—")}
                note="metric tonnes"
              />
            </View>
            <Text style={typography.caption}>
              New in {infrastructure.totals.period ?? "period"}:{" "}
              {infrastructure.totals.new_number ?? "—"} facilities ·{" "}
              {infrastructure.totals.new_capacity_mt ?? "—"} mt
            </Text>
          </>
        ) : (
          <Text style={typography.caption}>{error ? t.noVerifiedContext : "…"}</Text>
        )}

        {(infrastructure?.items ?? []).map((item) => (
          <View key={item.infrastructure_type} style={rowBetween}>
            <Text style={{ ...typography.body, flex: 1 }}>{item.infrastructure_type}</Text>
            <Text style={typography.caption}>
              {item.total_number ?? "—"} · {item.total_capacity_mt ?? "—"} mt
            </Text>
          </View>
        ))}
      </View>

      {/* Cold-chain program indicators */}
      {infrastructure?.program?.indicators?.length ? (
        <View style={panel}>
          <Text style={typography.h2}>{t.coldChainProgram}</Text>
          <DataBadge kind="verified_program" />
          {infrastructure.program.indicators.map((indicator) => (
            <View key={indicator.indicator} style={rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.body, flex: 1 }}>{indicator.indicator}</Text>
                {indicator.notes ? (
                  <Text style={typography.caption}>{indicator.notes}</Text>
                ) : null}
              </View>
              <Text style={{ color: colors.forest, fontWeight: "700" }}>
                {indicator.value ?? "—"} {indicator.unit ?? ""}
              </Text>
            </View>
          ))}
          <Text style={typography.caption}>{infrastructure.program.note ?? t.notVerifiedNote}</Text>
        </View>
      ) : null}

      {/* Scenario optimization */}
      <View style={panel}>
        <Text style={typography.h2}>{t.storageOptimizationScenario}</Text>
        <DataBadge kind="scenario_input" />
        <Text style={typography.caption}>
          Scenario inputs are user-supplied and are never merged into official data. Facility
          capacity is excluded until it is verified, so no allocation is presented as official.
        </Text>
      </View>

      {/* Market intelligence */}
      <View style={panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons name="trending-up-outline" size={18} color={colors.muted} />
          <Text style={typography.h2}>{t.marketIntelligence}</Text>
        </View>
        <Text style={typography.body}>{t.verifiedSourceNotConnected}</Text>
      </View>
    </ScreenLayout>
  );
}

const panel = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  padding: spacing.md,
  gap: spacing.sm,
} as const;

const rowBetween = {
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  alignItems: "center" as const,
  gap: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.border,
  paddingTop: spacing.sm,
} as const;

const badge = {
  paddingHorizontal: spacing.sm,
  paddingVertical: 2,
  borderRadius: radius.pill,
  backgroundColor: colors.tint,
} as const;

const badgeText = { fontSize: 10, fontWeight: "700" as const, color: colors.brandGreen };

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.sm,
      }}
    >
      <Text style={typography.caption}>{label}</Text>
      <Text style={{ ...typography.metric, fontSize: 18 }}>{value}</Text>
      <Text style={typography.caption}>{note}</Text>
    </View>
  );
}
