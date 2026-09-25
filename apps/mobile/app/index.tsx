import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ImageBackground, Pressable, Text, View } from "react-native";

import { MetricCard } from "../src/components/MetricCard";
import { QuickActionCard } from "../src/components/QuickActionCard";
import { ScreenLayout } from "../src/components/ScreenLayout";
import { listHarvests, listPendingOutbox } from "../src/database";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import type { FacilityContext, HarvestRegistration } from "../src/types";

export default function HomeScreen() {
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));
  const [harvests, setHarvests] = useState<HarvestRegistration[]>([]);
  const [pending, setPending] = useState(0);
  const [period, setPeriod] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<FacilityContext[] | null>(null);

  useFocusEffect(useCallback(() => {
    setHarvests(listHarvests());
    setPending(listPendingOutbox().length);
    let active = true;
    api.coverage().then((coverage) => {
      if (!active) return;
      const periods = Object.entries(coverage.coverage?.district_crop_productivity ?? {})
        .filter(([, level]) => level === "district").map(([key]) => key);
      setPeriod(periods.sort().at(-1) ?? null);
    }).catch(() => { if (active) setPeriod(null); });
    api.facilityContext().then((response) => { if (active) setFacilities(response.facilities); })
      .catch(() => { if (active) setFacilities([]); });
    return () => { active = false; };
  }, []));

  const totalExpected = harvests.reduce((sum, harvest) => sum + (harvest.expectedQuantityKg ?? 0), 0);
  const mainCrop = harvests[0]?.crop ?? "—";
  return <ScreenLayout active="home">
    <ImageBackground source={require("../assets/images/rwanda-farm-hero.png")} resizeMode="cover"
      imageStyle={{ borderRadius: radius.md }} style={{ height: 170, justifyContent: "flex-end", borderRadius: radius.md, overflow: "hidden" }}>
      <View style={{ backgroundColor: colors.forestDeep, padding: spacing.md, gap: spacing.xs, opacity: 0.94 }}>
        <Text style={{ color: colors.white, fontWeight: "700", fontSize: 20 }}>{t.greeting}</Text>
        <Text style={{ color: colors.white, fontSize: 12 }}>{t.tagline}</Text>
      </View>
    </ImageBackground>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      <MetricCard title={t.districtDataPeriod} value={period ?? "—"} icon="calendar-outline" note={t.notVerifiedNote} />
      <MetricCard title={t.mainCrop} value={mainCrop} icon="leaf-outline" note={t.localRecordNote} />
      <MetricCard title={t.farmSummary} value={String(harvests.length)} icon="document-text-outline" note={`${pending} ${t.pending}`} />
      <MetricCard title={t.expectedHarvest} value={totalExpected ? `${totalExpected.toLocaleString()} kg` : "—"} icon="basket-outline" note={t.localRecordNote} />
    </View>
    <Text style={typography.h2}>{t.quickActions}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      <QuickActionCard label={t.registerHarvest} icon="add-circle-outline" onPress={() => router.push("/register-harvest")} />
      <QuickActionCard label={t.storageOptions} icon="business-outline" color={colors.info} onPress={() => router.push("/storage-options")} />
      <QuickActionCard label={t.harvestHistory} icon="time-outline" color={colors.forest} onPress={() => router.push("/harvests")} />
      <QuickActionCard label={t.syncStatus} icon="sync-outline" color={colors.amber} onPress={() => router.push("/sync")} />
    </View>
    <View style={panel}><Text style={typography.h2}>{t.riskStatus}</Text><Text style={typography.body}>{t.riskNotStored}</Text></View>
    <View style={panel}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={typography.h2}>{t.nearbyContext}</Text><Ionicons name="location-outline" size={18} color={colors.brandGreen} />
      </View>
      {facilities?.length ? facilities.slice(0, 3).map((facility, index) =>
        <Text key={`${facility.district}-${index}`} style={typography.body}>{facility.district} · {t.capacityNotVerified}</Text>) :
        <Text style={typography.caption}>{t.noVerifiedContext}</Text>}
      <Text style={typography.caption}>{t.notVerifiedNote}</Text>
    </View>
    <View style={panel}><Text style={typography.h2}>{t.recentAlerts}</Text><Text style={typography.caption}>{t.noAlerts}</Text></View>
    <View style={panel}>
      <Text style={typography.h2}>{t.harvestHistory}</Text>
      {harvests.length ? harvests.slice(0, 3).map((harvest) =>
        <Pressable key={harvest.clientUuid} onPress={() => router.push("/harvests")}
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm }}>
          <Text style={typography.body}>{harvest.crop} · {harvest.district} · {harvest.expectedQuantityKg ?? "—"} kg</Text>
          <Text style={typography.caption}>{harvest.syncStatus}</Text>
        </Pressable>) : <Text style={typography.caption}>{t.noRecords}</Text>}
    </View>
    <Text style={typography.caption}>{t.syncOnOpen}</Text>
  </ScreenLayout>;
}

const panel = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm } as const;
