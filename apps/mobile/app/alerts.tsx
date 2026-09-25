import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { listHarvests, listPendingOutbox } from "../src/database";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";
import { isValidIsoDate, todayIso } from "../src/utils/dates";

interface Alert {
  id: string;
  kind: "sync" | "risk" | "date" | "data";
  title: string;
  detail: string;
  tone: string;
}

/** A harvest within this many days is flagged as approaching. */
const APPROACHING_DAYS = 7;

export default function AlertsScreen() {
  const t = strings(useAppStore((state) => state.language));
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useFocusEffect(
    useCallback(() => {
      const next: Alert[] = [];
      try {
        const pending = listPendingOutbox();
        const failed = pending.filter((item) => item.status === "FAILED");
        const conflicts = pending.filter((item) => item.status === "CONFLICT");
        if (failed.length) {
          next.push({
            id: "sync-failed",
            kind: "sync",
            title: t.alertsSyncFailure,
            detail: `${failed.length} ${t.records}`,
            tone: colors.danger,
          });
        }
        if (conflicts.length) {
          next.push({
            id: "sync-conflict",
            kind: "sync",
            title: t.alertsConflict,
            detail: `${conflicts.length} ${t.records}`,
            tone: colors.amber,
          });
        }

        const today = todayIso();
        for (const harvest of listHarvests()) {
          const date = harvest.harvestStartDate ?? harvest.expectedHarvestDate ?? null;
          if (!isValidIsoDate(date)) continue;
          const days = Math.round(
            (new Date(date as string).getTime() - new Date(today).getTime()) / 86_400_000,
          );
          if (days >= 0 && days <= APPROACHING_DAYS) {
            next.push({
              id: `date-${harvest.clientUuid}`,
              kind: "date",
              title: t.alertsHarvestApproaching,
              detail: `${harvest.crop} · ${harvest.district} · ${date}`,
              tone: colors.info,
            });
          }
        }
      } catch {
        // storage unavailable: no alerts rather than invented ones
      }
      setAlerts(next);
    }, [t]),
  );

  // Data/model update notice — only when the server actually reports a build.
  useEffect(() => {
    let active = true;
    api
      .dataVersion()
      .then((version) => {
        if (!active || !version.available) return;
        setAlerts((current) => [
          ...current,
          {
            id: "data-version",
            kind: "data",
            title: t.alertsDataUpdate,
            detail: `pipeline ${version.pipeline_version ?? "—"} · ${version.build_timestamp ?? ""}`,
            tone: colors.brandGreen,
          },
        ]);
      })
      .catch(() => {
        /* offline: no data alert */
      });
    return () => {
      active = false;
    };
    // Only re-run when the language changes; the server build is fetched once.
  }, [t.alertsDataUpdate]);

  return (
    <ScreenLayout active="alerts">
      <Text style={typography.h1}>{t.alerts}</Text>
      <Text style={typography.caption}>{t.alertsSubtitle}</Text>

      {alerts.length === 0 ? (
        <View style={panel}>
          <Text style={typography.body}>{t.noAlertsYet}</Text>
          <Text style={typography.caption}>{t.noAlerts}</Text>
        </View>
      ) : (
        alerts.map((alert) => (
          <View key={alert.id} style={panel}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Ionicons name="notifications-outline" size={17} color={alert.tone} />
              <Text style={{ fontWeight: "700", color: alert.tone, flex: 1 }}>{alert.title}</Text>
            </View>
            <Text style={typography.body}>{alert.detail}</Text>
          </View>
        ))
      )}
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
