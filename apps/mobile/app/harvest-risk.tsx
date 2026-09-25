import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { latestRiskFor, saveRisk } from "../src/database";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import type { PostHarvestRisk } from "../src/types";
import { formatQuantity } from "../src/utils/units";

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: colors.riskHigh,
  MEDIUM: colors.amber,
  LOW: colors.muted,
};

export default function HarvestRiskScreen() {
  const { harvestClientUuid, crop, district, quantity } = useLocalSearchParams<{
    harvestClientUuid?: string;
    crop?: string;
    district?: string;
    quantity?: string;
  }>();
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));

  const [risk, setRisk] = useState<PostHarvestRisk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [storedFromDevice, setStoredFromDevice] = useState(false);

  const persist = useCallback(
    (result: PostHarvestRisk) => {
      if (!harvestClientUuid) return;
      try {
        saveRisk({
          harvestClientUuid,
          riskProbability: result.probability,
          riskBand: result.band,
          factorsJson: JSON.stringify(result.factors ?? result.contributing_factors),
          actionsJson: JSON.stringify(result.actions ?? result.recommended_actions),
          modelVersion: result.model_version ?? result.provenance?.model_version ?? null,
          calculatedAt: new Date().toISOString(),
          syncStatus: "SYNCED",
        });
      } catch {
        // Persistence is best-effort: the result is still shown.
      }
    },
    [harvestClientUuid],
  );

  useEffect(() => {
    if (!crop) {
      setLoading(false);
      setError(true);
      return;
    }
    let active = true;

    const quantityKg = quantity ? Number(quantity) : null;
    api
      .scorePostHarvestRisk({
        crop,
        expected_quantity_kg: Number.isFinite(quantityKg) ? quantityKg : null,
      })
      .then((result) => {
        if (!active) return;
        setRisk(result);
        persist(result);
      })
      .catch(() => {
        if (!active) return;
        // Offline fallback: show the last stored result rather than nothing.
        if (harvestClientUuid) {
          try {
            const stored = latestRiskFor(harvestClientUuid);
            if (stored) {
              setRisk({
                probability: stored.riskProbability,
                band: stored.riskBand as PostHarvestRisk["band"],
                contributing_factors: JSON.parse(stored.factorsJson) as string[],
                recommended_actions: JSON.parse(stored.actionsJson) as string[],
                capacity_context: "capacity_not_verified",
                model_version: stored.modelVersion ?? null,
              });
              setStoredFromDevice(true);
              return;
            }
          } catch {
            // fall through to the error state
          }
        }
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [crop, quantity, harvestClientUuid, persist]);

  const riskColor =
    risk?.band === "HIGH"
      ? colors.riskHigh
      : risk?.band === "MODERATE"
        ? colors.riskModerate
        : colors.riskLow;
  const riskLabel =
    risk?.band === "HIGH" ? t.riskHigh : risk?.band === "MODERATE" ? t.riskModerate : t.riskLow;

  return (
    <ScreenLayout back>
      <Text style={typography.h1}>{t.riskAnalysis}</Text>

      {/* Submitted harvest summary */}
      <View style={panel}>
        <Text style={typography.h2}>{t.submittedHarvest}</Text>
        <Text style={typography.body}>
          {crop ?? "—"} · {district ?? "—"}
        </Text>
        {quantity ? (
          <Text style={typography.caption}>
            {t.quantity}: {formatQuantity(Number(quantity), "kg")}
          </Text>
        ) : null}
        <Text style={typography.caption}>{t.savedOffline}</Text>
      </View>

      {loading ? <Text style={typography.body}>{t.loadingRisk}</Text> : null}

      {error && !risk ? (
        <View style={panel}>
          <Text style={{ ...typography.h2, color: colors.amber }}>{t.scoreUnavailable}</Text>
          <Text style={typography.body}>{t.riskUnavailable}</Text>
        </View>
      ) : null}

      {risk ? (
        <>
          {storedFromDevice ? (
            <View style={panel}>
              <Text style={typography.caption}>{t.riskUnavailableOffline}</Text>
            </View>
          ) : null}

          {/* Overall risk gauge — score + band, never "AI confidence". */}
          <View style={{ ...panel, alignItems: "center", paddingVertical: spacing.xl }}>
            <Text style={typography.caption}>{risk.score_label ?? t.riskScore}</Text>
            <View
              style={{
                width: 132,
                height: 132,
                borderRadius: 66,
                borderWidth: 12,
                borderColor: riskColor,
                alignItems: "center",
                justifyContent: "center",
                marginTop: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 30, fontWeight: "700", color: riskColor }}>
                {Math.round(risk.probability * 100)}%
              </Text>
            </View>
            <Text style={{ ...typography.h2, color: riskColor, marginTop: spacing.sm }}>
              {riskLabel}
            </Text>
            <Text style={typography.caption}>{t.ruleBasedNote}</Text>
          </View>

          {/* Structured contributing factors */}
          <View style={panel}>
            <Text style={typography.h2}>{t.topFactors}</Text>
            {(risk.factors ?? []).length > 0
              ? (risk.factors ?? []).map((factor) => (
                  <View key={`${factor.factor}-${factor.factor_value}`} style={factorRow}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ fontWeight: "600", color: colors.forest, flex: 1 }}>
                        {factor.factor}
                        {factor.factor_value ? `: ${factor.factor_value}` : ""}
                      </Text>
                      <Text style={{ color: colors.amber, fontWeight: "700" }}>
                        {factor.impact >= 0 ? "+" : ""}
                        {factor.impact.toFixed(2)}
                      </Text>
                    </View>
                    <Text style={typography.caption}>{factor.reason}</Text>
                  </View>
                ))
              : risk.contributing_factors.map((factor) => (
                  <Text key={factor} style={typography.body}>
                    • {factor}
                  </Text>
                ))}
          </View>

          {/* Structured recommended actions */}
          <View style={panel}>
            <Text style={typography.h2}>{t.recommendations}</Text>
            {(risk.actions ?? []).length > 0
              ? (risk.actions ?? []).map((action) => (
                  <View key={action.action} style={factorRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontWeight: "600", color: colors.forest, flex: 1 }}>
                        {action.action}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: PRIORITY_COLORS[action.priority] ?? colors.muted,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "700",
                            color: PRIORITY_COLORS[action.priority] ?? colors.muted,
                          }}
                        >
                          {action.priority}
                        </Text>
                      </View>
                    </View>
                    <Text style={typography.caption}>
                      {t.whyRecommendation} {action.reason}
                    </Text>
                  </View>
                ))
              : risk.recommended_actions.map((action) => (
                  <Text key={action} style={typography.body}>
                    • {action}
                  </Text>
                ))}
          </View>

          {/* Model / rule information + limitations */}
          <View style={panel}>
            <Text style={typography.h2}>{t.modelAndRules}</Text>
            <Text style={typography.caption}>
              {t.modelVersion}: {risk.model_version ?? risk.provenance?.model_version ?? "—"}
            </Text>
            {risk.provenance?.method ? (
              <Text style={typography.caption}>{risk.provenance.method}</Text>
            ) : null}
            {(risk.provenance?.limitations ?? []).map((limitation) => (
              <Text key={limitation} style={typography.caption}>
                • {limitation}
              </Text>
            ))}
            <Text style={typography.caption}>{t.riskNotStored}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/storage-options",
                params: {
                  harvestClientUuid: harvestClientUuid ?? "",
                  crop: crop ?? "",
                  district: district ?? "",
                  quantity: quantity ?? "",
                },
              })
            }
            style={primaryButtonStyle}
          >
            <Ionicons name="business-outline" size={18} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: "700" }}>{t.viewStorageOptions}</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace("/")}
        style={primaryButtonStyle}
      >
        <Ionicons name="checkmark" color={colors.white} size={18} />
        <Text style={{ color: colors.white, fontWeight: "700" }}>{t.done}</Text>
      </Pressable>
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

const factorRow = {
  borderTopWidth: 1,
  borderTopColor: colors.border,
  paddingTop: spacing.sm,
  gap: 2,
} as const;

const primaryButtonStyle = {
  backgroundColor: colors.brandGreen,
  padding: spacing.md,
  borderRadius: radius.md,
  flexDirection: "row" as const,
  justifyContent: "center" as const,
  alignItems: "center" as const,
  gap: spacing.sm,
} as const;
