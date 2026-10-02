import { Text } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, SectionHeader } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, typography } from "../../src/theme";

const POINTS = [
  "Browsing public agricultural intelligence does not require an account or any personal farm information.",
  "Inquiry contact fields are optional. If you provide them, only you can read your inquiry back using your private receipt token.",
  "Saved items and Ask history stay on this device unless you explicitly share them.",
  "Location, photos and documents are only requested inside Field Operations, never during Explore.",
  "The public API cannot list other people's inquiries or contact details.",
];

export default function PrivacyScreen() {
  const t = strings(useAppStore((s) => s.language));
  return (
    <ScreenLayout back>
      <SectionHeader title={t.privacy} subtitle="What Cropmatics does — and does not — collect" />
      {POINTS.map((point) => (
        <Card key={point}>
          <Text style={typography.body}>{point}</Text>
        </Card>
      ))}
      <Card style={{ backgroundColor: colors.mintSoft }}>
        <Text style={typography.caption}>
          This page describes behavior that is actually implemented. Cropmatics does not promise policies it has not
          built.
        </Text>
      </Card>
    </ScreenLayout>
  );
}

