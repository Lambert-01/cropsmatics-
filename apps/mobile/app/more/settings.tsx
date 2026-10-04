import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { clearOfflineCache } from "../../src/cache/offline";
import { readCacheMeta } from "../../src/cache/persister";
import { describeCache } from "../../src/cache/status";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, InfoRow, SectionHeader } from "../../src/components/ui";
import { SUPPORTED_LANGUAGES, strings } from "../../src/i18n";
import { features } from "../../src/config/features";
import { clearCachedData } from "../../src/database";
import { useAppStore } from "../../src/store/useAppStore";
import { radius, spacing } from "../../src/theme";
import type { Palette } from "../../src/theme";
import { useThemedStyles, useTheme } from "../../src/theme/theme-context";

export default function SettingsScreen() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const { language, setLanguage, settings, updateSettings } = useAppStore();
  const queryClient = useQueryClient();
  // The human age of the persisted analytical payload, or null when there is
  // none. Read once on mount and refreshed when the payload is cleared.
  const [cacheAge, setCacheAge] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readCacheMeta().then((meta) => {
      if (active) setCacheAge(describeCache(meta.updatedAt).ageLabel);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScreenLayout back>
      <SectionHeader title={t.settingsTitle} />

      <Card>
        <Text style={typography.h3}>{t.language}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {SUPPORTED_LANGUAGES.map((item) => (
            <Pressable
              key={item.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: language === item.code }}
              accessibilityLabel={item.label}
              onPress={() => setLanguage(item.code)}
              style={[
                styles.option,
                language === item.code ? { borderColor: colors.primary, backgroundColor: colors.mintSoft } : null,
              ]}
            >
              <Text style={{ fontWeight: "600", color: colors.forestDeep }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={typography.h3}>{t.accessibility}</Text>
        <View style={styles.switchRow}>
          <Text style={{ ...typography.body, flex: 1 }}>{t.reducedMotion}</Text>
          <Switch
            value={settings.reducedMotion}
            onValueChange={(value) => updateSettings({ reducedMotion: value })}
            trackColor={{ true: colors.primary }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={{ ...typography.body, flex: 1 }}>{t.largerText}</Text>
          <Switch
            value={settings.largerText}
            onValueChange={(value) => updateSettings({ largerText: value })}
            trackColor={{ true: colors.primary }}
          />
        </View>
      </Card>

      <Card>
        <Text style={typography.h3}>{t.dataSettings}</Text>
        <View style={styles.switchRow}>
          <Text style={{ ...typography.body, flex: 1 }}>{t.offlineCache}</Text>
          <Switch
            value={settings.offlineCacheEnabled}
            onValueChange={(value) => updateSettings({ offlineCacheEnabled: value })}
            trackColor={{ true: colors.primary }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.clearCachedData}
          onPress={() => {
            try {
              clearCachedData();
            } catch {
              // storage unavailable
            }
            void clearOfflineCache(queryClient).then(() => setCacheAge(null));
          }}
          style={styles.clear}
        >
          <Text style={{ color: colors.danger, fontWeight: "600" }}>{t.clearCachedData}</Text>
        </Pressable>
        <Text style={typography.micro}>
          {!settings.offlineCacheEnabled
            ? t.cacheDisabled
            : cacheAge
              ? t.cacheStatusUpdated.replace("{age}", cacheAge)
              : t.cacheStatusEmpty}
        </Text>
        <Text style={typography.micro}>{t.clearCacheNote}</Text>
      </Card>

      <Card>
        <Text style={typography.h3}>{t.appearance}</Text>
        <Text style={typography.caption}>{t.appearanceUnavailable}</Text>
      </Card>

      <Card>
        <Text style={typography.h3}>{t.about}</Text>
        <InfoRow label={t.appVersion} value={Constants.expoConfig?.version ?? "0.1.0"} />
        <InfoRow label={t.buildNumber} value={String(Constants.expoConfig?.android?.versionCode ?? "—")} />
      </Card>
    </ScreenLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  option: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clear: { paddingVertical: spacing.sm },
});
