import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { getFarm, listHarvests, listRisks } from "../src/database";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography, riskFor } from "../src/theme";
import type { HarvestRegistration, HarvestRisk } from "../src/types";
import { formatQuantity } from "../src/utils/units";

interface Card {
  harvest: HarvestRegistration;
  farmName: string | null;
  risk: HarvestRisk | null;
}

export default function HarvestsScreen() {
  const t = strings(useAppStore((state) => state.language));
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);

  useFocusEffect(
    useCallback(() => {
      try {
        const risks = listRisks(200);
        setCards(
          listHarvests().map((harvest) => {
            const farm = harvest.farmClientUuid ? getFarm(harvest.farmClientUuid) : null;
            const risk =
              risks.find((r) => r.harvestClientUuid === harvest.clientUuid) ?? null;
            return { harvest, farmName: farm?.name ?? null, risk };
          }),
        );
      } catch {
        setCards([]);
      }
    }, []),
  );

  return (
    <ScreenLayout active="harvests">
      <Text style={typography.h1}>{t.harvestHistory}</Text>
      {cards.length === 0 ? <Text style={typography.body}>{t.noRecords}</Text> : null}

      {cards.map(({ harvest, farmName, risk }) => {
        const band = risk ? riskFor(risk.riskBand) : null;
        return (
          <Pressable
            key={harvest.clientUuid}
            accessibilityRole="button"
            accessibilityLabel={`${harvest.crop} ${harvest.district}`}
            onPress={() =>
              router.push({
                pathname: "/harvest-risk",
                params: {
                  harvestClientUuid: harvest.clientUuid,
                  crop: harvest.crop,
                  district: harvest.district,
                  quantity: harvest.expectedQuantityKg != null ? String(harvest.expectedQuantityKg) : "",
                },
              })
            }
            style={card}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ ...typography.h2, flex: 1 }}>{harvest.crop}</Text>
              {band ? (
                <View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: band.color,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "700", color: band.color }}>
                    {band.icon} {band.label}
                  </Text>
                </View>
              ) : (
                <Text style={typography.caption}>{t.noRiskBandYet}</Text>
              )}
            </View>

            <Text style={typography.body}>
              {farmName ? `${farmName} · ` : ""}
              {harvest.district}
            </Text>
            <Text style={typography.caption}>
              {t.quantity}: {formatQuantity(harvest.expectedQuantityKg, "kg")}
            </Text>
            <Text style={typography.caption}>
              {t.dateRange}: {harvest.harvestStartDate ?? harvest.expectedHarvestDate ?? "—"}
              {harvest.harvestEndDate ? ` → ${harvest.harvestEndDate}` : ""}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={typography.caption}>{harvest.syncStatus}</Text>
              {harvest.needsStorageAssistance ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="business-outline" size={12} color={colors.info} />
                  <Text style={{ ...typography.caption, color: colors.info }}>
                    {t.storageAssistanceRequested}
                  </Text>
                </View>
              ) : null}
              <Text style={{ ...typography.caption, marginLeft: "auto" }}>{t.tapForDetails}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScreenLayout>
  );
}

const card = {
  padding: spacing.md,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  gap: spacing.xs,
} as const;
