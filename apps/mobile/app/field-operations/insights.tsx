import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { LoadingSkeleton, SectionHeader } from "../../src/components/ui";
import { listHarvests, listRisks } from "../../src/database";
import { useNationalInsights } from "../../src/hooks/useNationalInsights";
import { strings } from "../../src/i18n";
import { api } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { radius, spacing, riskFor } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useTheme, useThemedStyles } from "../../src/theme/theme-context";
import type { HarvestRegistration, HarvestRisk } from "../../src/types";
import { fillTemplate } from "../../src/utils/templates";
import { formatQuantity } from "../../src/utils/units";

/** One derived national or local insight. Text is assembled from real values. */
function InsightPanel({
  icon,
  title,
  detail,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
}) {
  const { colors, typography } = useTheme();
  const panel = useThemedStyles(makePanel);
  return (
    <View style={panel}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text style={typography.h3}>{title}</Text>
      </View>
      <Text style={typography.body}>{detail}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const { colors, typography } = useTheme();
  const panel = useThemedStyles(makePanel);
  const riskRow = useThemedStyles(makeRiskRow);
  const t = strings(useAppStore((state) => state.language));
  const [risks, setRisks] = useState<HarvestRisk[]>([]);
  const [harvests, setHarvests] = useState<HarvestRegistration[]>([]);
  const [dataVersion, setDataVersion] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<number | null>(null);

  // Shared with the Home "latest insight" so the two can never disagree.
  const { insights, isLoading: nationalLoading } = useNationalInsights();

  // ---- local device records (preserved) -------------------------------------
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

  const totalKg = harvests.reduce((sum, harvest) => sum + (harvest.expectedQuantityKg ?? 0), 0);
  const storageRequests = harvests.filter((harvest) => harvest.needsStorageAssistance).length;

  return (
    <ScreenLayout active="insights">
      <SectionHeader title={t.insightsTitle} subtitle={t.insightsFeedSubtitle} />

      {/* ---- National feed ------------------------------------------------- */}
      {nationalLoading ? (
        <LoadingSkeleton height={120} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {insights.map((insight) => (
            <InsightPanel
              key={insight.id}
              icon={insight.icon}
              title={insight.title}
              detail={insight.detail}
            />
          ))}
        </View>
      )}

      {/* ---- Local harvest summary ----------------------------------------- */}
      <InsightPanel
        icon="leaf-outline"
        title={t.harvestSummary}
        detail={
          harvests.length
            ? fillTemplate(t.insightLocalSummary, {
                count: harvests.length,
                quantity: formatQuantity(totalKg, "kg"),
              })
            : t.insightNoLocal
        }
      />
      {storageRequests > 0 ? (
        <Text style={typography.caption}>
          {t.storageAssistanceRequested}: {storageRequests}
        </Text>
      ) : null}

      {/* ---- Local risk results + recommendations (preserved) -------------- */}
      <View style={panel}>
        <Text style={typography.h2}>{t.recentRecommendations}</Text>
        {risks.length === 0 ? (
          <Text style={typography.body}>{t.noInsightsYet}</Text>
        ) : (
          risks.map((risk) => {
            const band = riskFor(risk.riskBand);
            const harvest = harvests.find((item) => item.clientUuid === risk.harvestClientUuid);
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
                  <Text style={{ fontWeight: "700", color: band.color }}>
                    {band.icon} {band.label}
                  </Text>
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

      {/* ---- Data period information --------------------------------------- */}
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

const makePanel = (colors: Palette) =>
  ({
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  }) as const;

const makeRiskRow = (colors: Palette) =>
  ({
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  }) as const;
