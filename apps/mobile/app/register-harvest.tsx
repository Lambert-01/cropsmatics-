import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { CROPS, DISTRICTS } from "../src/constants/reference";
import { strings } from "../src/i18n";
import { api } from "../src/services/api";
import { useAppStore } from "../src/store/useAppStore";
import { saveHarvestOffline } from "../src/sync/queue";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import type { PostHarvestRisk } from "../src/types";

type Step = 0 | 1 | 2 | 3 | 4;

const SCHEDULE_OPTIONS = ["Today", "In 3 days", "In 1 week", "In 2 weeks"];

export default function RegisterHarvestScreen() {
  const router = useRouter();
  const language = useAppStore((s) => s.language);
  const t = strings(language);

  const [step, setStep] = useState<Step>(0);
  const [district, setDistrict] = useState<string | null>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [schedule, setSchedule] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [risk, setRisk] = useState<PostHarvestRisk | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [loadingRisk, setLoadingRisk] = useState(false);

  const steps = useMemo(
    () => [t.stepFarm, t.stepCrop, t.stepQuantity, t.stepSchedule, t.stepReview],
    [t],
  );

  const canAdvance = [Boolean(district), Boolean(crop), Boolean(quantity), Boolean(schedule), true][
    step
  ];

  async function onSave() {
    if (!district || !crop) return;
    saveHarvestOffline({
      district,
      crop,
      expectedQuantityKg: quantity ? Number(quantity) : null,
      expectedHarvestDate: schedule,
    });
    setSaved(true);

    // Risk is scored by the server (never locally). If we are offline, the
    // harvest is already safe in SQLite and will be scored after sync.
    setLoadingRisk(true);
    setRiskError(null);
    try {
      const result = await api.scorePostHarvestRisk({
        crop,
        expected_quantity_kg: quantity ? Number(quantity) : null,
      });
      setRisk(result);
    } catch {
      setRiskError(t.riskUnavailableOffline);
    } finally {
      setLoadingRisk(false);
    }
  }

  if (saved) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <View style={cardStyle}>
          <Text style={typography.h2}>✓ {t.savedOffline}</Text>
          <Text style={typography.caption}>
            {crop} · {district} · {quantity ? `${quantity} kg` : "—"}
          </Text>
        </View>

        <View style={cardStyle}>
          <Text style={typography.h2}>{t.riskAnalysis}</Text>
          {loadingRisk ? (
            <Text style={typography.body}>{t.loadingRisk}</Text>
          ) : risk ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color:
                      risk.band === "HIGH"
                        ? colors.riskHigh
                        : risk.band === "MODERATE"
                          ? colors.riskModerate
                          : colors.riskLow,
                  }}
                >
                  {risk.band === "HIGH" ? "▲" : risk.band === "MODERATE" ? "!" : "✓"}{" "}
                  {Math.round(risk.probability * 100)}%
                </Text>
                <Text style={typography.body}>
                  {risk.band === "HIGH" ? t.riskHigh : risk.band === "MODERATE" ? t.riskModerate : t.riskLow}
                </Text>
              </View>
              <Text style={{ fontWeight: "600", color: colors.forest }}>{t.topFactors}</Text>
              {risk.contributing_factors.map((f) => (
                <Text key={f} style={typography.caption}>
                  • {f}
                </Text>
              ))}
              <Text style={{ fontWeight: "600", color: colors.forest }}>{t.recommendations}</Text>
              {risk.recommended_actions.map((a) => (
                <Text key={a} style={typography.caption}>
                  • {a}
                </Text>
              ))}
              <Text style={{ fontWeight: "600", color: colors.forest }}>{t.dataLimitations}</Text>
              {(risk.provenance?.limitations ?? []).map((l) => (
                <Text key={l} style={typography.caption}>
                  • {l}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={typography.body}>{riskError ?? t.riskUnavailable}</Text>
          )}
        </View>

        <Pressable onPress={() => router.push("/")} style={buttonStyle(true)}>
          <Text style={buttonTextStyle(true)}>{t.done}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setSaved(false);
            setRisk(null);
            setStep(0);
            setDistrict(null);
            setCrop(null);
            setQuantity("");
            setSchedule(null);
          }}
          style={buttonStyle(false)}
        >
          <Text style={buttonTextStyle(false)}>{t.startOver}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      {/* Step indicator */}
      <View style={{ flexDirection: "row", gap: spacing.xs, alignItems: "center" }}>
        {steps.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: spacing.xs }}>
            <View
              style={{
                height: 4,
                borderRadius: radius.pill,
                backgroundColor: i <= step ? colors.brandGreen : colors.border,
              }}
            />
            <Text style={{ fontSize: 10, color: i === step ? colors.forest : colors.muted }}>
              {i + 1}. {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={cardStyle}>
        {step === 0 ? (
          <Field label={t.district}>
            <ChipPicker options={DISTRICTS} value={district} onChange={setDistrict} />
          </Field>
        ) : null}

        {step === 1 ? (
          <Field label={t.crop}>
            <ChipPicker options={CROPS} value={crop} onChange={setCrop} />
          </Field>
        ) : null}

        {step === 2 ? (
          <Field label={t.quantity}>
            <TextInput
              value={quantity}
              onChangeText={(v) => setQuantity(v.replace(/[^0-9.]/g, ""))}
              keyboardType="numeric"
              placeholder="0"
              style={inputStyle}
            />
            <Text style={typography.caption}>kg</Text>
          </Field>
        ) : null}

        {step === 3 ? (
          <Field label={t.harvestDate}>
            <ChipPicker options={SCHEDULE_OPTIONS} value={schedule} onChange={setSchedule} />
          </Field>
        ) : null}

        {step === 4 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={typography.h2}>{t.review}</Text>
            <ReviewRow label={t.district} value={district ?? "—"} />
            <ReviewRow label={t.crop} value={crop ?? "—"} />
            <ReviewRow label={t.quantity} value={quantity ? `${quantity} kg` : "—"} />
            <ReviewRow label={t.harvestDate} value={schedule ?? "—"} />
          </View>
        ) : null}
      </View>

      {/* Actions */}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {step > 0 ? (
          <Pressable onPress={() => setStep((s) => (s - 1) as Step)} style={buttonStyle(false)}>
            <Text style={buttonTextStyle(false)}>{t.back}</Text>
          </Pressable>
        ) : null}
        {step < 4 ? (
          <Pressable
            onPress={() => canAdvance && setStep((s) => (s + 1) as Step)}
            disabled={!canAdvance}
            style={buttonStyle(canAdvance)}
          >
            <Text style={buttonTextStyle(canAdvance)}>{t.next}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onSave} disabled={!district || !crop} style={buttonStyle(true)}>
            <Text style={buttonTextStyle(true)}>{t.confirmSave}</Text>
          </Pressable>
        )}
      </View>

      <Text style={typography.caption}>
        Saved locally with a device UUID; sync is idempotent, so nothing is duplicated.
      </Text>
    </ScrollView>
  );
}

const cardStyle = {
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  padding: spacing.md,
  gap: spacing.sm,
  ...shadow.card,
} as const;

const inputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  padding: spacing.md,
  backgroundColor: colors.surface,
  color: colors.slate,
} as const;

function buttonStyle(active: boolean) {
  return {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: active ? colors.brandGreen : colors.border,
  } as const;
}

function buttonTextStyle(active: boolean) {
  return {
    textAlign: "center" as const,
    color: active ? colors.white : colors.muted,
    fontWeight: "600" as const,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontWeight: "600", color: colors.forest }}>{label}</Text>
      {children}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={{ color: colors.slate, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

function ChipPicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: selected ? colors.brandGreen : colors.border,
              backgroundColor: selected ? colors.tint : colors.surface,
            }}
          >
            <Text style={{ color: colors.forest, fontSize: 13 }}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
