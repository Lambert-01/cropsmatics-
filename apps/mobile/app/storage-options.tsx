import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import type { FacilityContext } from "../src/types";

export default function StorageOptionsScreen() {
  const t = strings(useAppStore((state) => state.language));
  const [facilities, setFacilities] = useState<FacilityContext[] | null>(null);
  useEffect(() => {
    let active = true;
    api.facilityContext().then((response) => { if (active) setFacilities(response.facilities); })
      .catch(() => { if (active) setFacilities([]); });
    return () => { active = false; };
  }, []);
  return (
    <ScreenLayout back>
      <Text style={typography.h1}>{t.storageOptions}</Text>
      <Text style={typography.caption}>{t.notVerifiedNote}</Text>
      {facilities?.length === 0 ? <Text style={typography.body}>{t.noVerifiedContext}</Text> : null}
      {facilities?.map((facility, index) => (
        <View key={`${facility.district}-${index}`} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
          <Text style={typography.h2}>{facility.district}</Text>
          <Text style={typography.body}>{facility.initiative ?? t.nearbyContext}</Text>
          <Text style={{ ...typography.caption, color: colors.amber }}>{t.capacityNotVerified}</Text>
        </View>
      ))}
    </ScreenLayout>
  );
}
