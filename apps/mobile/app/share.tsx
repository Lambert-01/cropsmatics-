import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { ScreenLayout } from "../src/components/ScreenLayout";
import {
  apiBaseUrl,
  apiIsLan,
  apiIsLocal,
  shareUrl,
  shareUrlText,
} from "../src/config/share";
import { strings } from "../src/i18n";
import { useAppStore } from "../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../src/theme";

/**
 * Share screen — how this app reaches other people's phones.
 *
 * The QR encodes the web /install landing page, not a binary link: the page
 * carries instructions and works for both an EAS APK install and Expo Go.
 */
export default function ShareScreen() {
  const router = useRouter();
  const language = useAppStore((state) => state.language);
  const t = strings(language);

  const [canShare, setCanShare] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shareUrl) void Sharing.isAvailableAsync().then(setCanShare).catch(() => setCanShare(false));
    else setCanShare(false);
  }, []);

  const openLink = () => {
    if (shareUrl) void Linking.openURL(shareUrl);
  };

  const copy = async () => {
    if (!shareUrl) return;
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
  };

  const share = async () => {
    if (!shareUrl || canShare !== true) return;
    try {
      await Sharing.shareAsync(shareUrl, {
        dialogTitle: t.shareVia,
        mimeType: "text/plain",
      });
    } catch {
      // User cancelled or no target app; the link is on screen regardless.
    }
  };

  const apiUrl = apiBaseUrl;
  const localApi = apiIsLocal(apiUrl);
  const lanApi = apiIsLan(apiUrl);

  return (
    <ScreenLayout active="profile" back>
      <Text style={typography.h1}>{t.shareApp}</Text>
      <Text style={typography.caption}>{t.shareSubtitle}</Text>

      {shareUrl ? (
        <>
          {/* QR code card */}
          <View style={panel}>
            <Text style={typography.h2}>{t.scanToInstall}</Text>
            <View style={qrWrap}>
              <QRCode
                value={shareUrl}
                size={220}
                color={colors.forest}
                backgroundColor="transparent"
                quietZone={8}
              />
            </View>
            <Text style={typography.caption}>{t.scanHint}</Text>
            <Text style={urlText} numberOfLines={1} selectable>
              {shareUrlText}
            </Text>
          </View>

          {/* Actions */}
          <View style={[panel, actionRow]}>
            <Pressable
              accessibilityRole="button"
              onPress={copy}
              style={secondaryButton}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={16}
                color={colors.forest}
              />
              <Text style={{ color: colors.forest, fontSize: 13 }}>
                {copied ? t.linkCopied : t.copyLink}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={share}
              disabled={canShare !== true}
              style={({ pressed }) => [
                secondaryButton,
                canShare !== true && disabledButton,
                pressed && canShare === true && { opacity: 0.7 },
              ]}
            >
              {canShare === null ? (
                <ActivityIndicator size="small" color={colors.forest} />
              ) : (
                <Ionicons name="share-social-outline" size={16} color={colors.forest} />
              )}
              <Text style={{ color: colors.forest, fontSize: 13 }}>{t.sendToSomeone}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={openLink}
              style={secondaryButton}
            >
              <Ionicons name="open-outline" size={16} color={colors.forest} />
              <Text style={{ color: colors.forest, fontSize: 13 }}>{t.orOpenLink}</Text>
            </Pressable>
          </View>

          {/* Install steps */}
          <View style={panel}>
            <Text style={typography.h2}>{t.installSteps}</Text>
            <Step n={1} text={t.stepOne} />
            <Step n={2} text={t.stepTwo} />
            <Step n={3} text={t.stepThree} />
            <Text style={typography.caption}>{t.needExpoGo}</Text>
          </View>
        </>
      ) : (
        <View style={panel}>
          <Text style={typography.caption}>{t.shareNotConfigured}</Text>
        </View>
      )}

      {/* Which API will the installed app reach? */}
      <View style={panel}>
        <Text style={typography.h2}>API</Text>
        {apiUrl ? <Text style={urlText} selectable>{apiUrl}</Text> : null}
        <Text style={typography.caption}>
          {localApi || lanApi ? t.apiNoteDemo : t.apiNotePublic}
        </Text>
      </View>
    </ScreenLayout>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.forest, fontSize: 12, fontWeight: "700" }}>{n}</Text>
      </View>
      <Text style={[typography.caption, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const panel = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  padding: spacing.md,
  gap: spacing.sm,
} as const;

const qrWrap = {
  alignItems: "center" as const,
  padding: spacing.md,
  borderRadius: radius.md,
  backgroundColor: colors.background,
} as const;

const urlText = {
  color: colors.slate,
  fontSize: 12,
  fontWeight: "600" as const,
} as const;

const secondaryButton = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

const disabledButton = { opacity: 0.5 } as const;

const actionRow = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
} as const;
