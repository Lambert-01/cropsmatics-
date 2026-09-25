import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { listHarvests, listPendingOutbox } from "../src/database";
import { SUPPORTED_LANGUAGES, strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import type { FacilityContext, HarvestRegistration } from "../src/types";

export default function HomeScreen() {
  const router = useRouter();
  const { language, setLanguage } = useAppStore();
  const t = strings(language);

  const [harvests, setHarvests] = useState<HarvestRegistration[]>([]);
  const [pending, setPending] = useState(0);
  const [period, setPeriod] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<FacilityContext[] | null>(null);

  const refresh = useCallback(() => {
    setHarvests(listHarvests());
    setPending(listPendingOutbox().length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Published period + program districts come from the API. Offline, we show an
  // honest "unavailable" state instead of inventing values.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      api
        .coverage()
        .then((cov) => {
          if (!active) return;
          const keys = Object.keys(cov.coverage?.district_crop_productivity ?? {});
          setPeriod(keys.sort().at(-1) ?? null);
        })
        .catch(() => active && setPeriod(null));
      api
        .facilityContext()
        .then((res) => active && setFacilities(res.facilities))
        .catch(() => active && setFacilities(null));
      return () => {
        active = false;
      };
    }, []),
  );

  const totalExpected = harvests.reduce((sum, h) => sum + (h.expectedQuantityKg ?? 0), 0);
  const mainCrop = harvests[0]?.crop ?? null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
    >
      {/* Greeting */}
      <View style={{ gap: spacing.xs }}>
        <Text style={typography.h1}>
          {t.greeting} · {t.appName.replace(" Rwanda", "")}
        </Text>
        <Text style={typography.body}>{t.tagline}</Text>
      </View>

      {/* Language */}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {SUPPORTED_LANGUAGES.map((l) => (
          <Pressable
            key={l.code}
            onPress={() => setLanguage(l.code)}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: language === l.code ? colors.brandGreen : colors.border,
              backgroundColor: language === l.code ? colors.tint : colors.surface,
            }}
          >
            <Text style={{ color: colors.forest, fontSize: 13 }}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Season + crop + local summary */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Card title={t.currentSeason} value={period ?? "—"} note={t.notVerifiedNote} />
        <Card title={t.mainCrop} value={mainCrop ?? "—"} note={mainCrop ? "" : t.noRecords} />
        <Card
          title={t.farmSummary}
          value={`${harvests.length}`}
          note={`${t.records} · ${pending} ${t.pending}`}
        />
        <Card
          title={t.expectedHarvest}
          value={totalExpected > 0 ? `${totalExpected.toLocaleString()} kg` : "—"}
          note={t.farmSummary}
        />
      </View>

      {/* Risk status */}
      <Section title={t.riskStatus}>
        <Text style={typography.body}>
          {harvests.length === 0
            ? t.noRecords
            : `${harvests[0].crop} · ${harvests[0].district} · ${
                harvests[0].syncStatus === "SYNCED" ? "synced" : t.pending
              }`}
        </Text>
        <Pressable
          onPress={() => router.push("/register-harvest")}
          style={buttonStyle(true)}
          accessibilityRole="button"
        >
          <Text style={buttonTextStyle(true)}>{t.registerHarvest}</Text>
        </Pressable>
      </Section>

      {/* Nearby verified context */}
      <Section title={t.nearbyContext}>
        {facilities && facilities.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            {facilities.map((f) => (
              <View
                key={`${f.district}-${f.initiative ?? ""}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                }}
              >
                <Text style={typography.body}>{f.district}</Text>
                <Text style={{ fontSize: 11, color: colors.amber, fontWeight: "600" }}>
                  {t.capacityNotVerified}
                </Text>
              </View>
            ))}
            <Text style={typography.caption}>{t.notVerifiedNote}</Text>
          </View>
        ) : (
          <Text style={typography.caption}>
            {t.nearbyContext}: {t.capacityNotVerified}
          </Text>
        )}
      </Section>

      {/* Quick actions */}
      <Section title={t.quickActions}>
        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => router.push("/register-harvest")}
            style={buttonStyle(true)}
            accessibilityRole="button"
          >
            <Text style={buttonTextStyle(true)}>{t.registerHarvest}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/sync")}
            style={buttonStyle(false)}
            accessibilityRole="button"
          >
            <Text style={buttonTextStyle(false)}>
              {t.syncStatus}
              {pending > 0 ? ` (${pending})` : ""}
            </Text>
          </Pressable>
        </View>
      </Section>

      {/* Alerts */}
      <Section title={t.recentAlerts}>
        <Text style={typography.caption}>{t.noAlerts}</Text>
      </Section>

      {/* Harvest history */}
      <Section title={t.harvestHistory}>
        {harvests.length === 0 ? (
          <Text style={typography.caption}>{t.noRecords}</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {harvests.slice(0, 5).map((h) => (
              <View
                key={h.clientUuid}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  backgroundColor: colors.surface,
                }}
              >
                <View>
                  <Text style={{ fontWeight: "600", color: colors.forest }}>{h.crop}</Text>
                  <Text style={typography.caption}>{h.district}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: colors.forest }}>{h.expectedQuantityKg ?? "—"} kg</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{h.syncStatus}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Text style={typography.caption}>
        Works offline. Records sync automatically when you are back online.
      </Text>
    </ScrollView>
  );
}

function Card({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.xs,
        ...shadow.card,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase" }}>
        {title}
      </Text>
      <Text style={typography.metric}>{value}</Text>
      {note ? <Text style={typography.caption}>{note}</Text> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.sm,
        ...shadow.card,
      }}
    >
      <Text style={typography.h2}>{title}</Text>
      {children}
    </View>
  );
}

function buttonStyle(primary: boolean) {
  return {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: primary ? colors.brandGreen : colors.surface,
    borderWidth: primary ? 0 : 1,
    borderColor: colors.border,
  } as const;
}

function buttonTextStyle(primary: boolean) {
  return {
    textAlign: "center" as const,
    fontWeight: "600" as const,
    color: primary ? colors.white : colors.forest,
  };
}
