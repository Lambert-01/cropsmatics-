import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { listHarvests, listPendingOutbox } from "../src/database";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { flushOutbox, isOnline, type FlushSummary } from "../src/sync/queue";
import { colors, radius, spacing } from "../src/theme";

export default function SyncScreen() {
  const language = useAppStore((s) => s.language);
  const t = strings(language);

  const [pending, setPending] = useState(0);
  const [total, setTotal] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<FlushSummary | null>(null);

  async function refresh() {
    setPending(listPendingOutbox().length);
    setTotal(listHarvests().length);
    setOnline(await isOnline());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSync() {
    const result = await flushOutbox();
    setSummary(result);
    await refresh();
  }

  return (
    <ScreenLayout back>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.slate }}>
          Connection: {online === null ? "…" : online ? "online" : "offline"}
        </Text>
        <Text style={{ color: colors.slate }}>
          Local records: {total} · Pending sync: {pending}
        </Text>
      </View>

      <Pressable
        onPress={onSync}
        disabled={!online}
        style={{
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: online ? colors.brandGreen : colors.border,
        }}
      >
        <Text style={{ textAlign: "center", color: colors.white, fontWeight: "600" }}>
          {t.syncStatus}
        </Text>
      </Pressable>

      {summary ? (
        <Text style={{ color: colors.slate }}>
          Attempted {summary.attempted}, synced {summary.synced}, failed {summary.failed}.
        </Text>
      ) : null}

      <Text style={{ fontSize: 12, color: colors.slate }}>
        {t.syncOnOpen}
      </Text>
    </ScreenLayout>
  );
}
