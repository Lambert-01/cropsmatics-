import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { listHarvests, listPendingOutbox } from "../../src/database";
import { listConflictOutbox } from "../../src/database/outboxQueries";
import { strings } from "../../src/i18n";
import type { Strings } from "../../src/i18n/en";
import { api } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../../src/theme";
import { isValidIsoDate, todayIso } from "../../src/utils/dates";

type AlertGroup = "attention" | "upcoming" | "updates";

interface Alert {
  id: string;
  kind: "sync" | "risk" | "date" | "data";
  group: AlertGroup;
  title: string;
  detail: string;
  tone: string;
  /** Where the action goes. The alert is useless if it cannot be acted on. */
  route: string;
  actionLabel: keyof Strings;
}

/** A harvest within this many days is flagged as approaching. */
const APPROACHING_DAYS = 7;

/** Render order: what needs attention first. */
const GROUP_ORDER: AlertGroup[] = ["attention", "upcoming", "updates"];
const GROUP_TITLE: Record<AlertGroup, keyof Strings> = {
  attention: "alertsNeedsAttention",
  upcoming: "alertsUpcoming",
  updates: "alertsUpdates",
};

export default function AlertsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useFocusEffect(
    useCallback(() => {
      const next: Alert[] = [];
      try {
        const pending = listPendingOutbox();
        const failed = pending.filter((item) => item.status === "FAILED");
        const conflicts = listConflictOutbox();
        if (failed.length) {
          next.push({
            id: "sync-failed",
            kind: "sync",
            group: "attention",
            title: t.alertsSyncFailure,
            detail: `${failed.length} ${t.records}`,
            tone: colors.danger,
            route: "/field-operations/sync",
            actionLabel: "alertsReview",
          });
        }
        if (conflicts.length) {
          next.push({
            id: "sync-conflict",
            kind: "sync",
            group: "attention",
            title: t.alertsConflict,
            detail: `${conflicts.length} ${t.records}`,
            tone: colors.amber,
            route: "/field-operations/sync",
            actionLabel: "alertsReview",
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
              group: "upcoming",
              title: t.alertsHarvestApproaching,
              detail: `${harvest.crop} · ${harvest.district} · ${date}`,
              tone: colors.info,
              route: "/field-operations/harvests",
              actionLabel: "alertsViewHarvest",
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
            group: "updates",
            title: t.alertsDataUpdate,
            detail: `pipeline ${version.pipeline_version ?? "—"} · ${version.build_timestamp ?? ""}`,
            tone: colors.brandGreen,
            route: "/more/data-sources",
            actionLabel: "alertsSeeChanges",
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
        GROUP_ORDER.map((group) => {
          const items = alerts.filter((alert) => alert.group === group);
          if (!items.length) return null;
          return (
            <View key={group} style={{ gap: spacing.sm }}>
              <Text style={typography.microCaps}>{t[GROUP_TITLE[group]].toUpperCase()}</Text>
              {items.map((alert) => (
                <View key={alert.id} style={panel}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Ionicons name="notifications-outline" size={17} color={alert.tone} />
                    <Text style={{ fontWeight: "700", color: alert.tone, flex: 1 }}>
                      {alert.title}
                    </Text>
                  </View>
                  <Text style={typography.body}>{alert.detail}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t[alert.actionLabel]}: ${alert.title}`}
                    onPress={() => router.push(alert.route as never)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
                  >
                    <Text style={{ color: colors.primaryStrong, fontWeight: "700" }}>
                      {t[alert.actionLabel]}
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primaryStrong} />
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })
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
