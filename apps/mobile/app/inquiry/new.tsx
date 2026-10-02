import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "../../src/components/AppHeader";
import { Card, FilterChip, LoadingSkeleton, PrimaryButton, SectionHeader } from "../../src/components/ui";
import { listInquiryDrafts, saveInquiryDraft, saveInquiryReceipt } from "../../src/database";
import { strings } from "../../src/i18n";
import { cropsApi, districtsApi, inquiryApi } from "../../src/services/api";
import { useAppStore } from "../../src/store/useAppStore";
import { colors, radius, spacing, typography } from "../../src/theme";
import { uuidv4 } from "../../src/utils/uuid";

export default function NewInquiryScreen() {
  const router = useRouter();
  const t = strings(useAppStore((s) => s.language));

  const topics = useQuery({ queryKey: ["inquiry-topics"], queryFn: inquiryApi.topics });
  const crops = useQuery({ queryKey: ["crops"], queryFn: cropsApi.list });
  const districts = useQuery({ queryKey: ["districts"], queryFn: districtsApi.list });

  const [topic, setTopic] = useState<string>("");
  const [crop, setCrop] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const selectedTopic = topic || topics.data?.topics[0] || "";

  const submit = async () => {
    if (message.trim().length < 5) {
      setError(t.inquiryMessageTooShort);
      return;
    }
    setError(null);
    setSubmitting(true);
    const clientUuid = uuidv4();
    const payload = {
      topic: selectedTopic,
      crop,
      district,
      message: message.trim(),
      contact_name: name.trim() || null,
      contact_email: email.trim() || null,
      organization: organization.trim() || null,
      client_uuid: clientUuid,
    };
    try {
      const receipt = await inquiryApi.submit(payload);
      saveInquiryReceipt({ ...receipt, reference: receipt.reference });
      router.replace({ pathname: "/inquiry/success", params: { id: receipt.id } });
    } catch {
      // Offline / server unavailable: keep an idempotent local draft.
      try {
        saveInquiryDraft(clientUuid, payload);
      } catch {
        // storage unavailable
      }
      setQueued(true);
    } finally {
      setSubmitting(false);
    }
  };

  const pendingDrafts = (() => {
    try {
      return listInquiryDrafts().length;
    } catch {
      return 0;
    }
  })();

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <AppHeader back />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionHeader title={t.inquiryTitle} subtitle={t.inquiryNewSubtitle} />

          {queued ? (
            <Card style={{ backgroundColor: colors.amberSoft }}>
              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.amber} />
                <Text style={{ ...typography.body, flex: 1 }}>{t.inquiryQueued}</Text>
              </View>
              <Text style={typography.micro}>
                {t.inquiryDraftsQueued.replace("{count}", String(pendingDrafts))}
              </Text>
            </Card>
          ) : null}

          <Card>
            <Text style={typography.h3}>{t.inquiryTopic}</Text>
            {topics.isLoading ? (
              <LoadingSkeleton height={40} />
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {(topics.data?.topics ?? []).map((item) => (
                  <FilterChip key={item} label={item} selected={selectedTopic === item} onPress={() => setTopic(item)} />
                ))}
              </View>
            )}
          </Card>

          <Card>
            <Text style={typography.h3}>{t.inquiryContextOptional}</Text>
            <Text style={typography.caption}>{t.inquiryCrop}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {(crops.data ?? []).slice(0, 8).map((item) => (
                <FilterChip
                  key={item.crop_code}
                  label={item.crop_name}
                  selected={crop === item.crop_name}
                  onPress={() => setCrop(crop === item.crop_name ? null : item.crop_name)}
                />
              ))}
            </View>
            <Text style={typography.caption}>{t.inquiryDistrict}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {(districts.data ?? []).slice(0, 8).map((item) => (
                <FilterChip
                  key={item.district_code}
                  label={item.district}
                  selected={district === item.district}
                  onPress={() => setDistrict(district === item.district ? null : item.district)}
                />
              ))}
            </View>
          </Card>

          <Card>
            <Text style={typography.h3}>{t.inquiryMessage}</Text>
            <TextInput
              accessibilityLabel={t.inquiryMessage}
              style={styles.textarea}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder={t.inquiryMessagePlaceholder}
              placeholderTextColor={colors.slate500}
            />
          </Card>

          <Card>
            <Text style={typography.h3}>{t.inquiryContactOptional}</Text>
            <Text style={typography.caption}>{t.inquiryPrivacyNote}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t.inquiryName} placeholderTextColor={colors.slate500} />
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={t.inquiryEmail} placeholderTextColor={colors.slate500} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} value={organization} onChangeText={setOrganization} placeholder={t.inquiryOrganization} placeholderTextColor={colors.slate500} />
          </Card>

          {error ? (
            <View style={styles.error}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={{ ...typography.caption, color: colors.danger, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          <PrimaryButton label={submitting ? t.inquirySubmitting : t.inquirySubmit} onPress={() => void submit()} loading={submitting} />
          <Pressable accessibilityRole="button" accessibilityLabel={t.inquiryHistory} onPress={() => router.push("/inquiry/history")} style={styles.link}>
            <Text style={styles.linkText}>{t.inquiryHistory}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  textarea: {
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 15,
    color: colors.slate900,
    textAlignVertical: "top",
  },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.slate900,
  },
  error: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  link: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: colors.primaryStrong, fontWeight: "600" },
});
