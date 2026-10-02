import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import {
  Badge,
  Card,
  EmptyState,
  FilterChip,
  PrimaryButton,
  SectionHeader,
} from "../../src/components/ui";
import { clearAskHistory, listAskHistory, saveItem } from "../../src/database";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import type { AskHistoryItem } from "../../src/types";
import { colors, spacing, typography } from "../../src/theme";

export default function AskHistoryScreen() {
  const t = strings(useAppStore((s) => s.language));
  const [items, setItems] = useState<AskHistoryItem[]>(() => {
    try {
      return listAskHistory();
    } catch {
      return [];
    }
  });

  const reload = useCallback(() => {
    try {
      setItems(listAskHistory());
    } catch {
      setItems([]);
    }
  }, []);

  return (
    <ScreenLayout back>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <SectionHeader title={t.askHistory} subtitle={t.askHistorySubtitle} />
        {items.length ? (
          <PrimaryButton
            label={t.askDeleteHistory}
            onPress={() => {
              try {
                clearAskHistory();
              } catch {
                // storage unavailable
              }
              reload();
            }}
          />
        ) : null}
      </View>

      {items.length ? (
        items.map((item) => (
          <Card key={item.id} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ ...typography.h3, flex: 1 }}>{item.question}</Text>
              <Badge text={item.grounded ? t.askStatusGrounded : t.askStatusUnavailable} tone={item.grounded ? "mint" : "amber"} />
            </View>
            <Text numberOfLines={3} style={typography.body}>
              {item.answer}
            </Text>
            <Text style={typography.micro}>
              {[item.source, item.period, item.created_at?.slice(0, 10)].filter(Boolean).join(" · ")}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <FilterChip
                label={t.saveItem}
                onPress={() => {
                  try {
                    saveItem({ type: "question", entityKey: item.id, title: item.question, subtitle: item.answer.slice(0, 100) });
                  } catch {
                    // storage unavailable
                  }
                }}
              />
              <View style={{ justifyContent: "center" }}>
                <Ionicons name="time-outline" size={14} color={colors.slate500} />
              </View>
            </View>
          </Card>
        ))
      ) : (
        <EmptyState title={t.askNoHistory} message={t.popularQuestions} icon="chatbubble-outline" />
      )}
    </ScreenLayout>
  );
}

