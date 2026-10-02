import { Text } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, SectionHeader } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing, typography } from "../../src/theme";

const TOPICS = [
  { title: "Explore data", body: "Browse crops and districts, or use the unified search to jump straight to an entity." },
  { title: "Use maps", body: "Pick a metric, then tap any district that has a verified value. Grey districts have no data for that selection." },
  { title: "Compare data", body: "Compare crops on absolute metrics, or districts on the same crop, period and indicator." },
  { title: "Ask Cropmatics", body: "Ask in English or Kinyarwanda. If the published data cannot answer, Cropmatics says so instead of guessing." },
  { title: "Submit an inquiry", body: "Request information the app does not cover. Your receipt is private to this device." },
  { title: "Offline usage", body: "Home, saved items and Ask history stay available offline. New statistical questions need a connection." },
  { title: "Understand sources", body: "Every analytical view shows the source, period and coverage. The Data Sources page lists what is verified." },
];

export default function HelpScreen() {
  const t = strings(useAppStore((s) => s.language));
  return (
    <ScreenLayout back>
      <SectionHeader title={t.help} subtitle="How to get the most out of Cropmatics" />
      {TOPICS.map((topic) => (
        <Card key={topic.title} style={{ gap: spacing.sm }}>
          <Text style={typography.h3}>{topic.title}</Text>
          <Text style={typography.body}>{topic.body}</Text>
        </Card>
      ))}
    </ScreenLayout>
  );
}

