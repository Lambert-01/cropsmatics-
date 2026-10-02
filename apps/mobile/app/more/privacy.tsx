import { Text } from "react-native";

import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card, SectionHeader } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, typography } from "../../src/theme";

const POINTS = ["privacyPoint1", "privacyPoint2", "privacyPoint3", "privacyPoint4", "privacyPoint5"] as const;

export default function PrivacyScreen() {
  const t = strings(useAppStore((s) => s.language));
  return (
    <ScreenLayout back>
      <SectionHeader title={t.privacy} subtitle={t.privacySubtitle} />
      {POINTS.map((point) => (
        <Card key={point}>
          <Text style={typography.body}>{t[point]}</Text>
        </Card>
      ))}
      <Card style={{ backgroundColor: colors.mintSoft }}>
        <Text style={typography.caption}>{t.privacyHonestyNote}</Text>
      </Card>
    </ScreenLayout>
  );
}

