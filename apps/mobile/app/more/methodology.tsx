import { Text } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, SectionHeader } from "../../src/components/ui";
import { strings, type Strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import { useTheme } from "../../src/theme/theme-context";

const SECTIONS: { title: keyof Strings; body: keyof Strings }[] = [
  { title: "methodologyCleanTitle", body: "methodologyCleanBody" },
  { title: "methodologyIndicatorsTitle", body: "methodologyIndicatorsBody" },
  { title: "methodologyGapTitle", body: "methodologyGapBody" },
  { title: "methodologyNationalTitle", body: "methodologyNationalBody" },
  { title: "methodologyCausationTitle", body: "methodologyCausationBody" },
  { title: "methodologyAskTitle", body: "methodologyAskBody" },
];

export default function MethodologyScreen() {
  const { colors, typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  return (
    <ScreenLayout back>
      <SectionHeader title={t.methodologyTitle} subtitle={t.aboutInterpretationPolicy} />
      {SECTIONS.map((section) => (
        <Card key={section.title} style={{ gap: spacing.sm }}>
          <Text style={typography.h3}>{t[section.title]}</Text>
          <Text style={typography.body}>{t[section.body]}</Text>
        </Card>
      ))}
      <Card style={{ backgroundColor: colors.amberSoft }}>
        <Text style={typography.h3}>{t.aboutWhatItDoesNotClaim}</Text>
        <Text style={typography.caption}>{t.methodologyNoClaimNote}</Text>
      </Card>
    </ScreenLayout>
  );
}

