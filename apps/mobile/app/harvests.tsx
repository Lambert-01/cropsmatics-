import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { listHarvests } from "../src/database";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import type { HarvestRegistration } from "../src/types";

export default function HarvestsScreen() {
  const t = strings(useAppStore((state) => state.language));
  const [harvests, setHarvests] = useState<HarvestRegistration[]>([]);
  useFocusEffect(useCallback(() => { setHarvests(listHarvests()); }, []));
  return <ScreenLayout active="harvests"><Text style={typography.h1}>{t.harvestHistory}</Text>
    {harvests.length === 0 ? <Text style={typography.body}>{t.noRecords}</Text> : null}
    {harvests.map((harvest) => <View key={harvest.clientUuid} style={{ padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: spacing.xs }}>
      <Text style={typography.h2}>{harvest.crop}</Text><Text style={typography.body}>{harvest.district} · {harvest.expectedHarvestDate ?? "—"}</Text>
      <Text style={typography.caption}>{harvest.expectedQuantityKg ?? "—"} kg · {harvest.syncStatus}</Text>
    </View>)}
  </ScreenLayout>;
}
