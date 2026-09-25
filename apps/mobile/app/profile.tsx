import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { ScreenLayout } from "../src/components/ScreenLayout";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const t = strings(useAppStore((state) => state.language));
  return <ScreenLayout active="profile"><Text style={typography.h1}>{t.profile}</Text>
    <Text style={typography.body}>{t.localRecordNote}</Text>
    <Pressable onPress={() => router.push("/sync")} style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandGreen }}>
      <Text style={{ color: colors.white, fontWeight: "700" }}>{t.syncStatus}</Text>
    </Pressable>
  </ScreenLayout>;
}
