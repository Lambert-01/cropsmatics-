import { Text } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, SectionHeader } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, spacing, typography } from "../../src/theme";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "How data are cleaned",
    body: "Official NISR/MINAGRI releases are extracted, validated against documented row counts and published as processed tables. A value that fails validation is dropped, never guessed.",
  },
  {
    title: "How indicators are calculated",
    body: "Each indicator declares how it may be aggregated. Shares of farmers use an unweighted mean of published district rows; indicators that depend on a crop must name that crop first.",
  },
  {
    title: "What the productivity gap means",
    body: "The gap index compares an observed district-crop yield against a benchmark (the national median for the same crop). It describes an association, not a proven cause.",
  },
  {
    title: "Why some periods are national-only",
    body: "Some official tables are published only at national level. Where that is the case, the app says so and never colours a district as if district data existed.",
  },
  {
    title: "Why associations are not causation",
    body: "District aggregates describe patterns across many farms and conditions. They cannot prove that changing one practice would cause a yield change.",
  },
  {
    title: "How Ask Cropmatics is grounded",
    body: "Every answer is composed from retrieved, validated values. The assistant cannot invent a figure, and it refuses questions the published statistics cannot support.",
  },
];

export default function MethodologyScreen() {
  const t = strings(useAppStore((s) => s.language));
  return (
    <ScreenLayout back>
      <SectionHeader title="Methodology" subtitle={t.aboutInterpretationPolicy} />
      {SECTIONS.map((section) => (
        <Card key={section.title} style={{ gap: spacing.sm }}>
          <Text style={typography.h3}>{section.title}</Text>
          <Text style={typography.body}>{section.body}</Text>
        </Card>
      ))}
      <Card style={{ backgroundColor: colors.amberSoft }}>
        <Text style={typography.h3}>{t.aboutWhatItDoesNotClaim}</Text>
        <Text style={typography.caption}>
          No market prices, weather forecasts, pest forecasts, credit scoring or facility capacities are claimed
          unless a verified integrated dataset exists.
        </Text>
      </Card>
    </ScreenLayout>
  );
}

