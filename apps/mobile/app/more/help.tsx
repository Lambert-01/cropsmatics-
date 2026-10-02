import { Text } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, SectionHeader } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import { useTheme } from "../../src/theme/theme-context";

const TOPICS = [
  { title: "helpExploreTitle", body: "helpExploreBody" },
  { title: "helpMapsTitle", body: "helpMapsBody" },
  { title: "helpCompareTitle", body: "helpCompareBody" },
  { title: "helpAskTitle", body: "helpAskBody" },
  { title: "helpInquiryTitle", body: "helpInquiryBody" },
  { title: "helpOfflineTitle", body: "helpOfflineBody" },
  { title: "helpSourcesTitle", body: "helpSourcesBody" },
] as const;

export default function HelpScreen() {
  const { typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  return (
    <ScreenLayout back>
      <SectionHeader title={t.help} subtitle={t.helpSubtitle} />
      {TOPICS.map((topic) => (
        <Card key={topic.title} style={{ gap: spacing.sm }}>
          <Text style={typography.h3}>{t[topic.title]}</Text>
          <Text style={typography.body}>{t[topic.body]}</Text>
        </Card>
      ))}
    </ScreenLayout>
  );
}

