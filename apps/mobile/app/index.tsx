import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { SUPPORTED_LANGUAGES } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing } from "../src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { language, setLanguage } = useAppStore();

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ fontSize: 26, fontWeight: "700", color: colors.forest }}>
        Cropmatics Rwanda
      </Text>
      <Text style={{ color: colors.slate }}>Crop Intelligence from Data to Action</Text>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        {SUPPORTED_LANGUAGES.map((l) => (
          <Pressable
            key={l.code}
            onPress={() => setLanguage(l.code)}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: language === l.code ? colors.brandGreen : colors.border,
              backgroundColor: language === l.code ? "#e6f4ef" : colors.surface,
            }}
          >
            <Text>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      <ActionButton
        label="Register Harvest"
        onPress={() => router.push("/register-harvest")}
        primary
      />
      <ActionButton label="Sync Status" onPress={() => router.push("/sync")} />

      <Text style={{ marginTop: spacing.lg, fontSize: 12, color: colors.slate }}>
        Works offline. Records sync automatically when you are back online.
      </Text>
    </ScrollView>
  );
}

function ActionButton({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: primary ? colors.brandGreen : colors.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          textAlign: "center",
          fontWeight: "600",
          color: primary ? colors.white : colors.forest,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
