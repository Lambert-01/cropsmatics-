import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import type { PostHarvestRisk } from "../src/types";

export default function HarvestRiskScreen() {
  const { crop, district, quantity } = useLocalSearchParams<{ crop?: string; district?: string; quantity?: string }>();
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));
  const [risk, setRisk] = useState<PostHarvestRisk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!crop) { setLoading(false); setError(true); return; }
    let active = true;
    api.scorePostHarvestRisk({ crop, expected_quantity_kg: quantity ? Number(quantity) : null })
      .then((result) => { if (active) setRisk(result); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [crop, quantity]);

  const riskColor = risk?.band === "HIGH" ? colors.riskHigh : risk?.band === "MODERATE" ? colors.riskModerate : colors.riskLow;
  const riskLabel = risk?.band === "HIGH" ? t.riskHigh : risk?.band === "MODERATE" ? t.riskModerate : t.riskLow;
  return (
    <ScreenLayout back>
      <Text style={typography.h1}>{t.riskAnalysis}</Text>
      <Text style={typography.caption}>{t.savedOffline} {crop} · {district}</Text>
      {loading ? <Text style={typography.body}>{t.loadingRisk}</Text> : null}
      {error ? <View style={panel}><Text style={typography.body}>{t.riskUnavailable}</Text><Text style={typography.caption}>{t.riskNotStored}</Text></View> : null}
      {risk ? (
        <>
          <View style={{ ...panel, alignItems: "center", paddingVertical: spacing.xl }}>
            <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 12, borderColor: riskColor, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 31, fontWeight: "700", color: riskColor }}>{Math.round(risk.probability * 100)}%</Text>
            </View>
            <Text style={{ ...typography.h2, color: riskColor }}>{riskLabel}</Text>
          </View>
          <View style={panel}>
            <Text style={typography.h2}>{t.topFactors}</Text>
            {risk.contributing_factors.map((factor) => <Text key={factor} style={typography.body}>• {factor}</Text>)}
          </View>
          <View style={panel}>
            <Text style={typography.h2}>{t.recommendations}</Text>
            {risk.recommended_actions.map((action) => <Text key={action} style={typography.body}>• {action}</Text>)}
          </View>
          <View style={panel}>
            <Text style={typography.h2}>{t.dataLimitations}</Text>
            {(risk.provenance?.limitations ?? []).map((limitation) => <Text key={limitation} style={typography.caption}>• {limitation}</Text>)}
            <Text style={typography.caption}>{t.riskNotStored}</Text>
          </View>
        </>
      ) : null}
      <Pressable onPress={() => router.replace("/")} style={{ backgroundColor: colors.brandGreen, padding: spacing.md, borderRadius: radius.md, flexDirection: "row", justifyContent: "center", gap: spacing.sm }}>
        <Ionicons name="checkmark" color={colors.white} size={18} /><Text style={{ color: colors.white, fontWeight: "700" }}>{t.done}</Text>
      </Pressable>
    </ScreenLayout>
  );
}

const panel = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm } as const;
