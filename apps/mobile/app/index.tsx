import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ImageBackground, Pressable, Text, View } from "react-native";

import { MetricCard } from "../src/components/MetricCard";
import { QuickActionCard } from "../src/components/QuickActionCard";
import { ScreenLayout } from "../src/components/ScreenLayout";
import { listHarvests, listPendingOutbox, listRisks } from "../src/database";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { flushOutbox, isOnline } from "../src/sync/queue";
import { colors, radius, riskFor, spacing, typography } from "../src/theme";
import type { FacilityContext, HarvestRegistration, HarvestRisk } from "../src/types";
import { formatQuantity } from "../src/utils/units";

export default function HomeScreen() {
  const router = useRouter();
  const language = useAppStore((state) => state.language);
  const t = strings(language);

  const [harvests, setHarvests] = useState<HarvestRegistration[]>([]);
  const [pending, setPending] = useState(0);
  const [latestRisk, setLatestRisk] = useState<HarvestRisk | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<FacilityContext[] | null>(null);
  const [online, setOnline] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      // Retry pending records when the app opens or returns to the foreground,
      // which is what `t.syncOnOpen` promises the user.
      void (async () => {
        try {
          setOnline(await isOnline());
          await flushOutbox();
        } catch {
          // offline or storage unavailable: local state still loads below
        }
        if (!active) return;
        try {
          setHarvests(listHarvests());
          setPending(listPendingOutbox().length);
          setLatestRisk(listRisks(1)[0] ?? null);
        } catch {
          setHarvests([]);
        }
      })();

      api
        .coverage()
        .then((coverage) => {
          if (!active) return;
          const periods = Object.entries(coverage.coverage?.district_crop_productivity ?? {})
            .filter(([, level]) => level === "district")
            .map(([key]) => key);
          setPeriod(periods.sort().at(-1) ?? null);
        })
        .catch(() => {
          if (active) setPeriod(null);
        });

      api
        .facilityContext()
        .then((response) => {
          if (active) setFacilities(response.facilities);
        })
        .catch(() => {
          if (active) setFacilities([]);
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const totalExpected = harvests.reduce((sum, h) => sum + (h.expectedQuantityKg ?? 0), 0);
  const riskBand = latestRisk ? riskFor(latestRisk.riskBand) : null;

  return (
    <ScreenLayout active="home">
      {!online ? (
        <View style={offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.amber} />
          <Text style={{ ...typography.caption, flex: 1 }}>{t.offlineBanner}</Text>
        </View>
      ) : null}

      <ImageBackground
        source={require("../assets/images/rwanda-farm-hero.png")}
        resizeMode="cover"
        imageStyle={{ borderRadius: radius.md }}
        style={{
          height: 160,
          justifyContent: "flex-end",
          borderRadius: radius.md,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            backgroundColor: colors.forestDeep,
            padding: spacing.md,
            gap: spacing.xs,
            opacity: 0.94,
          }}
        >
          <Text style={{ color: colors.white, fontWeight: "700", fontSize: 20 }}>{t.greeting}</Text>
          <Text style={{ color: colors.white, fontSize: 12 }}>{t.tagline}</Text>
        </View>
      </ImageBackground>

      {/* Current data / season card */}
      <View style={panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons name="calendar-outline" size={17} color={colors.brandGreen} />
          <Text style={typography.h2}>{t.districtDataPeriod}</Text>
        </View>
        <Text style={typography.body}>{period ?? "—"}</Text>
        <Text style={typography.caption}>{t.notVerifiedNote}</Text>
      </View>

      {/* 4 compact KPI cards — all from real local/server data */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <MetricCard
          title={t.expectedHarvest}
          value={totalExpected ? formatQuantity(totalExpected, "kg") : "—"}
          icon="basket-outline"
          note={t.localRecordNote}
        />
        <MetricCard
          title={t.pending}
          value={String(pending)}
          icon="sync-outline"
          accent={pending ? colors.amber : colors.brandGreen}
          note={t.syncOnOpen}
        />
        <MetricCard
          title={t.harvestHistory}
          value={String(harvests.length)}
          icon="document-text-outline"
          note={t.localRecordNote}
        />
        <MetricCard
          title={t.latestRisk}
          value={latestRisk ? `${Math.round(latestRisk.riskProbability * 100)}%` : "—"}
          icon="warning-outline"
          accent={riskBand?.color ?? colors.brandGreen}
          note={latestRisk ? (riskBand?.label ?? "") : t.latestRiskNone}
        />
      </View>

      <Text style={typography.h2}>{t.quickActions}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <QuickActionCard
          label={t.registerHarvest}
          icon="add-circle-outline"
          onPress={() => router.push("/register-harvest")}
        />
        <QuickActionCard
          label={t.storageOptions}
          icon="business-outline"
          color={colors.info}
          onPress={() => router.push("/storage-options")}
        />
        <QuickActionCard
          label={t.harvestHistory}
          icon="time-outline"
          color={colors.forest}
          onPress={() => router.push("/harvests")}
        />
        <QuickActionCard
          label={t.syncStatus}
          icon="sync-outline"
          color={colors.amber}
          onPress={() => router.push("/sync")}
        />
      </View>

      {/* Latest risk result */}
      <View style={panel}>
        <Text style={typography.h2}>{t.riskStatus}</Text>
        {latestRisk ? (
          <>
            <Text style={{ ...typography.metric, color: riskBand?.color ?? colors.forest }}>
              {Math.round(latestRisk.riskProbability * 100)}% · {riskBand?.label}
            </Text>
            <Text style={typography.caption}>
              {t.modelVersion}: {latestRisk.modelVersion ?? "—"}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/insights")}
              style={secondaryButton}
            >
              <Text style={{ color: colors.forest, fontSize: 13 }}>{t.recommendations}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={typography.body}>{t.latestRiskNone}</Text>
        )}
      </View>

      {/* Verified program context — membership only, never a capacity claim */}
      <View style={panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ ...typography.h2, flex: 1 }}>{t.nearbyContext}</Text>
          <Ionicons name="information-circle-outline" size={17} color={colors.brandGreen} />
        </View>
        {facilities?.length ? (
          <>
            {facilities.slice(0, 3).map((facility, index) => (
              <Text key={`${facility.district}-${index}`} style={typography.body}>
                {facility.district} · {t.capacityNotVerified}
              </Text>
            ))}
            <Text style={typography.caption}>{t.notVerifiedNote}</Text>
          </>
        ) : (
          <Text style={typography.caption}>{t.noVerifiedContext}</Text>
        )}
      </View>

      {/* Harvest history */}
      <View style={panel}>
        <Text style={typography.h2}>{t.harvestHistory}</Text>
        {harvests.length ? (
          harvests.slice(0, 3).map((harvest) => (
            <Pressable
              key={harvest.clientUuid}
              onPress={() => router.push("/harvests")}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={typography.body}>
                {harvest.crop} · {harvest.district} · {formatQuantity(harvest.expectedQuantityKg, "kg")}
              </Text>
              <Text style={typography.caption}>{harvest.syncStatus}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={typography.caption}>{t.noRecords}</Text>
        )}
      </View>

      <Text style={typography.caption}>{t.syncOnOpen}</Text>
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

const offlineBanner = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: "#fdf3e3",
} as const;

const secondaryButton = {
  alignSelf: "flex-start" as const,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
} as const;
