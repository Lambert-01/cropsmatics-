import { Text, View } from "react-native";

import { BrandMark } from "../../src/components/BrandMark";
import { ScreenLayout } from "../../src/components/ScreenLayout";
import { Card } from "../../src/components/ui";
import { strings } from "../../src/i18n";
import { useAppStore } from "../../src/store/useAppStore";
import { spacing } from "../../src/theme";
import { useTheme } from "../../src/theme/theme-context";

export default function AboutScreen() {
  const { typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  return (
    <ScreenLayout back>
      <View style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md }}>
        <BrandMark size={72} />
        <Text style={typography.display}>{t.appName}</Text>
        <Text style={typography.caption}>{t.tagline}</Text>
      </View>

      <Card style={{ gap: spacing.sm }}>
        <Text style={typography.h3}>{t.aboutDescription}</Text>
      </Card>

      <Card>
        <Text style={typography.h3}>{t.aboutWhoItIsFor}</Text>
        <Text style={typography.body}>
          Policymakers, planners, researchers, agronomists, farmers, students, cooperatives, NGOs, businesses and
          citizens.
        </Text>
      </Card>

      <Card>
        <Text style={typography.h3}>{t.aboutWhatDataItUses}</Text>
        <Text style={typography.body}>
          Official NISR and MINAGRI agricultural statistics, kept separate from any voluntary field records.
        </Text>
      </Card>

      <Card>
        <Text style={typography.h3}>{t.aboutAIUsage}</Text>
        <Text style={typography.body}>
          Ask Cropmatics is an explanation layer over verified data. It does not generate numbers and does not make
          market or credit predictions; weather is shown only as external context.
        </Text>
      </Card>
    </ScreenLayout>
  );
}

