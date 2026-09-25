import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { listHarvests, listPendingOutbox } from "../src/database";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { flushOutbox, isOnline, type FlushSummary } from "../src/sync/queue";
import { colors, radius, spacing, typography } from "../src/theme";

export default function SyncScreen() {
  const language = useAppStore((s) => s.language);
  const t = strings(language);

  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [total, setTotal] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<FlushSummary | null>(null);

  function refreshLocal() {
    const items = listPendingOutbox();
    setPending(items.length);
    setConflicts(items.filter((item) => item.status === "CONFLICT").length);
    setTotal(listHarvests().length);
  }

  const refresh = useCallback(async () => {
    refreshLocal();
    setOnline(await isOnline());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSync() {
    const result = await flushOutbox();
    setSummary(result);
    await refresh();
  }

  return (
    <ScreenLayout back>
      <View style={panel}>
        <View style={rowBetween}>
          <Text style={typography.caption}>Connection</Text>
          <Text style={{ color: online ? colors.success : colors.amber, fontWeight: "700" }}>
            {online === null ? "…" : online ? "online" : "offline"}
          </Text>
        </View>
        <View style={rowBetween}>
          <Text style={typography.caption}>{t.localRecords}</Text>
          <Text style={{ color: colors.slate, fontWeight: "700" }}>{total}</Text>
        </View>
        <View style={rowBetween}>
          <Text style={typography.caption}>{t.pending}</Text>
          <Text style={{ color: colors.slate, fontWeight: "700" }}>{pending}</Text>
        </View>
        {conflicts > 0 ? (
          <View style={rowBetween}>
            <Text style={{ ...typography.caption, color: colors.amber }}>
              {t.syncConflicts}
            </Text>
            <Text style={{ color: colors.amber, fontWeight: "700" }}>{conflicts}</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onSync}
        disabled={!online}
        style={{
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: online ? colors.brandGreen : colors.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
        }}
      >
        <Ionicons name="sync-outline" size={17} color={colors.white} />
        <Text style={{ color: colors.white, fontWeight: "700" }}>{t.syncNow}</Text>
      </Pressable>

      {summary ? (
        <Text style={typography.body}>
          {t.syncSummary
            .replace("{attempted}", String(summary.attempted))
            .replace("{synced}", String(summary.synced))
            .replace("{failed}", String(summary.failed))}
          {summary.conflicts ? ` · ${t.syncConflicts}: ${summary.conflicts}` : ""}
        </Text>
      ) : null}

      <Text style={typography.caption}>{t.syncOnOpen}</Text>
      <Text style={typography.caption}>
        Sync is idempotent: each record carries a locally generated id that the server treats as an
        idempotency key, so a repeated send never creates a duplicate.
      </Text>
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
