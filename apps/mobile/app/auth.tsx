import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";

import { ScreenLayout } from "../src/components/ScreenLayout";
import { ApiError, authApi } from "../src/services/api";
import { saveSession } from "../src/services/auth/session";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { radius, spacing } from "../src/theme";
import { useTheme, useThemedStyles } from "../src/theme/theme-context";
import type { Palette } from "../src/theme";

export default function AuthScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((state) => state.language));
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 8) {
      setError("Enter an email and a password with at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = registering
        ? await authApi.register(email.trim(), password, name.trim())
        : await authApi.login(email.trim(), password);
      await saveSession(session);
      router.back();
    } catch (reason) {
      if (reason instanceof ApiError) setError(reason.message);
      else setError("The account service could not complete this request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout active="profile" back>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.panel}>
          <Text style={typography.h1}>{t.authTitle}</Text>
          <Text style={typography.caption}>{t.authSubtitle}</Text>
          {registering ? (
            <TextInput
              accessibilityLabel={t.authName}
              placeholder={t.authName}
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
          ) : null}
          <TextInput
            accessibilityLabel={t.authEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder={t.authEmail}
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel={t.authPassword}
            autoCapitalize="none"
            autoComplete="password"
            placeholder={t.authPassword}
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void submit()}
            style={[styles.primary, busy && { opacity: 0.55 }]}
          >
            <Text style={styles.primaryText}>{registering ? t.authCreate : t.authSignIn}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setRegistering((value) => !value);
              setError(null);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              {registering ? t.authSwitchLogin : t.authSwitchRegister}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

const makeStyles = (colors: Palette) =>
  ({
    panel: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.md,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      color: colors.forest,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.background,
    },
    primary: {
      backgroundColor: colors.brandGreen,
      borderRadius: radius.md,
      alignItems: "center" as const,
      paddingVertical: spacing.md,
    },
    primaryText: { color: "#ffffff", fontWeight: "700" as const },
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      alignItems: "center" as const,
      paddingVertical: spacing.sm,
    },
    secondaryText: { color: colors.forest, fontWeight: "600" as const },
    error: { color: colors.danger, fontSize: 13 },
  }) as const;

