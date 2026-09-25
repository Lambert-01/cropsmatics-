import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Alert, Pressable, Text, View } from "react-native";

import type { HarvestAttachment, SyncStatus } from "../types";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "../utils/units";
import { uuidv4 } from "../utils/uuid";
import { colors, radius, spacing, typography } from "../theme";

export interface PendingAttachment {
  clientUuid: string;
  localUri: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

interface Labels {
  addPhoto: string;
  addDocument: string;
  remove: string;
  tooLarge: string;
  limitReached: string;
  permissionDenied: string;
  none: string;
}

function toPending(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
}): PendingAttachment {
  return {
    clientUuid: uuidv4(),
    localUri: asset.uri,
    fileName: asset.fileName ?? asset.uri.split("/").pop() ?? "attachment",
    mimeType: asset.mimeType ?? null,
    sizeBytes: asset.size ?? null,
  };
}

/**
 * Attachment capture.
 *
 * Files stay on the device until the harvest is saved; only then is an
 * `harvest_attachment` row written. That keeps a cancelled wizard from leaving
 * orphaned rows, and it means removing an attachment before save is free.
 */
export function AttachmentFields({
  attachments,
  onChange,
  labels,
}: {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  labels: Labels;
}) {
  const full = attachments.length >= MAX_ATTACHMENTS;

  function guard(asset: PendingAttachment | null): PendingAttachment | null {
    if (!asset) return null;
    if (asset.sizeBytes != null && asset.sizeBytes > MAX_ATTACHMENT_BYTES) {
      Alert.alert(labels.tooLarge, `${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB`);
      return null;
    }
    return asset;
  }

  async function addPhoto() {
    if (full) return Alert.alert(labels.limitReached);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(labels.permissionDenied);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      exif: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const pending = guard(
      toPending({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        size: asset.fileSize,
      }),
    );
    if (pending) onChange([...attachments, pending]);
  }

  async function addDocument() {
    if (full) return Alert.alert(labels.limitReached);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    let size = asset.size ?? null;
    if (size == null) {
      try {
        const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
        if (info.exists && "size" in info) size = info.size ?? null;
      } catch {
        size = null; // size unknown: the server still enforces its own limit
      }
    }
    const pending = guard(
      toPending({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType, size }),
    );
    if (pending) onChange([...attachments, pending]);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          onPress={addPhoto}
          disabled={full}
          style={buttonStyle(full)}
        >
          <Ionicons name="image-outline" size={16} color={full ? colors.muted : colors.forest} />
          <Text style={{ color: full ? colors.muted : colors.forest, fontSize: 13 }}>
            {labels.addPhoto}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={addDocument}
          disabled={full}
          style={buttonStyle(full)}
        >
          <Ionicons name="document-outline" size={16} color={full ? colors.muted : colors.forest} />
          <Text style={{ color: full ? colors.muted : colors.forest, fontSize: 13 }}>
            {labels.addDocument}
          </Text>
        </Pressable>
      </View>

      {attachments.length === 0 ? (
        <Text style={typography.caption}>{labels.none}</Text>
      ) : (
        attachments.map((attachment) => (
          <View
            key={attachment.clientUuid}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              padding: spacing.sm,
              backgroundColor: colors.surface,
            }}
          >
            <Ionicons
              name={attachment.mimeType?.startsWith("image/") ? "image" : "document"}
              size={16}
              color={colors.brandGreen}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, color: colors.slate }}>
                {attachment.fileName}
              </Text>
              <Text style={typography.caption}>
                {attachment.sizeBytes != null
                  ? `${(attachment.sizeBytes / 1024).toFixed(0)} KB`
                  : "size unknown"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${labels.remove} ${attachment.fileName}`}
              onPress={() =>
                onChange(attachments.filter((a) => a.clientUuid !== attachment.clientUuid))
              }
            >
              <Ionicons name="close-circle" size={18} color={colors.danger} />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function buttonStyle(disabled: boolean) {
  return {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: disabled ? colors.background : colors.surface,
  };
}

export function toAttachmentRows(
  pending: PendingAttachment[],
  harvestClientUuid: string,
  syncStatus: SyncStatus = "PENDING",
): HarvestAttachment[] {
  const now = new Date().toISOString();
  return pending.map((item) => ({
    clientUuid: item.clientUuid,
    harvestClientUuid,
    localUri: item.localUri,
    mimeType: item.mimeType,
    fileName: item.fileName,
    sizeBytes: item.sizeBytes,
    createdAt: now,
    syncStatus,
    serverUrl: null,
  }));
}
