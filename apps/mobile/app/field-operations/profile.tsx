import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { listFarms, listHarvests, listPendingOutbox } from "../src/database";
import { SUPPORTED_LANGUAGES, strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import type { LocalFarm } from "../src/types";

export default function ProfileScreen() {
  const router = useRouter();
  const { language, setLanguage } = useAppStore();
  const t = strings(language);

  const [farms, setFarms] = useState<LocalFarm[]>([]);
  const [harvestCount, setHarvestCount] = useState(0);
  const [pending, setPending] = useState(0);

  useFocusEffect(
    useCallback(() => {
      try {
        setFarms(listFarms());
        setHarvestCount(listHarvests().length);
        setPending(listPendingOutbox().length);
      } catch {
        setFarms([]);
      }
    }, []),
  );

  const version = (Constants.expoConfig?.version as string | undefined) ?? "0.1.0";

  return (
    <ScreenLayout active="profile">
      <Text style={typography.h1}>{t.profile}</Text>

      {/* Language */}
      <View style={panel}>
        <Text style={typography.h2}>{t.language}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {SUPPORTED_LANGUAGES.map((item) => (
            <Pressable
              key={item.code}
              accessibilityRole="button"
              accessibilityState={{ selected: language === item.code }}
              onPress={() => setLanguage(item.code)}
              style={{
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: language === item.code ? colors.brandGreen : colors.border,
                backgroundColor: language === item.code ? colors.tint : colors.surface,
              }}
            >
              <Text style={{ color: colors.forest, fontSize: 13 }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Share app — QR / link so the app can be installed on another phone */}
      <View style={panel}>
        <Text style={typography.h2}>{t.shareApp}</Text>
        <Text style={typography.caption}>{t.shareSubtitle}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/share")}
          style={secondaryButton}
        >
          <Ionicons name="qr-code-outline" size={16} color={colors.forest} />
          <Text style={{ color: colors.forest, fontSize: 13 }}>{t.shareApp}</Text>
        </Pressable>
      </View>

      {/* Local / offline status + sync */}
      <View style={panel}>
        <Text style={typography.h2}>{t.offlineStatus}</Text>
        <Row label={t.localRecords} value={`${harvestCount}`} />
        <Row label={t.pending} value={`${pending}`} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/sync")}
          style={secondaryButton}
        >
          <Ionicons name="sync-outline" size={16} color={colors.forest} />
          <Text style={{ color: colors.forest, fontSize: 13 }}>{t.syncStatus}</Text>
        </Pressable>
      </View>

      {/* Farm profiles */}
      <View style={panel}>
        <Text style={typography.h2}>{t.farmProfiles}</Text>
        {farms.length === 0 ? (
          <Text style={typography.caption}>{t.noFarms}</Text>
        ) : (
          farms.map((farm) => (
            <View key={farm.clientUuid} style={rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: colors.forest }}>{farm.name}</Text>
                <Text style={typography.caption}>
                  {farm.district}
                  {farm.farmSizeHa ? ` · ${farm.farmSizeHa} ha` : ""} · {farm.syncStatus}
                </Text>
              </View>
              <Ionicons name="leaf-outline" size={16} color={colors.muted} />
            </View>
          ))
        )}
      </View>

      {/* Privacy and consent */}
      <View style={panel}>
        <Text style={typography.h2}>{t.privacyConsent}</Text>
        <Text style={typography.caption}>{t.privacyText}</Text>
      </View>

      {/* About / data sources */}
      <View style={panel}>
        <Text style={typography.h2}>{t.aboutDataSources}</Text>
        <Text style={typography.caption}>{t.aboutText}</Text>
        <Row label={t.appVersion} value={version} />
      </View>

      {/* Sign-out is shown only as a clearly-disabled capability until auth exists. */}
      <View style={panel}>
        <Pressable accessibilityRole="button" disabled style={disabledButton}>
          <Ionicons name="log-out-outline" size={16} color={colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 13 }}>{t.signOut}</Text>
        </Pressable>
        <Text style={typography.caption}>{t.authNotEnabled}</Text>
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

const rowBetween = {
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  alignItems: "center" as const,
  gap: spacing.sm,
} as const;

const secondaryButton = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

const disabledButton = { ...secondaryButton, opacity: 0.6 } as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowBetween}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={{ color: colors.slate, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
