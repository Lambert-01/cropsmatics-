import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { BottomNav } from "../../src/components/BottomNav";
import {
  Badge,
  Card,
  EmptyState,
  LoadingSkeleton,
  SecondaryButton,
  SourceCard,
} from "../../src/components/ui";
import { addAskHistory, saveItem } from "../../src/database";
import { strings } from "../../src/i18n";
import { askApi } from "../../src/services/api";
import type { AskAnswer } from "../../src/types";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../../src/theme";
import { slugifyEntity } from "../../src/utils/slug";

interface Turn {
  id: string;
  question: string;
  answer: AskAnswer | null;
  pending?: boolean;
}

export default function AskScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));
  const language = useAppStore((s) => s.language);
  const params = useLocalSearchParams<{ q?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);

  const suggestions = useQuery({ queryKey: ["ask-suggestions"], queryFn: () => askApi.suggestions(6) });

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    const id = `${Date.now()}`;
    setTurns((prev) => [...prev, { id, question: trimmed, answer: null, pending: true }]);
    setInput("");
    setLoading(true);
    try {
      const answer = await askApi.query({ question: trimmed, language });
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, answer, pending: false } : turn)));
      try {
        addAskHistory({
          question: trimmed,
          answer: answer.answer,
          grounded: answer.grounded,
          intent: answer.intent,
          source: answer.source,
          period: answer.period,
        });
      } catch {
        // history persistence is best-effort
      }
    } catch {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                pending: false,
                answer: {
                  answer: t.askNotGrounded,
                  grounded: false,
                  intent: "unsupported",
                  evidence: {},
                  key_figures: [],
                  language,
                  translation_status: null,
                  source: null,
                  period: null,
                  coverage: null,
                  limitations: [],
                },
              }
            : turn,
        ),
      );
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  useEffect(() => {
    if (params.q) void send(params.q as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  const openEntity = (answer: AskAnswer) => {
    const district = answer.evidence?.district as string | undefined;
    const crop = answer.evidence?.crop as string | undefined;
    if (district && crop) return `/explore/crop/${slugifyEntity(crop)}`;
    if (district) return `/explore/district/${slugifyEntity(district)}`;
    if (crop) return `/explore/crop/${slugifyEntity(crop)}`;
    return null;
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: 4, paddingVertical: spacing.sm }}>
            <View style={styles.askIcon}>
              <Ionicons name="chatbubble-ellipses" size={26} color={colors.primary} />
            </View>
            <Text style={typography.h1}>{t.askTitle}</Text>
            <Text style={{ ...typography.caption, textAlign: "center" }}>{t.askSubtitle}</Text>
          </View>

          {!turns.length ? (
            suggestions.isLoading ? (
              <LoadingSkeleton height={120} />
            ) : (
              <>
                <Text style={typography.h3}>{t.askSuggestedQuestions}</Text>
                {(suggestions.data?.questions ?? []).map((question) => (
                  <Card key={question} onPress={() => void send(question)} accessibilityLabel={question}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <Text style={{ ...typography.body, flex: 1 }}>{question}</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                    </View>
                  </Card>
                ))}
                {!suggestions.data?.questions?.length ? (
                  <EmptyState title={t.noDataAvailable} icon="chatbubble-outline" />
                ) : null}
              </>
            )
          ) : null}

          {turns.map((turn) => (
            <View key={turn.id} style={{ gap: spacing.sm }}>
              <View style={styles.userBubble}>
                <Text style={{ color: colors.white, fontSize: 15 }}>{turn.question}</Text>
              </View>

              {turn.pending ? (
                <LoadingSkeleton height={70} />
              ) : turn.answer ? (
                <Card style={{ gap: spacing.sm }}>
                  <Text style={typography.body}>{turn.answer.answer}</Text>

                  {turn.answer.grounded && turn.answer.key_figures.length ? (
                    <View style={{ gap: 4 }}>
                      <Text style={styles.blockTitle}>Key figures</Text>
                      {turn.answer.key_figures.map((figure) => (
                        <View key={figure.label} style={styles.figureRow}>
                          <Text style={{ ...typography.caption, flex: 1 }}>{figure.label}</Text>
                          <Text style={styles.figureValue}>
                            {figure.value.toLocaleString()}
                            {figure.unit ? ` ${figure.unit}` : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {!turn.answer.grounded ? (
                    <View style={styles.notGrounded}>
                      <Ionicons name="information-circle-outline" size={16} color={colors.amber} />
                      <Text style={{ ...typography.caption, flex: 1 }}>
                        Cropmatics only answers from verified data. Try asking about a crop, a district or an
                        indicator.
                      </Text>
                    </View>
                  ) : null}

                  {turn.answer.grounded ? (
                    <>
                      <SourceCard
                        sourceLabel={turn.answer.source}
                        period={turn.answer.period}
                        coverage={turn.answer.coverage}
                        limitations={turn.answer.limitations}
                      />
                      {turn.answer.translation_status === "TEMPORARY_ENGLISH_FALLBACK" ? (
                        <Badge text="Kinyarwanda review pending" tone="amber" />
                      ) : null}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                        {openEntity(turn.answer) ? (
                          <SecondaryButton
                            label={t.askOpenCrop}
                            icon="leaf-outline"
                            onPress={() => router.push(openEntity(turn.answer as AskAnswer) as never)}
                          />
                        ) : null}
                        <SecondaryButton
                          label={t.askSaveAnswer}
                          icon="bookmark-outline"
                          onPress={() => {
                            try {
                              saveItem({
                                type: "question",
                                entityKey: turn.id,
                                title: turn.question,
                                subtitle: turn.answer?.answer.slice(0, 100) ?? null,
                                metadata: { answer: turn.answer },
                              });
                            } catch {
                              // storage unavailable
                            }
                          }}
                        />
                      </View>
                    </>
                  ) : null}
                </Card>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            accessibilityLabel={t.askPlaceholder}
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t.askPlaceholder}
            placeholderTextColor={colors.slate500}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.askSend}
            onPress={() => void send(input)}
            disabled={loading || !input.trim()}
            style={[styles.send, (loading || !input.trim()) && { opacity: 0.5 }]}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.askHistory} onPress={() => router.push("/ask/history")} style={styles.historyLink}>
          <Ionicons name="time-outline" size={15} color={colors.primaryStrong} />
          <Text style={styles.historyText}>{t.askHistory}</Text>
        </Pressable>
      </KeyboardAvoidingView>
      <BottomNav active="ask" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  askIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  blockTitle: { ...typography.caption, fontWeight: "700", color: colors.primaryStrong },
  figureRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  figureValue: { fontSize: 14, fontWeight: "700", color: colors.forestDeep },
  notGrounded: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.slate900,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  historyLink: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingBottom: 8 },
  historyText: { color: colors.primaryStrong, fontWeight: "600", fontSize: 13 },
});
