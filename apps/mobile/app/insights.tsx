import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { ScreenLayout } from "../src/components/ScreenLayout";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";

export default function InsightsScreen() {
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));
  return <ScreenLayout active="insights"><Text style={typography.h1}>{t.recommendations}</Text>
    <Text style={typography.body}>{t.riskNotStored}</Text>
    <Pressable onPress={() => router.push("/register-harvest")} style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandGreen }}>
      <Text style={{ color: colors.white, fontWeight: "700" }}>{t.registerHarvest}</Text>
    </Pressable>
  </ScreenLayout>;
}
