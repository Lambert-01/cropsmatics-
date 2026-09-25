import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { listHarvests, listRisks } from "../src/database";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography, riskFor } from "../src/theme";
import type { HarvestRegistration, HarvestRisk } from "../src/types";
import { formatQuantity } from "../src/utils/units";

export default function InsightsScreen() {
  const t = strings(useAppStore((state) => state.language));
  const [risks, setRisks] = useState<HarvestRisk[]>([]);
  const [harvests, setHarvests] = useState<HarvestRegistration[]>([]);
  const [dataVersion, setDataVersion] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        setRisks(listRisks(20));
        setHarvests(listHarvests());
      } catch {
        setRisks([]);
        setHarvests([]);
      }
    }, []),
  );

  useEffect(() => {
    let active = true;
    api
      .dataVersion()
      .then((version) => {
        if (!active) return;
        setDataVersion(version.pipeline_version ?? null);
        setWarnings(version.validation?.warnings ?? null);
      })
      .catch(() => {
        if (active) setDataVersion(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const totalKg = harvests.reduce((sum, h) => sum + (h.expectedQuantityKg ?? 0), 0);
  const storageRequests = harvests.filter((h) => h.needsStorageAssistance).length;

  return (
    <ScreenLayout active="insights">
      <Text style={typography.h1}>{t.recommendations}</Text>
      <Text style={typography.caption}>{t.insightsSubtitle}</Text>

      {/* Harvest summary — real local numbers only */}
      <View style={panel}>
        <Text style={typography.h2}>{t.harvestSummary}</Text>
        <Text style={typography.body}>
          {harvests.length} {t.records} · {formatQuantity(totalKg, "kg")}
        </Text>
        {storageRequests > 0 ? (
          <Text style={typography.caption}>
            {t.storageAssistanceRequested}: {storageRequests}
          </Text>
        ) : null}
      </View>

      {/* Latest risk results + recommendations */}
      <View style={panel}>
        <Text style={typography.h2}>{t.recentRecommendations}</Text>
        {risks.length === 0 ? (
          <Text style={typography.body}>{t.noInsightsYet}</Text>
        ) : (
          risks.map((risk) => {
            const band = riskFor(risk.riskBand);
            const harvest = harvests.find((h) => h.clientUuid === risk.harvestClientUuid);
            let actions: string[] = [];
            try {
              const parsed = JSON.parse(risk.actionsJson) as unknown;
              actions = Array.isArray(parsed)
                ? parsed
                    .map((item) =>
                      typeof item === "string"
                        ? item
                        : ((item as { action?: string })?.action ?? ""),
                    )
                    .filter(Boolean)
                : [];
            } catch {
              actions = [];
            }
            return (
              <View key={risk.id} style={riskRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Ionicons name="alert-circle-outline" size={16} color={band.color} />
                  <Text style={{ fontWeight: "700", color: band.color }}>{band.icon} {band.label}</Text>
                  <Text style={{ marginLeft: "auto", color: colors.slate, fontWeight: "700" }}>
                    {Math.round(risk.riskProbability * 100)}%
                  </Text>
                </View>
                <Text style={typography.caption}>
                  {harvest ? `${harvest.crop} · ${harvest.district}` : risk.harvestClientUuid.slice(0, 8)}
                </Text>
                {actions.slice(0, 3).map((action) => (
                  <Text key={action} style={typography.body}>
                    • {action}
                  </Text>
                ))}
                <Text style={typography.caption}>
                  {t.modelVersion}: {risk.modelVersion ?? "—"}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Data period information */}
      <View style={panel}>
        <Text style={typography.h2}>{t.dataPeriodInformation}</Text>
        <Text style={typography.body}>
          {t.appVersion}: pipeline {dataVersion ?? "—"}
        </Text>
        {warnings != null ? (
          <Text style={typography.caption}>
            Published data-quality warnings: {warnings}. They are reported, not hidden.
          </Text>
        ) : (
          <Text style={typography.caption}>{t.offlineBanner}</Text>
        )}
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

const riskRow = {
  borderTopWidth: 1,
  borderTopColor: colors.border,
  paddingTop: spacing.sm,
  gap: 2,
} as const;
